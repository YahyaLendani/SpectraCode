"""Offline retrieval benchmark: BM25 vs dense vs sparse vs the production hybrid retriever.

    cd backend
    python scripts/eval_retrieval.py eval/suites/requests_v2_32_3.json

Clones the suite's repository at its pinned commit into data/eval/, indexes it with the
real ingestion pipeline into a dedicated SQLite database (never the dev database), then
scores every query with each retrieval mode on identical chunks. Indexing is cached per
commit, so later runs only re-score.

Writes eval/results/<suite>.json and prints a summary table.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
# Running a file puts its own folder (scripts/) on sys.path, not backend/, so `app` must be added.
sys.path.insert(0, str(BACKEND))
EVAL_DATA = BACKEND / "data" / "eval"
MODES = ("bm25", "sparse", "dense", "hybrid", "rrf_only", "dense_minmax")
# Candidate fusion fixes, fixed in eval/fusion_preregistration.md before the Stack Overflow queries were scored.
CANDIDATES = ("rrf_only", "dense_minmax")
K_VALUES = (5, 10)


def _isolate_storage(commit_sha: str) -> None:
    """Must run before any `app` import: settings and the DB engine read these at import time."""
    EVAL_DATA.mkdir(parents=True, exist_ok=True)
    db_path = EVAL_DATA / f"eval_{commit_sha[:12]}.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    os.environ["DATA_DIR"] = str(EVAL_DATA)
    os.environ["REPOS_STORAGE_DIR"] = str(EVAL_DATA / "repos")


def _checkout(clone_url: str, ref: str, commit_sha: str) -> Path:
    repo_dir = EVAL_DATA / f"checkout_{commit_sha[:12]}"
    if not repo_dir.exists():
        subprocess.run(
            ["git", "clone", "-q", "--depth", "1", "--branch", ref, clone_url, str(repo_dir)],
            check=True,
            timeout=300,
        )
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_dir, capture_output=True, text=True, check=True
    ).stdout.strip()
    if head != commit_sha:
        sys.exit(f"Checkout {repo_dir} is at {head}, suite pins {commit_sha}. Delete it and rerun.")
    return repo_dir


async def _ensure_indexed(session, owner: str, name: str, clone_url: str, commit_sha: str, repo_dir: Path):
    from sqlalchemy import select

    from app.db.models import IndexingStatus, Repository
    from app.ingestion.worker import RepositoryIndexingWorker

    res = await session.execute(
        select(Repository).where(Repository.github_owner == owner, Repository.github_name == name)
    )
    repo = res.scalar_one_or_none()
    if repo and repo.status == IndexingStatus.READY and repo.last_indexed_commit_sha == commit_sha:
        return repo, 0.0

    if repo is None:
        repo = Repository(
            id=uuid.uuid4(),
            github_owner=owner,
            github_name=name,
            clone_url=clone_url,
            default_branch="main",
            status=IndexingStatus.PENDING,
        )
        session.add(repo)
        await session.commit()

    print(f"Indexing {owner}/{name} at {commit_sha[:12]} (first run only)...", flush=True)
    started = time.perf_counter()
    await RepositoryIndexingWorker.index_repository(session, repo.id, repo_dir=repo_dir)
    await session.refresh(repo)
    if repo.status != IndexingStatus.READY:
        sys.exit(f"Indexing failed with status {repo.status}")
    repo.last_indexed_commit_sha = commit_sha
    await session.commit()
    return repo, time.perf_counter() - started


def _fusion_candidates(retriever, items, query: str, top_k: int) -> dict:
    """Ranks the same scored chunks with the two pre-registered fusion variants.

    rrf_only: weighted RRF order, with no final linear scoring step and no threshold.
    dense_minmax: the final scoring step with dense scores min-max normalised over all chunks first.
    Adopted into production on 2026-11-15 (eval/fusion_replication_preregistration.md), so it now
    matches the hybrid mode and is kept to make the recorded comparison reproducible.
    """
    by_dense = sorted(items, key=lambda c: c.dense_score, reverse=True)
    by_sparse = sorted(items, key=lambda c: c.sparse_score, reverse=True)
    dense_rank = {id(c): i for i, c in enumerate(by_dense, 1)}
    sparse_rank = {id(c): i for i, c in enumerate(by_sparse, 1)}
    alpha = retriever.compute_dynamic_alpha(query)
    rrf = {
        id(c): alpha / (retriever.rrf_k + dense_rank[id(c)]) + (1 - alpha) / (retriever.rrf_k + sparse_rank[id(c)])
        for c in items
    }
    by_rrf = sorted(items, key=lambda c: rrf[id(c)], reverse=True)
    lo, hi = rrf[id(by_rrf[-1])], rrf[id(by_rrf[0])]
    d_lo, d_hi = by_dense[-1].dense_score, by_dense[0].dense_score

    def norm(v, a, b):
        return (v - a) / (b - a) if b - a > 1e-9 else 1.0

    scored = []
    for c in by_rrf[: top_k * 3]:
        rerank = 0.55 * norm(c.dense_score, d_lo, d_hi) + 0.45 * c.sparse_score
        final = retriever.rerank_weight * rerank + (1 - retriever.rerank_weight) * norm(rrf[id(c)], lo, hi)
        if final >= retriever.min_relevance_threshold:
            scored.append((final, c))
    scored.sort(key=lambda t: t[0], reverse=True)
    return {"rrf_only": by_rrf[:top_k], "dense_minmax": [c for _, c in scored[:top_k]]}


def _spans(chunks):
    from app.evaluation.evaluator import LineSpan

    return [LineSpan(c.file_path, c.start_line, c.end_line) for c in chunks]


async def run(suite_path: Path) -> dict:
    # Read pinning info without importing `app` yet.
    raw = json.loads(suite_path.read_text(encoding="utf-8"))
    pin = raw["repository"]
    _isolate_storage(pin["commit_sha"])

    from sqlalchemy import func, select

    from app.core.config import settings
    from app.db.models import CodeChunk, RepositoryFile
    from app.db.session import AsyncSessionLocal, init_db
    from app.evaluation import ranking_metrics as rm
    from app.evaluation.retrieval_suite import load_suite, validate_against_checkout
    from app.ingestion.git_importer import GitRepositoryImporter
    from app.retrieval.bm25 import BM25Index
    from app.retrieval.embeddings import EmbeddingService
    from app.retrieval.hybrid_retriever import HybridCodeRetriever

    suite = load_suite(suite_path)
    repo_dir = _checkout(suite.clone_url, suite.ref, suite.commit_sha)
    problems = validate_against_checkout(suite, repo_dir)
    if problems:
        sys.exit("Ground truth does not match the checkout:\n  " + "\n  ".join(problems))

    owner, name, _ = GitRepositoryImporter.parse_repo_identifier(suite.clone_url)
    await init_db()
    retriever = HybridCodeRetriever()
    k_max = max(K_VALUES)

    async with AsyncSessionLocal() as session:
        repo, index_seconds = await _ensure_indexed(session, owner, name, suite.clone_url, suite.commit_sha, repo_dir)
        n_chunks = (await session.execute(select(func.count()).where(CodeChunk.repository_id == repo.id))).scalar_one()

        # BM25 over the exact chunk set the other modes see (path + code, like lexical_tokens).
        rows = (
            await session.execute(
                select(
                    CodeChunk.id, RepositoryFile.file_path, CodeChunk.start_line, CodeChunk.end_line, CodeChunk.raw_code
                )
                .join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id)
                .where(CodeChunk.repository_id == repo.id)
            )
        ).all()
        bm25 = BM25Index([f"{r.file_path} {r.raw_code}" for r in rows])

        from app.evaluation.evaluator import LineSpan

        per_query = []
        timings = {m: [] for m in MODES}
        for q in suite.queries:
            embedding = await EmbeddingService.embed_query(q.query)
            ranked = {}

            t = time.perf_counter()
            ranked["bm25"] = [
                LineSpan(rows[i].file_path, rows[i].start_line, rows[i].end_line) for i, _ in bm25.rank(q.query, k_max)
            ]
            timings["bm25"].append(time.perf_counter() - t)

            t = time.perf_counter()
            items = await retriever.score_candidates(session, repo.id, q.query, embedding)
            scoring_time = time.perf_counter() - t
            ranked["sparse"] = _spans(sorted(items, key=lambda c: c.sparse_score, reverse=True)[:k_max])
            ranked["dense"] = _spans(sorted(items, key=lambda c: c.dense_score, reverse=True)[:k_max])
            timings["sparse"].append(scoring_time)
            timings["dense"].append(scoring_time)
            for name, chunks in _fusion_candidates(retriever, items, q.query, k_max).items():
                ranked[name] = _spans(chunks)
                timings[name].append(scoring_time)

            t = time.perf_counter()
            hybrid = await retriever.retrieve(session, repo.id, q.query, query_embedding=embedding, top_k=k_max)
            timings["hybrid"].append(time.perf_counter() - t)
            ranked["hybrid"] = _spans(hybrid[:k_max])

            accepted = q.ground_truth + q.docs_answers
            row = {"id": q.id, "author": q.author, "query": q.query, "modes": {}}
            for mode in MODES:
                row["modes"][mode] = {
                    **{f"recall@{k}": rm.recall_at_k(ranked[mode], q.ground_truth, k) for k in K_VALUES},
                    f"mrr@{k_max}": rm.reciprocal_rank(ranked[mode], q.ground_truth, k_max),
                    f"answered@{k_max}": rm.answered_at_k(ranked[mode], accepted, k_max),
                    f"answer_mrr@{k_max}": rm.reciprocal_rank(ranked[mode], accepted, k_max),
                    "top3": [f"{s.file_path}:{s.start_line}-{s.end_line}" for s in ranked[mode][:3]],
                }
            per_query.append(row)

    metric_names = [f"recall@{k}" for k in K_VALUES] + [f"mrr@{k_max}", f"answered@{k_max}", f"answer_mrr@{k_max}"]

    def summarise(rows_subset):
        out = {}
        for mode in MODES:
            out[mode] = {}
            for m in metric_names:
                vals = [r["modes"][mode][m] for r in rows_subset]
                lo, hi = rm.bootstrap_ci(vals)
                out[mode][m] = {"mean": rm.mean(vals), "ci95": [lo, hi]}
        return out

    authors = sorted({r["author"] for r in per_query})

    def compare(rows_subset):
        out = {}
        for baseline in ("bm25", "dense", "sparse") + CANDIDATES:
            for m in metric_names:
                a = [r["modes"]["hybrid"][m] for r in rows_subset]
                b = [r["modes"][baseline][m] for r in rows_subset]
                diff, lo, hi = rm.paired_bootstrap_diff(a, b)
                out[f"hybrid_minus_{baseline}:{m}"] = {"mean": diff, "ci95": [lo, hi]}
        return out

    comparisons = compare(per_query)

    return {
        "suite": suite.name,
        "suite_file": suite_path.as_posix(),
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": {"clone_url": suite.clone_url, "ref": suite.ref, "commit_sha": suite.commit_sha},
        "config": {
            "embedding_model": settings.EMBEDDING_MODEL,
            "max_chunk_chars": settings.MAX_CHUNK_CHARS,
            "retriever": {
                "rrf_k": retriever.rrf_k,
                "rerank_weight": retriever.rerank_weight,
                "min_relevance_threshold": retriever.min_relevance_threshold,
            },
            "coverage_threshold": 0.4,
            "bootstrap": {"resamples": 2000, "seed": 0},
        },
        "n_queries": len(per_query),
        "n_chunks": n_chunks,
        "index_seconds": round(index_seconds, 1),
        "mean_latency_ms": {m: round(1000 * rm.mean(v), 1) for m, v in timings.items()},
        "overall": summarise(per_query),
        "by_author": {a: summarise([r for r in per_query if r["author"] == a]) for a in authors},
        "hybrid_vs_baselines": comparisons,
        "hybrid_vs_baselines_by_author": {a: compare([r for r in per_query if r["author"] == a]) for a in authors},
        "per_query": per_query,
    }


def _print_report(report: dict) -> None:
    metrics = list(next(iter(report["overall"].values())).keys())
    print(f"\n{report['suite']}  ({report['n_queries']} queries, {report['n_chunks']} chunks)")
    print(f"{'mode':<8}" + "".join(f"{m:>24}" for m in metrics))
    for mode, vals in report["overall"].items():
        cells = "".join(f"{v['mean']:>8.2f} [{v['ci95'][0]:.2f}, {v['ci95'][1]:.2f}]".rjust(24) for v in vals.values())
        print(f"{mode:<8}{cells}")
    print("\nHybrid minus baseline (paired, 95% CI; an interval containing 0 means no clear difference):")
    for key, v in report["hybrid_vs_baselines"].items():
        print(f"  {key:<32} {v['mean']:+.2f} [{v['ci95'][0]:+.2f}, {v['ci95'][1]:+.2f}]")
    print(f"\nMean latency per query (ms): {report['mean_latency_ms']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("suite", type=Path)
    parser.add_argument("--out", type=Path, default=None, help="default: eval/results/<suite>.json")
    args = parser.parse_args()

    suite_path = args.suite.resolve()
    report = asyncio.run(run(suite_path))
    try:
        report["suite_file"] = suite_path.relative_to(BACKEND).as_posix()
    except ValueError:
        pass
    out = args.out or (BACKEND / "eval" / "results" / f"{suite_path.stem}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    _print_report(report)
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
