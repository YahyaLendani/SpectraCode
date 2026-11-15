# Routing by question type: plan fixed before the test queries are collected

Written 2026-11-15, at commit 5cdac49, before any of the queries below were collected, labelled or
scored. It follows [fusion_replication_preregistration.md](fusion_replication_preregistration.md).

## Why

On the 40 `stackoverflow-2` queries, dense-only search found the implementing code more often than
the production hybrid: Recall@10 +0.12 [+0.03, +0.25]. That comparison was not planned in advance,
so it is a lead, not a result. SpectraCode should handle any kind of question, but 87 of the 102
current queries are plain-language questions. The retriever's own router classes only 15 as
identifier questions, too few to say anything about them. This test therefore measures the two
kinds of question separately, on queries nobody has scored.

## Question types

The router is the production rule in `HybridCodeRetriever.compute_dynamic_alpha`. A question is an
**identifier question** if it contains a dotted name (`requests.get`), a camelCase word, a
snake_case word, or a `/` or `\`. Every other question is a **plain question**. Questions are
classified by running that code, not by hand, and misclassifications count, because the router is
part of the system being tested.

## Candidate (one only)

- **`route_dense`:** for plain questions, the top 10 are the top 10 by dense score alone (the
  benchmark's `dense` mode). Identifier questions keep the current hybrid. Call-graph expansion is
  unchanged in both cases. It only adds chunks after the top 10, so it does not affect these
  metrics.
- **Control:** the current production hybrid (commit 5cdac49).

`route_dense` is added to `scripts/eval_retrieval.py` and committed with this plan, before scoring.

## Test queries

Each set is collected by its rule, labelled, and committed before any retrieval run on it.

**Plain set: 40 questions** (author `stackoverflow-3`)
- Source: the saved list `eval/sources/so_python_requests_by_votes_2026-11-15.json`, continuing in
  vote order from rank 841 (ranks up to 840 were already examined). If more are needed, further
  pages are fetched with the same API query and appended to the saved list.
- Keep a question only if the router classes it as plain and it passes the earlier Stack Overflow
  rule: one place in requests v2.32.3 implements what it asks about. Skip installation and
  environment errors and comparisons with other libraries.
- Skip a question if its implementing function is already the ground truth of an earlier kept
  question **in this set**. Overlap with older sets is allowed: it cannot favour either side of a
  candidate-versus-control comparison.

**Identifier set: 30 questions** (author `github-issues`)
- Source: issues (not pull requests) in `psf/requests`, sorted by number of comments, descending.
  They are fetched once through the GitHub search API, with the list saved in `eval/sources/`. Stack
  Overflow titles rarely name identifiers (about 1 in 4 kept ones), so a second source is needed.
- Keep an issue only if the router classes its title as an identifier question and one place in
  requests v2.32.3 implements the behaviour the title asks about or reports. Skip installation and
  environment problems, other libraries, and requests for features that requests v2.32.3 does not
  have. The same within-set repeat rule applies.
- Titles are used verbatim.

**Labels:** code ground truth (the implementing function, kept as tight as the rule allows) and
`docs_answers` (a user-docs section that directly answers the question, if any) are written for
every query before scoring.

Plain questions come from Stack Overflow and identifier questions from GitHub issues, so the two
sets differ by source as well as by type. This plan only compares modes **within** each set, so
the confound does not bias any decision. It does mean the two sets' absolute scores should not be
compared with each other.

## Decision rules (paired bootstrap, 2000 resamples, seed 0, each set scored once)

1. **Plain questions** (`stackoverflow-3`, dense minus hybrid):
   route plain questions to dense-only if the Recall@10 lower bound is **above 0** and the MRR@10
   lower bound is above **−0.10**. Otherwise plain questions keep the hybrid. This is a superiority
   rule, unlike the last test. It removes a signal rather than fixing a defect, so it has to show
   a gain.
2. **Identifier questions** (`github-issues`, dense minus hybrid):
   - Recall@10 lower bound above 0 and MRR@10 lower bound above −0.10: identifier questions also
     go to dense-only. Together with rule 1, that means BM25 no longer ranks anything.
   - Recall@10 upper bound below 0: the hybrid is confirmed as better for identifier questions.
   - Otherwise identifier questions keep the hybrid (no change).
3. **No overall loss:** whatever rules 1 and 2 decide is applied only if, over all 70 queries, the
   resulting system minus the current hybrid has a Recall@10 lower bound above −0.05.
4. Answered@10 and latency are reported for both sets but do not decide.
5. These are two decisions, each at 95%, so there is roughly a 1 in 10 chance that at least one
   passes by luck if neither change does anything. That is accepted and stated with the results.
6. Results are reported whatever they show. A rule that passes is described with its interval and
   query count, not as a general claim.

## Collection notes (written after selection and labelling, before any scoring)

- **Plain set:** Stack Overflow ranks 841 to 1,352 were examined and 40 kept. The saved list had
  1,000 questions, so pages 11 to 15 of the same API query were appended (it now holds 1,500).
  33 of the 40 have a docs answer.
- **Identifier set:** issue ranks 0 to 408 were examined and 30 kept. Rank 339 (#5097, a quote in
  a proxy URL) was skipped as ambiguous: the parsing it reports spans several functions. Issue #2334
  (rank 408) asks about thread safety in `HTTPDigestAuth`, which v2.32.3 implements with
  per-thread state, so its ground truth is `HTTPDigestAuth.init_per_thread_state`. 16 of the 30
  have a docs answer.
- Every kept title was run through the router: all 40 Stack Overflow titles are plain and all 30
  issue titles are identifier questions.
- In `scripts/eval_retrieval.py`, `hybrid_vs_baselines_by_author` holds rules 1 and 2 as
  `hybrid_minus_dense` (negate it: the lower bound needed is minus the stored upper bound), and
  `hybrid_vs_baselines_routing_sets` holds rule 3 as `hybrid_minus_route_dense` (or
  `hybrid_minus_dense` if both rules pass), negated the same way.

## Power, stated in advance

On the 30 plain `stackoverflow-2` questions, dense won on 5 and the hybrid on 1. If the same rate
holds, about 8 of 40 plain questions will differ, and rule 1 has a fair (not certain) chance of
passing. The identifier side has no usable estimate: on the 15 identifier questions so far, each
mode won once.
