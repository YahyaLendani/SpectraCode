import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import (
    ASTSymbol,
    Base,
    CodeChunk,
    IndexingStatus,
    Repository,
    RepositoryFile,
    SymbolKind,
)
from app.evaluation.benchmark_dataset import FASTAPI_BENCHMARK_SUITE
from app.evaluation.evaluator import LineSpan, RepoLensBenchmarkEvaluator
from app.evaluation.suite_generator import DynamicBenchmarkGenerator


def test_evaluator_metrics():
    evaluator = RepoLensBenchmarkEvaluator(coverage_threshold=0.50)

    gt_spans = [
        LineSpan(file_path="src/auth.py", start_line=10, end_line=30),
        LineSpan(file_path="src/config.py", start_line=1, end_line=15),
    ]

    # Retrieved spans cover gt 1 fully and gt 2 partially
    retrieved_spans = [
        LineSpan(file_path="src/auth.py", start_line=5, end_line=35),
        LineSpan(file_path="src/config.py", start_line=1, end_line=10),
    ]

    emitted_citations = [
        LineSpan(file_path="src/auth.py", start_line=12, end_line=25),
        LineSpan(file_path="src/config.py", start_line=1, end_line=12),
    ]

    res = evaluator.evaluate_sample(
        retrieved_spans=retrieved_spans,
        ground_truth_spans=gt_spans,
        emitted_citations=emitted_citations,
        is_abstained=False,
        k=5,
    )

    assert res.recall_at_k > 0.0
    assert res.reciprocal_rank == 1.0
    assert res.citation_precision == 1.0
    assert res.citation_recall > 0.0
    assert res.faithfulness > 0.0


def test_evaluator_negative_abstention():
    evaluator = RepoLensBenchmarkEvaluator()

    # Query was negative/out-of-scope (no ground truth spans)
    res_correct_abstain = evaluator.evaluate_sample(
        retrieved_spans=[],
        ground_truth_spans=[],
        emitted_citations=[],
        is_abstained=True,
    )
    assert res_correct_abstain.recall_at_k == 1.0
    assert res_correct_abstain.faithfulness == 1.0

    res_hallucinated = evaluator.evaluate_sample(
        retrieved_spans=[],
        ground_truth_spans=[],
        emitted_citations=[LineSpan(file_path="src/fake.py", start_line=1, end_line=5)],
        is_abstained=False,
    )
    assert res_hallucinated.recall_at_k == 0.0


@pytest.mark.asyncio
async def test_dynamic_benchmark_generator_tailored_ast_suite():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    repo_id = uuid.uuid4()
    f_orders = uuid.uuid4()
    f_shipping = uuid.uuid4()
    f_billing = uuid.uuid4()
    f_security = uuid.uuid4()
    f_events = uuid.uuid4()

    async with session_factory() as session:
        session.add(
            Repository(
                id=repo_id,
                github_owner="acme",
                github_name="commerce-core",
                clone_url="https://github.com/acme/commerce-core.git",
                status=IndexingStatus.READY,
            )
        )
        files = [
            (f_orders, "src/orders/orchestrator.py"),
            (f_shipping, "src/shipping/rates.py"),
            (f_billing, "src/billing/ledger.py"),
            (f_security, "src/security/hmac.py"),
            (f_events, "src/events/bus.py"),
        ]
        for fid, fpath in files:
            session.add(
                RepositoryFile(
                    id=fid,
                    repository_id=repo_id,
                    file_path=fpath,
                    language="python",
                    blob_sha256="sha",
                    line_count=100,
                    byte_size=2000,
                )
            )

        def make_sym(
            file_id: uuid.UUID,
            name: str,
            kind: SymbolKind,
            start_line: int,
            end_line: int,
        ) -> ASTSymbol:
            return ASTSymbol(
                id=uuid.uuid4(),
                repository_id=repo_id,
                file_id=file_id,
                name=name,
                qualified_name=name,
                kind=kind,
                signature=f"{kind.value} {name}",
                docstring=None,
                start_line=start_line,
                end_line=end_line,
                start_byte=0,
                end_byte=100,
            )

        session.add_all(
            [
                # Filtered-out symbols:
                make_sym(f_orders, "__init__", SymbolKind.METHOD, 1, 8),
                make_sym(f_orders, "main", SymbolKind.FUNCTION, 70, 85),
                make_sym(f_shipping, "test", SymbolKind.FUNCTION, 50, 65),
                make_sym(f_billing, "setup", SymbolKind.FUNCTION, 60, 75),
                make_sym(f_security, "TinySymbol", SymbolKind.FUNCTION, 1, 2),  # end - start = 1 < 2
                # Valid symbols across distinct files (with duplicate file symbol in f_orders):
                make_sym(f_orders, "OrderOrchestrator", SymbolKind.CLASS, 10, 42),
                make_sym(f_orders, "SecondaryOrderHelper", SymbolKind.CLASS, 45, 68),
                make_sym(f_shipping, "compute_shipping_quote", SymbolKind.FUNCTION, 5, 28),
                make_sym(f_billing, "BillingLedger", SymbolKind.CLASS, 8, 35),
                make_sym(f_security, "verify_signature", SymbolKind.FUNCTION, 6, 26),
                make_sym(f_events, "dispatch_event", SymbolKind.METHOD, 12, 30),
            ]
        )
        await session.commit()

        suite = await DynamicBenchmarkGenerator.generate(session, repo_id)

    await engine.dispose()

    assert len(suite) == 5

    symbol_items = suite[:4]
    negative_item = suite[4]

    # Excluded symbols must never be emitted
    all_ids_and_texts = " ".join(f"{it.query_id} {it.query_text}" for it in symbol_items)
    for excluded in ("__init__", "TinySymbol", "SecondaryOrderHelper", "dispatch_event"):
        assert excluded not in all_ids_and_texts
    for it in symbol_items:
        assert not it.query_id.endswith(("_main", "_test", "_setup"))
        assert it.category == "symbol_lookup"
        assert len(it.ground_truth_spans) == 1

    # Distinct files enforced across the 4 chosen symbols
    chosen_files = [it.ground_truth_spans[0].file_path for it in symbol_items]
    assert len(chosen_files) == len(set(chosen_files)) == 4

    # Verify exact query wording for CLASS and FUNCTION
    by_sym = {it.query_id.split("_", 2)[2]: it for it in symbol_items}
    assert set(by_sym.keys()) == {
        "OrderOrchestrator",
        "compute_shipping_quote",
        "BillingLedger",
        "verify_signature",
    }
    assert (
        by_sym["OrderOrchestrator"].query_text
        == "Where is class OrderOrchestrator defined and what is its role?"
    )
    assert by_sym["OrderOrchestrator"].ground_truth_spans[0].file_path == "src/orders/orchestrator.py"
    assert by_sym["OrderOrchestrator"].ground_truth_spans[0].start_line == 10
    assert by_sym["OrderOrchestrator"].ground_truth_spans[0].end_line == 42

    assert (
        by_sym["compute_shipping_quote"].query_text
        == "Where is function compute_shipping_quote defined and what does its signature look like?"
    )

    # Verify negative test query at tail
    assert negative_item.query_id == "q_negative_helm"
    assert (
        negative_item.query_text
        == "Where is the Kubernetes Helm chart deployment configuration defined?"
    )
    assert negative_item.category == "negative_test"
    assert negative_item.ground_truth_spans == []


@pytest.mark.asyncio
async def test_dynamic_benchmark_generator_fallback_and_generic_chunks():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    sparse_repo_id = uuid.uuid4()
    sparse_file_id = uuid.uuid4()
    docs_repo_id = uuid.uuid4()
    doc_file_1 = uuid.uuid4()
    doc_file_2 = uuid.uuid4()

    async with session_factory() as session:
        # Case 1: Fewer than 2 valid symbols and no chunks -> falls back to FASTAPI_BENCHMARK_SUITE
        session.add(
            Repository(
                id=sparse_repo_id,
                github_owner="acme",
                github_name="tiny-repo",
                clone_url="https://github.com/acme/tiny-repo.git",
                status=IndexingStatus.READY,
            )
        )
        session.add(
            RepositoryFile(
                id=sparse_file_id,
                repository_id=sparse_repo_id,
                file_path="src/only.py",
                language="python",
                blob_sha256="sha",
                line_count=20,
                byte_size=200,
            )
        )
        session.add(
            ASTSymbol(
                id=uuid.uuid4(),
                repository_id=sparse_repo_id,
                file_id=sparse_file_id,
                name="single_helper",
                qualified_name="single_helper",
                kind=SymbolKind.FUNCTION,
                signature="def single_helper():",
                docstring=None,
                start_line=1,
                end_line=10,
                start_byte=0,
                end_byte=100,
            )
        )

        # Case 2: Non-AST repo with 0 symbols and >= 2 generic chunks -> generic fallback suite
        session.add(
            Repository(
                id=docs_repo_id,
                github_owner="acme",
                github_name="docs-handbook",
                clone_url="https://github.com/acme/docs-handbook.git",
                status=IndexingStatus.READY,
            )
        )
        session.add_all(
            [
                RepositoryFile(
                    id=doc_file_1,
                    repository_id=docs_repo_id,
                    file_path="README.md",
                    language="generic",
                    blob_sha256="sha1",
                    line_count=50,
                    byte_size=1000,
                ),
                RepositoryFile(
                    id=doc_file_2,
                    repository_id=docs_repo_id,
                    file_path="docs/architecture.md",
                    language="generic",
                    blob_sha256="sha2",
                    line_count=60,
                    byte_size=1200,
                ),
            ]
        )
        session.add_all(
            [
                CodeChunk(
                    id=uuid.uuid4(),
                    repository_id=docs_repo_id,
                    file_id=doc_file_1,
                    chunk_index=0,
                    start_line=1,
                    end_line=30,
                    raw_code="# Handbook Overview\nGuide to distributed workflow pipelines.\n",
                    contextualized_text="README.md",
                    content_hash="h1",
                    token_count=20,
                    lexical_tokens="handbook overview distributed workflow pipelines",
                ),
                CodeChunk(
                    id=uuid.uuid4(),
                    repository_id=docs_repo_id,
                    file_id=doc_file_2,
                    chunk_index=0,
                    start_line=1,
                    end_line=40,
                    raw_code="# System Architecture\nEvent routing and storage topology.\n",
                    contextualized_text="docs/architecture.md",
                    content_hash="h2",
                    token_count=20,
                    lexical_tokens="system architecture event routing storage topology",
                ),
            ]
        )
        await session.commit()

        fallback_suite = await DynamicBenchmarkGenerator.generate(session, sparse_repo_id)
        generic_suite = await DynamicBenchmarkGenerator.generate(session, docs_repo_id)

    await engine.dispose()

    assert fallback_suite == list(FASTAPI_BENCHMARK_SUITE)

    assert len(generic_suite) == 3
    assert generic_suite[-1].query_id == "q_negative_helm"
    assert generic_suite[0].ground_truth_spans[0].file_path in ("README.md", "docs/architecture.md")
