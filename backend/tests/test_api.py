import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.routes.repositories import (
    _DEPENDENCY_GRAPH_CACHE,
    _get_repo_storage_dir,
)
from app.db.models import (
    ASTSymbol,
    ChunkEmbedding,
    CodeChunk,
    Conversation,
    EvaluationRun,
    EvaluationSampleResult,
    IndexingStatus,
    Message,
    MessageRole,
    Repository,
    RepositoryFile,
    SymbolKind,
)
from app.db.session import AsyncSessionLocal, init_db
from app.ingestion.worker import IndexingProgressTracker
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["service"] == "SpectraCode"


@pytest.mark.asyncio
async def test_root_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "SpectraCode API"


@pytest.mark.asyncio
async def test_repositories_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/repositories")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_delete_repository():
    repo_id = uuid.uuid4()
    file_id = uuid.uuid4()
    symbol_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    embedding_id = uuid.uuid4()
    conv_id = uuid.uuid4()
    msg_id = uuid.uuid4()
    eval_run_id = uuid.uuid4()
    eval_sample_id = uuid.uuid4()

    repo = Repository(
        id=repo_id,
        github_owner="test-owner",
        github_name=f"test-delete-{repo_id.hex[:8]}",
        clone_url="https://github.com/test-owner/test-delete.git",
        default_branch="main",
        last_indexed_commit_sha="deadbeef1234",
        status=IndexingStatus.READY,
        total_files=1,
        total_chunks=1,
    )

    repo_dir = _get_repo_storage_dir(repo)
    repo_dir.mkdir(parents=True, exist_ok=True)
    dummy_file = repo_dir / "src" / "main.py"
    dummy_file.parent.mkdir(parents=True, exist_ok=True)
    dummy_file.write_text("def hello():\n    return 'world'\n", encoding="utf-8")

    # Populate in-memory caches
    cache_key = (str(repo_id), "deadbeef1234", 1)
    _DEPENDENCY_GRAPH_CACHE[cache_key] = {
        "nodes": [],
        "edges": [],
        "external_packages": [],
        "internal_files_count": 1,
        "circular_dependencies": [],
    }
    IndexingProgressTracker.update(repo_id, stage="ready", pct=100)

    # Populate database with Repository and all child entities
    async with AsyncSessionLocal() as session:
        session.add(repo)
        session.add(
            RepositoryFile(
                id=file_id,
                repository_id=repo_id,
                file_path="src/main.py",
                language="python",
                blob_sha256="abc123",
                line_count=2,
                byte_size=32,
                imports_list=[],
            )
        )
        session.add(
            ASTSymbol(
                id=symbol_id,
                repository_id=repo_id,
                file_id=file_id,
                name="hello",
                qualified_name="hello",
                kind=SymbolKind.FUNCTION,
                signature="def hello():",
                docstring=None,
                start_line=1,
                end_line=2,
                start_byte=0,
                end_byte=31,
            )
        )
        session.add(
            CodeChunk(
                id=chunk_id,
                repository_id=repo_id,
                file_id=file_id,
                symbol_id=symbol_id,
                chunk_index=0,
                start_line=1,
                end_line=2,
                raw_code="def hello():\n    return 'world'\n",
                contextualized_text="src/main.py\ndef hello():\n    return 'world'\n",
                content_hash="hash123",
                token_count=8,
                lexical_tokens="hello world",
            )
        )
        session.add(
            ChunkEmbedding(
                id=embedding_id,
                chunk_id=chunk_id,
                repository_id=repo_id,
                model_name="BAAI/bge-small-en-v1.5",
                dimensions=4,
                embedding_vector=[0.1, 0.2, 0.3, 0.4],
            )
        )
        session.add(
            Conversation(
                id=conv_id,
                repository_id=repo_id,
                title="Test Conversation",
            )
        )
        session.add(
            Message(
                id=msg_id,
                conversation_id=conv_id,
                role=MessageRole.USER,
                content_markdown="Where is hello defined?",
            )
        )
        session.add(
            EvaluationRun(
                id=eval_run_id,
                repository_id=repo_id,
                benchmark_name="test-bench",
                commit_sha="deadbeef1234",
            )
        )
        session.add(
            EvaluationSampleResult(
                id=eval_sample_id,
                evaluation_run_id=eval_run_id,
                sample_key="q1",
                query="Where is hello defined?",
                ground_truth_spans=[],
                retrieved_spans=[],
                emitted_citations=[],
                generated_answer="In src/main.py [src/main.py:1-2].",
                recall_at_k=1.0,
                reciprocal_rank=1.0,
                citation_precision=1.0,
                citation_recall=1.0,
                citation_f1=1.0,
                faithfulness=1.0,
            )
        )
        await session.commit()

    assert repo_dir.exists()
    assert cache_key in _DEPENDENCY_GRAPH_CACHE
    assert repo_id in IndexingProgressTracker._instances

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Execute DELETE
        del_resp = await client.delete(f"/api/v1/repositories/{repo_id}")
        assert del_resp.status_code in (200, 204)

        # Verify GET returns 404
        get_resp = await client.get(f"/api/v1/repositories/{repo_id}")
        assert get_resp.status_code == 404

        # Verify repeating DELETE returns 404
        del_again_resp = await client.delete(f"/api/v1/repositories/{repo_id}")
        assert del_again_resp.status_code == 404

    # Verify disk directory was deleted
    assert not repo_dir.exists()

    # Verify in-memory caches were evicted
    assert cache_key not in _DEPENDENCY_GRAPH_CACHE
    assert repo_id not in IndexingProgressTracker._instances

    # Verify all DB child tables were cascade-cleaned
    async with AsyncSessionLocal() as session:
        assert (
            await session.scalar(
                select(Repository).where(Repository.id == repo_id)
            )
            is None
        )
        assert (
            await session.scalar(
                select(RepositoryFile).where(
                    RepositoryFile.repository_id == repo_id
                )
            )
            is None
        )
        assert (
            await session.scalar(
                select(ASTSymbol).where(ASTSymbol.repository_id == repo_id)
            )
            is None
        )
        assert (
            await session.scalar(
                select(CodeChunk).where(CodeChunk.repository_id == repo_id)
            )
            is None
        )
        assert (
            await session.scalar(
                select(ChunkEmbedding).where(
                    ChunkEmbedding.repository_id == repo_id
                )
            )
            is None
        )
        assert (
            await session.scalar(
                select(Conversation).where(
                    Conversation.repository_id == repo_id
                )
            )
            is None
        )
        assert (
            await session.scalar(select(Message).where(Message.id == msg_id))
            is None
        )
        assert (
            await session.scalar(
                select(EvaluationRun).where(
                    EvaluationRun.repository_id == repo_id
                )
            )
            is None
        )
        assert (
            await session.scalar(
                select(EvaluationSampleResult).where(
                    EvaluationSampleResult.id == eval_sample_id
                )
            )
            is None
        )
