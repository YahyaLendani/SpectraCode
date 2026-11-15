# Fusion change, second test: plan fixed before new queries were collected

Written 2026-11-15, at commit 24a8ac5, before any of the new queries were collected, labelled or
scored. It follows [fusion_preregistration.md](fusion_preregistration.md), whose rule kept the
current fusion.

## Why a second test

The first test asked whether a fix makes retrieval clearly better. Neither candidate passed on
15 queries. Across all 62 queries scored so far, `dense_minmax` ranked the relevant code higher
than the current hybrid on 5 queries and lower on none. It tied on the other 57. Combining those
sets now, after seeing them, would be the post-hoc choice the first plan was written to prevent,
so the change is tested again on queries nobody has scored.

The question also changes. The current final scoring step adds dense cosine scores (bunched
between about 0.70 and 0.81) to BM25 scores scaled to [0, 1], so BM25 decides the order. That is
a defect whatever the benchmark shows. `dense_minmax` fixes it. Because the change touches only
about 8% of queries, showing a clear gain would need about 80 queries for a roughly even chance.
So this test asks whether the fix does **not make retrieval worse** (non-inferiority).

## Candidate (one only, no further variants)

- **`dense_minmax`:** the current pipeline, except that dense scores are min-max normalised over
  all of the repository's chunks before the 0.55·dense + 0.45·sparse blend. It is chosen over
  `rrf_only` because it had no losses on the 62 queries scored so far (`rrf_only` had one).
- **Control:** the current hybrid, unchanged.

## New queries

- **Source:** Stack Overflow questions tagged `python-requests`, sorted by votes, fetched once
  through the Stack Exchange API on 2026-11-15. The raw list is saved as
  `eval/sources/so_python_requests_by_votes_2026-11-15.json`.
- **Start point:** the question after the last of the 15 already used (`so_15258728`), in that
  fetched order. Questions above it were already examined under the same rule.
- **Selection rule (the same as the first set):** keep a question only if one place in the
  requests source at v2.32.3 implements what it asks about. Skip installation and environment
  errors, comparisons with other libraries, and topics already covered (including the first 15).
  Take titles verbatim. Stop at **40** questions.
- **Labels:** code ground truth (the implementing function) and `docs_answers` (a user-docs section
  that directly answers the question, if one exists) are written for every question **before
  any retrieval run on them**. The suite and this plan are committed before scoring.
- **Author tag:** `stackoverflow-2`.

**Amendment (same day, during selection, before any scoring):** "topic already covered" turned out
to need a checkable definition. It was applied mechanically: a question is skipped if the function
that implements it is already the ground truth of an earlier kept Stack Overflow question. Reaching
40 needed ranks 25 to 840 of 1,000 fetched questions, because most top-voted questions are
environment errors or repeat a topic. Each query records its rank as `so_vote_rank`. 28 of the 40
have a docs answer.

## Decision rule (on the 40 new queries only; paired bootstrap, 2000 resamples, seed 0)

1. Differences are `dense_minmax` minus the current hybrid. The results file stores
   `hybrid_minus_dense_minmax` under `hybrid_vs_baselines_by_author["stackoverflow-2"]`. The
   percentile bootstrap uses the same resamples, so the interval needed here is that one negated:
   the lower bound below is minus the stored upper bound.
2. Adopt `dense_minmax` in production if **both** hold:
   - the 95% CI lower bound of the Recall@10 difference is above **−0.05**;
   - the 95% CI lower bound of the MRR@10 difference is above **−0.10** (the same margin as the
     first plan).
3. Otherwise keep the current fusion.
4. Answered@10 is reported but does not decide.
5. The new queries are scored once. Results are reported whatever they show. If the change is
   adopted, the README says it fixes the scale mismatch without measurably hurting retrieval. It
   does not say the fix improves retrieval unless the Recall@10 CI is also above 0.

## Result (scored once, 2026-11-15, after commit edd3a10)

On the 40 `stackoverflow-2` queries, `dense_minmax` minus the current hybrid (95% CI):

- Recall@10: +0.00 [0.00, 0.00]. No query changed in either direction.
- MRR@10: +0.01 [−0.03, +0.05].
- Answered@10 (reported, does not decide): −0.05 [−0.13, 0.00]. Two queries lost their docs
  answer: `so_31168819` (array in POST) and `so_64063235` (SSLContext).

Both lower bounds clear their margins (0.00 > −0.05 and −0.03 > −0.10), so by rule 2
**`dense_minmax` is adopted**. By rule 5 the README may say only that it fixes the scale mismatch
without measurably hurting retrieval. On fresh queries it brought no measurable gain: the
improvements seen on the 62 earlier queries did not repeat.

### Not pre-registered: dense-only beats the hybrid

This comparison was not part of the plan and is reported as exploratory. On the same 40 queries,
dense-only search has higher Recall@10 than the current hybrid: 0.39 vs 0.26, a difference of
+0.13 [+0.03, +0.25]. Dense found the code on 6 queries the hybrid missed, and the hybrid found it
on 1 that dense missed. MRR@10 and Answered@10 intervals include 0. The hybrid is also no better
than BM25 alone (−0.01 [−0.10, +0.06]). The Claude-written held-out set pointed the same way
(0.84 vs 0.62). Confirming it needs another untouched query set and a plan written in advance.
