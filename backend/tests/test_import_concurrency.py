"""Import robustness: interrupted indexing is recoverable, and repeated or racing imports queue one task."""

import uuid

import pytest
import pytest_asyncio
from fastapi import BackgroundTasks
from sqlalchemy import select

from app.api.routes import repositories as repo_routes
from app.db.models import IndexingStatus, Repository
from app.db.session import AsyncSessionLocal, init_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


async def _new_repo(status: IndexingStatus, name: str | None = None) -> uuid.UUID:
    async with AsyncSessionLocal() as session:
        repo = Repository(
            id=uuid.uuid4(),
            github_owner="acme",
            github_name=name or f"conc-{uuid.uuid4().hex[:6]}",
            clone_url="https://github.com/acme/conc.git",
            default_branch="main",
            status=status,
            error_message="old error" if status == IndexingStatus.FAILED else None,
        )
        session.add(repo)
        await session.commit()
        return repo.id


async def _load(repo_id) -> Repository:
    async with AsyncSessionLocal() as session:
        return await session.get(Repository, repo_id)


@pytest.mark.asyncio
async def test_startup_recovery_fails_only_interrupted_repositories():
    # Listed explicitly, not taken from the code under test, so a status dropped there is caught.
    in_progress = [IndexingStatus.PENDING, IndexingStatus.CLONING, IndexingStatus.PARSING_AST, IndexingStatus.EMBEDDING]
    stuck = [await _new_repo(s) for s in in_progress]
    ready = await _new_repo(IndexingStatus.READY)
    failed = await _new_repo(IndexingStatus.FAILED)

    assert await repo_routes.recover_interrupted_indexing() >= len(stuck)

    for repo_id in stuck:
        repo = await _load(repo_id)
        assert repo.status == IndexingStatus.FAILED
        assert repo.error_message == repo_routes.INTERRUPTED_MESSAGE
    assert (await _load(ready)).status == IndexingStatus.READY
    assert (await _load(failed)).error_message == "old error"
    assert await repo_routes.recover_interrupted_indexing() == 0


@pytest.mark.asyncio
async def test_reimport_queues_one_task_and_skips_repositories_still_indexing():
    repo_id = await _new_repo(IndexingStatus.FAILED)
    first, second = BackgroundTasks(), BackgroundTasks()
    # Two racing requests: both read the row as FAILED before either one claims it.
    async with AsyncSessionLocal() as db_a, AsyncSessionLocal() as db_b:
        repo_a = await db_a.get(Repository, repo_id)
        repo_b = await db_b.get(Repository, repo_id)
        await db_b.commit()  # end b's read transaction so SQLite lets a write
        assert repo_a.status == repo_b.status == IndexingStatus.FAILED
        await repo_routes._reindex_existing(db_a, repo_a, first)
        await repo_routes._reindex_existing(db_b, repo_b, second)

    assert len(first.tasks) == 1
    assert len(second.tasks) == 0
    repo = await _load(repo_id)
    assert repo.status == IndexingStatus.PENDING
    assert repo.error_message is None

    busy = BackgroundTasks()
    embedding_id = await _new_repo(IndexingStatus.EMBEDDING)
    async with AsyncSessionLocal() as db:
        await repo_routes._reindex_existing(db, await db.get(Repository, embedding_id), busy)
    assert len(busy.tasks) == 0
    assert (await _load(embedding_id)).status == IndexingStatus.EMBEDDING


@pytest.mark.asyncio
async def test_first_import_race_returns_existing_row_instead_of_500():
    name = f"race-{uuid.uuid4().hex[:6]}"
    winner_id = await _new_repo(IndexingStatus.PENDING, name=name)
    tasks = BackgroundTasks()

    async with AsyncSessionLocal() as db:
        real_execute = db.execute
        calls = {"n": 0}

        class _Empty:
            def scalar_one_or_none(self):
                return None

        async def execute(stmt, *args, **kwargs):
            # The losing request checked for the repo before the winner committed it.
            calls["n"] += 1
            if calls["n"] == 1:
                return _Empty()
            return await real_execute(stmt, *args, **kwargs)

        db.execute = execute
        payload = repo_routes.RepositoryImportRequest(repository_url=f"acme/{name}")
        result = await repo_routes.import_repository(payload, tasks, db)

    assert result.id == winner_id
    assert len(tasks.tasks) == 0
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(Repository).where(Repository.github_name == name))).scalars().all()
    assert len(rows) == 1
