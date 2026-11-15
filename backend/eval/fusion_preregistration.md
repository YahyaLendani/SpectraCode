# Fusion change: plan fixed before the user-written queries

Written 2026-11-15, at commit 8e8e9d0, before the test queries were scored.

**Amendment (same day, before any scoring):** the user asked Claude to source the test queries
instead of writing them. They are the 15 `"author": "stackoverflow"` queries: real question
titles copied verbatim from the top-voted python-requests questions on Stack Overflow, picked by
the fixed rule recorded in the suite notes. "User-written queries" below means these.

This plan exists to stop the decision from being tuned on the queries that are meant to test it.

## Problem found

On the 47 Claude-written queries, the hybrid retriever has lower recall than dense-only search
(held-out Recall@10: 0.62 vs 0.84). Out of 8 relevant chunks that dense ranked in its top 10
but the hybrid missed, all 8 were pushed down by the final scoring step. None was removed by
`min_relevance_threshold` or by the 30-candidate pool cut. That step adds raw dense cosine
scores (bunched between about 0.70 and 0.81) to max-normalised BM25 scores (spread from 0 to 1),
so BM25 effectively decides the order.

## Candidates (fixed now, no further variants)

- **A, current:** unchanged production code (control).
- **B, `rrf_only`:** rank by weighted RRF only, with no final scoring step and no threshold.
- **C, `dense_minmax`:** same as current, except that dense scores are min-max normalised over
  all of the repository's chunks before the 0.55·dense + 0.45·sparse blend.
- **D, `dense`:** dense-only (reference).

## Decision rule (on the user-written queries only, paired bootstrap with 2000 resamples, seed 0)

1. Primary metric: Recall@10. Secondary metric: MRR@10.
2. Adopt B or C only if its Recall@10 minus current Recall@10 has a 95% CI above 0, and its
   MRR@10 minus current MRR@10 has a CI lower bound above −0.10.
3. If both B and C qualify, prefer B (simpler: it removes code instead of adding a step).
4. If neither qualifies, keep current. If D beats current on Recall@10 with a CI above 0, record
   that and reconsider whether to keep the lexical signal at all.
5. The user queries are scored once. Results are reported whatever they show.

## Result (scored once, 2026-11-15)

On the 15 Stack Overflow queries, Recall@10 differences against the current hybrid (95% CI):

- `rrf_only`: +0.13 [0.00, +0.33]
- `dense_minmax`: +0.13 [0.00, +0.33]

Neither lower bound is above 0, so by rule 2 **the current fusion is kept**. Dense-only was level
with the current hybrid (Recall@10 0.40 vs 0.40), so rule 4 does not apply.

All modes did poorly on these queries (hybrid Recall@10 0.40, BM25 0.27), against 0.87 on the
first 31 Claude-written ones. For usage questions ("How can I POST JSON data…"), the top hits are
often docs, tests or `api.py` rather than the implementing function used as ground truth, so part
of the gap comes from the benchmark scoring only implementation code as relevant.
