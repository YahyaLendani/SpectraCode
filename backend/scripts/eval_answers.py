"""Answer citation test: do generated answers cite the code that retrieval found?

    cd backend
    GEMINI_API_KEY=... python scripts/eval_answers.py eval/suites/requests_v2_32_3.json

Plan and decision rule: eval/answer_quality_preregistration.md (fixed before this script existed).
Runs the chat endpoint's steps on the suite's real questions: retrieve(top_k=8) with call-graph
expansion, the pre-generation abstention check, Gemini, then citation verification. Each question
is answered once. Questions answered by the built-in template (API error, quota) are retried once
at the end; those that still fail are excluded and counted.

Without GEMINI_API_KEY the script refuses to run, unless --allow-template is given. That mode is a
dry run of the scoring only: its numbers say nothing about the model, and it must use --out.

Writes eval/results/answers_<suite>.json with every answer, its citations and the summary.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval_retrieval as er  # noqa: E402  (sets up sys.path for `app`)

CHAT_TOP_K = 8  # what app/api/routes/chat.py passes to retrieve()
RETENTION_BAR = 0.80
MAX_FAILED_SHARE = 0.10


def _is_real(author: str) -> bool:
    return not author.startswith("claude")


async def _answer(llm, retriever, session, repo_id, q, LineSpan, rm):
    """One question through the chat pipeline. Returns the per-question record."""
    chunks = await retriever.retrieve(session, repo_id, q.query, top_k=CHAT_TOP_K)
    given = [LineSpan(c.file_path, c.start_line, c.end_line) for c in chunks]
    accepted = q.ground_truth + q.docs_answers
    engine = llm.citation_engine

    abstain, reason = engine.should_abstain_pre_generation(chunks, q.query)
    if abstain:
        resp = engine._build_fallback_response(reason or "Context insufficient", chunks)
        source, fallback_reason = "abstained_before_generation", None
    else:
        generated = await llm.generate_grounded_text(q.query, chunks)
        resp = engine.verify_and_sanitize_response(generated.text, chunks, q.query)
        source, fallback_reason = generated.source, generated.fallback_reason

    cited_spans = [LineSpan(c.file_path, c.verified_start_line, c.verified_end_line) for c in resp.model_citations]

    def cites(targets):
        return (not resp.is_abstained) and any(c.overlap_lines(t) > 0 for c in cited_spans for t in targets)

    return {
        "id": q.id,
        "author": q.author,
        "query": q.query,
        "source": source,
        "fallback_reason": fallback_reason,
        "abstained": resp.is_abstained,
        "retrieved": rm.answered_at_k(given, accepted, len(given)) == 1.0 if given else False,
        "retrieved_code": rm.answered_at_k(given, q.ground_truth, len(given)) == 1.0 if given else False,
        "cited": cites(accepted),
        "cited_code": cites(q.ground_truth),
        "n_model_citations": len(resp.model_citations),
        "n_rejected_citations": len(resp.rejected_citations),
        "fallback_reference_only": (not resp.is_abstained) and not resp.model_citations,
        "citations": [f"{c.file_path}:{c.verified_start_line}-{c.verified_end_line}" for c in resp.model_citations],
        "rejected": [c.raw_marker for c in resp.rejected_citations],
        "chunks_given": [f"{s.file_path}:{s.start_line}-{s.end_line}" for s in given],
        "answer": resp.answer_markdown,
    }


def _rate(rows, key, within=None):
    pool = [r for r in rows if within is None or r[within]]
    return (sum(r[key] for r in pool) / len(pool), len(pool)) if pool else (None, 0)


def _summary(rows, rm):
    def retention(cited_key, retrieved_key):
        pool = [1.0 if r[cited_key] else 0.0 for r in rows if r[retrieved_key]]
        if not pool:
            return {"mean": None, "ci95": None, "n": 0}
        lo, hi = rm.bootstrap_ci(pool, n_resamples=2000, seed=0)
        return {"mean": rm.mean(pool), "ci95": [lo, hi], "n": len(pool)}

    answered = [r for r in rows if not r["abstained"]]
    n_model = sum(r["n_model_citations"] for r in rows)
    n_rej = sum(r["n_rejected_citations"] for r in rows)
    return {
        "questions": len(rows),
        "retention": retention("cited", "retrieved"),
        "retention_code_only": retention("cited_code", "retrieved_code"),
        "retrieved_rate": _rate(rows, "retrieved")[0],
        "cited_rate": _rate(rows, "cited")[0],
        "cited_code_rate": _rate(rows, "cited_code")[0],
        "abstention_rate": _rate(rows, "abstained")[0],
        "fallback_reference_only_share_of_answers": _rate(answered, "fallback_reference_only")[0],
        "rejected_share_of_model_citations": (n_rej / (n_model + n_rej)) if (n_model + n_rej) else None,
    }


def _decision(retention: dict, complete: bool, model_run: bool) -> str:
    if not model_run:
        return "dry run with template answers: no decision"
    if not complete:
        return "incomplete run (more than 10% of questions failed): rule not applied"
    if retention["ci95"] is None:
        return "no question had its answer retrieved: rule not applied"
    lo, hi = retention["ci95"]
    if lo >= RETENTION_BAR:
        return "rule 1: generation keeps most of what retrieval finds; next work stays in retrieval"
    if hi < RETENTION_BAR:
        return "rule 2: generation loses retrieved answers; next work goes to the prompt and citation format"
    return "rule 3: inconclusive; no change"


async def run(suite_path: Path, limit: int | None, allow_template: bool, pause: float) -> dict:
    pin = json.loads(suite_path.read_text(encoding="utf-8"))["repository"]
    er._isolate_storage(pin["commit_sha"])
    if allow_template:
        # A dry run never calls the model, even if a key happens to be configured.
        os.environ["LLM_PROVIDER"] = "template"

    from app.core.config import settings
    from app.db.session import AsyncSessionLocal, init_db
    from app.evaluation import ranking_metrics as rm
    from app.evaluation.evaluator import LineSpan
    from app.evaluation.retrieval_suite import load_suite, validate_against_checkout
    from app.generation.llm_service import LLMService
    from app.ingestion.git_importer import GitRepositoryImporter
    from app.retrieval.hybrid_retriever import HybridCodeRetriever

    model_run = settings.LLM_PROVIDER == "gemini" and bool(settings.GEMINI_API_KEY)
    if not model_run and not allow_template:
        sys.exit("GEMINI_API_KEY is not set. Set it for this shell, or pass --allow-template for a dry run.")

    suite = load_suite(suite_path)
    repo_dir = er._checkout(suite.clone_url, suite.ref, suite.commit_sha)
    problems = validate_against_checkout(suite, repo_dir)
    if problems:
        sys.exit("Ground truth does not match the checkout:\n  " + "\n  ".join(problems))
    questions = [q for q in suite.queries if _is_real(q.author)][:limit]

    owner, name, _ = GitRepositoryImporter.parse_repo_identifier(suite.clone_url)
    await init_db()
    retriever = HybridCodeRetriever()
    llm = LLMService()
    started = time.perf_counter()

    async with AsyncSessionLocal() as session:
        repo, _ = await er._ensure_indexed(session, owner, name, suite.clone_url, suite.commit_sha, repo_dir)
        rows = {}
        for i, q in enumerate(questions, 1):
            rows[q.id] = await _answer(llm, retriever, session, repo.id, q, LineSpan, rm)
            print(f"[{i}/{len(questions)}] {q.id}: {rows[q.id]['source']}", flush=True)
            if pause and rows[q.id]["source"] == "gemini":
                await asyncio.sleep(pause)
        retried = []
        if model_run:
            for q in questions:
                if rows[q.id]["source"] == "template":
                    retried.append(q.id)
                    rows[q.id] = await _answer(llm, retriever, session, repo.id, q, LineSpan, rm)
                    if pause:
                        await asyncio.sleep(pause)

    ordered = [rows[q.id] for q in questions]
    failed = [r["id"] for r in ordered if model_run and r["source"] == "template"]
    scored = [r for r in ordered if r["id"] not in failed]
    complete = len(failed) <= MAX_FAILED_SHARE * len(ordered)
    overall = _summary(scored, rm)
    by_author = {}
    for r in scored:
        by_author.setdefault(r["author"], []).append(r)

    return {
        "plan": "eval/answer_quality_preregistration.md",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": pin,
        "model": settings.GEMINI_MODEL if model_run else "template (dry run)",
        "chat_top_k": CHAT_TOP_K,
        "questions_asked": len(ordered),
        "retried_after_template_fallback": retried,
        "excluded_after_retry": failed,
        "complete": complete,
        "seconds": round(time.perf_counter() - started, 1),
        "overall": overall,
        "decision": _decision(overall["retention"], complete, model_run),
        "by_author": {a: _summary(rs, rm) for a, rs in by_author.items()},
        "per_question": ordered,
    }


def _fmt(x):
    return "n/a" if x is None else f"{x:.2f}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("suite", type=Path)
    parser.add_argument("--out", type=Path, default=None, help="default: eval/results/answers_<suite>.json")
    parser.add_argument("--limit", type=int, default=None, help="first N real questions only (dry runs)")
    parser.add_argument("--allow-template", action="store_true", help="dry run without Gemini; needs --out")
    parser.add_argument("--pause", type=float, default=6.0, help="seconds between Gemini calls (rate limits)")
    args = parser.parse_args()
    if (args.allow_template or args.limit) and args.out is None:
        sys.exit("Dry runs (--allow-template or --limit) must write elsewhere with --out.")

    report = asyncio.run(run(args.suite, args.limit, args.allow_template, args.pause))
    out = args.out or er.BACKEND / "eval" / "results" / f"answers_{args.suite.stem}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    o = report["overall"]
    ret = o["retention"]
    ci = "n/a" if ret["ci95"] is None else f"[{ret['ci95'][0]:.2f}, {ret['ci95'][1]:.2f}]"
    print(f"\nModel: {report['model']}  questions: {o['questions']}  excluded: {len(report['excluded_after_retry'])}")
    print(f"Retention (cited / retrieved): {_fmt(ret['mean'])} {ci} over {ret['n']} questions")
    print(
        f"Retrieved {_fmt(o['retrieved_rate'])}  cited {_fmt(o['cited_rate'])}  abstained {_fmt(o['abstention_rate'])}"
    )
    print(f"Decision: {report['decision']}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
