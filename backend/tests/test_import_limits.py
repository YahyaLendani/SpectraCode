"""Import limits: oversized repositories fail fast with a clear message and leave nothing behind."""
import asyncio
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.api.routes import repositories as repo_routes
from app.core.config import settings
from app.db.models import CodeChunk, IndexingStatus, Repository
from app.db.session import AsyncSessionLocal, init_db
from app.ingestion.git_importer import GitRepositoryImporter, RepositoryLimitError
from app.ingestion.worker import RepositoryIndexingWorker


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


def _make_repo(tmp_path, n_files: int, lines_per_file: int = 3):
    repo_dir = tmp_path / "repo"
    (repo_dir / ".git").mkdir(parents=True)
    (repo_dir / ".git" / "pack").write_bytes(b"x" * 50_000)  # history must not count toward size
    for i in range(n_files):
        body = "\n".join(f"    return {j}" for j in range(lines_per_file))
        (repo_dir / f"mod_{i}.py").write_text(f"def f_{i}():\n{body}\n", encoding="utf-8")
    return repo_dir


async def _new_repo() -> uuid.UUID:
    async with AsyncSessionLocal() as session:
        repo = Repository(
            id=uuid.uuid4(),
            github_owner="acme",
            github_name=f"limits-{uuid.uuid4().hex[:6]}",
            clone_url="https://github.com/acme/limits.git",
            default_branch="main",
            status=IndexingStatus.PENDING,
        )
        session.add(repo)
        await session.commit()
        return repo.id


async def _load(repo_id):
    async with AsyncSessionLocal() as session:
        return await session.get(Repository, repo_id)


def test_checkout_size_ignores_git_directory(tmp_path):
    repo_dir = _make_repo(tmp_path, n_files=2)
    size = GitRepositoryImporter.checkout_size_bytes(repo_dir)
    assert 0 < size < 1_000


def test_enforce_checkout_size_raises_clear_error(tmp_path, monkeypatch):
    repo_dir = _make_repo(tmp_path, n_files=2)
    monkeypatch.setattr(settings, "MAX_CHECKOUT_MB", 0.00001)  # ~10 bytes
    with pytest.raises(RepositoryLimitError, match="MB"):
        GitRepositoryImporter.enforce_checkout_size(repo_dir)


@pytest.mark.asyncio
async def test_too_many_files_fails_with_message_and_indexes_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MAX_INDEXED_FILES", 3)
    repo_dir = _make_repo(tmp_path, n_files=5)
    repo_id = await _new_repo()

    async with AsyncSessionLocal() as session:
        with pytest.raises(RepositoryLimitError):
            await RepositoryIndexingWorker.index_repository(session, repo_id, repo_dir=repo_dir)

    repo = await _load(repo_id)
    assert repo.status == IndexingStatus.FAILED
    assert "more than 3" in repo.error_message
    async with AsyncSessionLocal() as session:
        chunks = (await session.execute(select(CodeChunk).where(CodeChunk.repository_id == repo_id))).all()
    assert chunks == []


@pytest.mark.asyncio
async def test_too_many_chunks_fails_before_embedding(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MAX_CHUNKS", 2)
    repo_dir = _make_repo(tmp_path, n_files=4, lines_per_file=40)
    repo_id = await _new_repo()

    async def must_not_embed(*_args, **_kwargs):
        raise AssertionError("embedding should not start when the chunk limit is exceeded")

    monkeypatch.setattr("app.ingestion.worker.EmbeddingService.embed_texts", must_not_embed)

    async with AsyncSessionLocal() as session:
        with pytest.raises(RepositoryLimitError):
            await RepositoryIndexingWorker.index_repository(session, repo_id, repo_dir=repo_dir)

    repo = await _load(repo_id)
    assert repo.status == IndexingStatus.FAILED
    assert "chunks" in repo.error_message and "limit is 2" in repo.error_message


@pytest.mark.asyncio
async def test_indexing_timeout_marks_repository_failed(monkeypatch):
    monkeypatch.setattr(settings, "INDEXING_TIMEOUT_SECONDS", 0.05)
    repo_id = await _new_repo()

    async def hangs(session, rid, repo_dir=None):
        await asyncio.sleep(10)

    monkeypatch.setattr(repo_routes.RepositoryIndexingWorker, "index_repository", hangs)
    await repo_routes.run_indexing_task(repo_id)

    repo = await _load(repo_id)
    assert repo.status == IndexingStatus.FAILED
    assert "took longer than" in repo.error_message


@pytest.mark.asyncio
async def test_run_indexing_task_does_not_reraise_limit_errors(monkeypatch):
    repo_id = await _new_repo()

    async def over_limit(session, rid, repo_dir=None):
        raise RepositoryLimitError("too big")

    monkeypatch.setattr(repo_routes.RepositoryIndexingWorker, "index_repository", over_limit)
    await repo_routes.run_indexing_task(repo_id)  # must not raise out of the background task
