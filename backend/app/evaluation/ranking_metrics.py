"""Retrieval metrics for the offline benchmark, with bootstrap confidence intervals.

Relevance rules (kept identical across every retrieval mode being compared):
- Recall@k: a ground-truth span counts as found when the union of the top-k chunks
  covers at least `coverage_threshold` of its lines. Recall is the fraction of a query's
  ground-truth spans found.
- MRR@k: rank of the first chunk that is itself relevant, meaning it covers at least
  `coverage_threshold` of some ground-truth span, or at least half of the chunk lies
  inside one (so a small chunk inside a long function still counts).
- Answered@k: 1 if any accepted answer (code ground truth or a docs section) is found in
  the top k by the same union-coverage rule, else 0. One answer is enough.
"""

from __future__ import annotations

import random
from typing import List, Sequence, Tuple

from app.evaluation.evaluator import LineSpan


def _span_len(span: LineSpan) -> int:
    return max(1, span.end_line - span.start_line + 1)


def chunk_is_relevant(chunk: LineSpan, ground_truth: Sequence[LineSpan], coverage_threshold: float = 0.4) -> bool:
    for gt in ground_truth:
        overlap = chunk.overlap_lines(gt)
        if overlap and (overlap >= coverage_threshold * _span_len(gt) or overlap >= 0.5 * _span_len(chunk)):
            return True
    return False


def recall_at_k(
    ranked: Sequence[LineSpan],
    ground_truth: Sequence[LineSpan],
    k: int,
    coverage_threshold: float = 0.4,
) -> float:
    if not ground_truth:
        raise ValueError("recall is undefined for a query without ground truth")
    found = 0
    for gt in ground_truth:
        covered: set[int] = set()
        for r in ranked[:k]:
            if r.overlap_lines(gt):
                covered.update(range(max(r.start_line, gt.start_line), min(r.end_line, gt.end_line) + 1))
        if len(covered) / _span_len(gt) >= coverage_threshold:
            found += 1
    return found / len(ground_truth)


def answered_at_k(
    ranked: Sequence[LineSpan],
    accepted: Sequence[LineSpan],
    k: int,
    coverage_threshold: float = 0.4,
) -> float:
    """1.0 if any single accepted span is found (unlike recall, which needs all of them)."""
    return 1.0 if any(recall_at_k(ranked, [a], k, coverage_threshold) for a in accepted) else 0.0


def reciprocal_rank(
    ranked: Sequence[LineSpan],
    ground_truth: Sequence[LineSpan],
    k: int,
    coverage_threshold: float = 0.4,
) -> float:
    for rank, r in enumerate(ranked[:k], start=1):
        if chunk_is_relevant(r, ground_truth, coverage_threshold):
            return 1.0 / rank
    return 0.0


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def bootstrap_ci(
    values: Sequence[float], n_resamples: int = 2000, confidence: float = 0.95, seed: int = 0
) -> Tuple[float, float]:
    """Percentile bootstrap CI of the mean over queries. Seeded so reports are reproducible."""
    if not values:
        return (0.0, 0.0)
    rng = random.Random(seed)
    n = len(values)
    means = sorted(mean([values[rng.randrange(n)] for _ in range(n)]) for _ in range(n_resamples))
    lo_idx = int(((1 - confidence) / 2) * n_resamples)
    hi_idx = min(n_resamples - 1, int((1 - (1 - confidence) / 2) * n_resamples))
    return (means[lo_idx], means[hi_idx])


def paired_bootstrap_diff(
    a: Sequence[float], b: Sequence[float], n_resamples: int = 2000, seed: int = 0
) -> Tuple[float, float, float]:
    """Mean of per-query (a - b) with a 95% CI. If the CI excludes 0, the gap is unlikely to be noise."""
    if len(a) != len(b):
        raise ValueError("paired comparison needs the same queries in the same order")
    diffs: List[float] = [x - y for x, y in zip(a, b, strict=True)]
    lo, hi = bootstrap_ci(diffs, n_resamples=n_resamples, seed=seed)
    return (mean(diffs), lo, hi)
