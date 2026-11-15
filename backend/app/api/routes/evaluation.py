from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import EvaluationRun, EvaluationSampleResult, Repository
from app.db.session import get_db
from app.evaluation.benchmark_dataset import FASTAPI_BENCHMARK_SUITE, BenchmarkQueryItem
from app.evaluation.evaluator import LineSpan, SpectraCodeBenchmarkEvaluator
from app.evaluation.suite_generator import DynamicBenchmarkGenerator
from app.generation.citation_engine import GroundedCitationEngine
from app.generation.llm_service import LLMService
from app.retrieval.hybrid_retriever import HybridCodeRetriever

router = APIRouter(prefix="/repositories", tags=["Evaluation"])

evaluator = SpectraCodeBenchmarkEvaluator()
retriever = HybridCodeRetriever()
llm_service = LLMService()
citation_engine = GroundedCitationEngine()

LEGACY_SAMPLE_REPO_ID = uuid.UUID("666233e1-4e42-4958-9eb3-3ad686a273b1")
_legacy_cleanup_executed = False


async def cleanup_legacy_mismatched_runs(db: AsyncSession) -> None:
    """One-time idempotent cleanup of legacy FastAPI benchmark runs executed on non-sample repos."""
    global _legacy_cleanup_executed
    if _legacy_cleanup_executed:
        return

    legacy_runs_subq = select(EvaluationRun.id).where(
        EvaluationRun.benchmark_name.like("%Core Codebase Benchmark%"),
        EvaluationRun.repository_id != LEGACY_SAMPLE_REPO_ID,
    )
    del_samples_stmt = delete(EvaluationSampleResult).where(
        EvaluationSampleResult.evaluation_run_id.in_(legacy_runs_subq)
    )
    del_runs_stmt = delete(EvaluationRun).where(
        EvaluationRun.benchmark_name.like("%Core Codebase Benchmark%"),
        EvaluationRun.repository_id != LEGACY_SAMPLE_REPO_ID,
    )
    await db.execute(del_samples_stmt)
    res = await db.execute(del_runs_stmt)
    if res.rowcount:
        await db.commit()
    _legacy_cleanup_executed = True


def _serialize_sample_results(
    samples: List[EvaluationSampleResult],
) -> List[Dict[str, Any]]:
    return [
        {
            "query_id": s.sample_key,
            "query": s.query,
            "recall_at_k": s.recall_at_k,
            "reciprocal_rank": s.reciprocal_rank,
            "citation_precision": s.citation_precision,
            "citation_recall": s.citation_recall,
            "citation_f1": s.citation_f1,
            "faithfulness": s.faithfulness,
            "generated_answer": s.generated_answer,
            "ground_truth_spans": s.ground_truth_spans,
            "emitted_citations": s.emitted_citations,
        }
        for s in samples
    ]


class EvaluationRunRequest(BaseModel):
    rrf_k: Optional[int] = 60
    rerank_weight: Optional[float] = 0.75
    min_relevance_threshold: Optional[float] = 0.15
    relative_citation_cutoff: Optional[float] = 0.90


class EvaluationRunResponse(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    benchmark_name: str
    commit_sha: str
    mean_recall_at_k: float
    mean_mrr: float
    mean_citation_precision: float
    mean_citation_recall: float
    mean_citation_f1: float
    mean_faithfulness: float
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class EvaluationDetailResponse(EvaluationRunResponse):
    sample_results: List[Dict[str, Any]]


@router.post("/{repo_id}/evaluate", response_model=EvaluationDetailResponse)
async def run_evaluation_benchmark(
    repo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await cleanup_legacy_mismatched_runs(db)

    repo = await db.get(Repository, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    clone_url = repo.clone_url or ""
    if clone_url == "sample:fastapi" or "sample" in clone_url.lower():
        suite: List[BenchmarkQueryItem] = FASTAPI_BENCHMARK_SUITE
        suite_name = "SpectraCode Curated FastAPI Suite v1"
    else:
        suite = await DynamicBenchmarkGenerator.generate(db, repo_id)
        suite_name = f"SpectraCode Tailored AST Suite v1 ({repo.github_name})"[:128]

    run_id = uuid.uuid4()
    sample_results_db: List[EvaluationSampleResult] = []

    recalls, mrrs, precisions, recalls_cit, f1s, faithfuls = [], [], [], [], [], []

    for item in suite:
        # 1. Retrieve Chunks
        chunks = await retriever.retrieve(
            session=db,
            repository_id=repo_id,
            query=item.query_text,
            top_k=5,
        )

        retrieved_spans = [
            LineSpan(file_path=c.file_path, start_line=c.start_line, end_line=c.end_line)
            for c in chunks
        ]

        # 2. Check Pre-generation Abstention & Generate Grounded Answer
        abstain, reason = citation_engine.should_abstain_pre_generation(chunks, item.query_text)
        if abstain:
            verified_resp = citation_engine._build_fallback_response(
                reason or "No relevant code found.", chunks
            )
        else:
            grounded_text = (await llm_service.generate_grounded_text(item.query_text, chunks)).text
            verified_resp = citation_engine.verify_and_sanitize_response(
                grounded_text, chunks, item.query_text
            )

        emitted_citations = [
            LineSpan(
                file_path=c.file_path,
                start_line=c.verified_start_line,
                end_line=c.verified_end_line,
            )
            for c in verified_resp.verified_citations
        ]

        ground_truth_spans = [
            LineSpan(file_path=g.file_path, start_line=g.start_line, end_line=g.end_line)
            for g in item.ground_truth_spans
        ]

        # 3. Calculate Benchmark Metrics
        metrics = evaluator.evaluate_sample(
            retrieved_spans=retrieved_spans,
            ground_truth_spans=ground_truth_spans,
            emitted_citations=emitted_citations,
            is_abstained=verified_resp.is_abstained,
            k=5,
        )

        recalls.append(metrics.recall_at_k)
        mrrs.append(metrics.reciprocal_rank)
        precisions.append(metrics.citation_precision)
        recalls_cit.append(metrics.citation_recall)
        f1s.append(metrics.citation_f1)
        faithfuls.append(metrics.faithfulness)

        sample_db = EvaluationSampleResult(
            id=uuid.uuid4(),
            evaluation_run_id=run_id,
            sample_key=item.query_id,
            query=item.query_text,
            ground_truth_spans=[
                {"file_path": g.file_path, "start_line": g.start_line, "end_line": g.end_line}
                for g in item.ground_truth_spans
            ],
            retrieved_spans=[
                {"file_path": r.file_path, "start_line": r.start_line, "end_line": r.end_line}
                for r in retrieved_spans
            ],
            emitted_citations=[
                {"file_path": c.file_path, "start_line": c.start_line, "end_line": c.end_line}
                for c in emitted_citations
            ],
            generated_answer=verified_resp.answer_markdown,
            recall_at_k=round(metrics.recall_at_k, 4),
            reciprocal_rank=round(metrics.reciprocal_rank, 4),
            citation_precision=round(metrics.citation_precision, 4),
            citation_recall=round(metrics.citation_recall, 4),
            citation_f1=round(metrics.citation_f1, 4),
            faithfulness=round(metrics.faithfulness, 4),
        )
        sample_results_db.append(sample_db)

    # 4. Save Run with Aggregate Metrics
    n = max(1, len(suite))
    run_obj = EvaluationRun(
        id=run_id,
        repository_id=repo_id,
        benchmark_name=suite_name,
        commit_sha=repo.last_indexed_commit_sha or "main",
        mean_recall_at_k=round(sum(recalls) / n, 4),
        mean_mrr=round(sum(mrrs) / n, 4),
        mean_citation_precision=round(sum(precisions) / n, 4),
        mean_citation_recall=round(sum(recalls_cit) / n, 4),
        mean_citation_f1=round(sum(f1s) / n, 4),
        mean_faithfulness=round(sum(faithfuls) / n, 4),
    )
    db.add(run_obj)
    db.add_all(sample_results_db)
    await db.commit()

    return EvaluationDetailResponse(
        id=run_obj.id,
        repository_id=run_obj.repository_id,
        benchmark_name=run_obj.benchmark_name,
        commit_sha=run_obj.commit_sha,
        mean_recall_at_k=run_obj.mean_recall_at_k,
        mean_mrr=run_obj.mean_mrr,
        mean_citation_precision=run_obj.mean_citation_precision,
        mean_citation_recall=run_obj.mean_citation_recall,
        mean_citation_f1=run_obj.mean_citation_f1,
        mean_faithfulness=run_obj.mean_faithfulness,
        created_at=run_obj.created_at.isoformat(),
        sample_results=_serialize_sample_results(sample_results_db),
    )


@router.get("/{repo_id}/evaluations", response_model=List[EvaluationDetailResponse])
async def list_repository_evaluations(
    repo_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    await cleanup_legacy_mismatched_runs(db)

    stmt = (
        select(EvaluationRun)
        .options(selectinload(EvaluationRun.sample_results))
        .where(EvaluationRun.repository_id == repo_id)
        .order_by(EvaluationRun.created_at.desc())
    )
    res = await db.execute(stmt)
    runs = res.scalars().all()
    return [
        EvaluationDetailResponse(
            id=r.id,
            repository_id=r.repository_id,
            benchmark_name=r.benchmark_name,
            commit_sha=r.commit_sha,
            mean_recall_at_k=r.mean_recall_at_k,
            mean_mrr=r.mean_mrr,
            mean_citation_precision=r.mean_citation_precision,
            mean_citation_recall=r.mean_citation_recall,
            mean_citation_f1=r.mean_citation_f1,
            mean_faithfulness=r.mean_faithfulness,
            created_at=r.created_at.isoformat(),
            sample_results=_serialize_sample_results(list(r.sample_results or [])),
        )
        for r in runs
    ]
