# Searching tests and project files only when asked: plan fixed before the test queries are collected

Written 2026-11-15, at commit 6b57d12, before any of the queries below were collected, labelled or
scored. It follows [miss_analysis.md](miss_analysis.md).

## Why

On the 125 real questions scored so far, the production hybrid misses the implementing code on 70.
On those misses, tests take 26% of the top-10 slots and project files (mostly `HISTORY.md`) take
11%. Tests are 362 of the 761 indexed chunks of `psf/requests`. Removing tests and project files
after ranking raised code Recall@10 from 0.44 to 0.56 (+0.12 [+0.06, +0.18]). That number comes from
questions already seen, so it is a lead, not a result. It also cannot show the cost: none of those
questions is answered by a test or by the changelog.

This test measures both the gain and the cost on queries nobody has scored.

## File kinds (fixed now, by path only)

- **Test:** any path segment is `tests` or `test`, or the file name matches `test_*.py`,
  `*_test.py` or `conftest.py`.
- **Project file:** a file at the repository root that is not source code and not user docs: the
  changelog (`HISTORY`, `CHANGELOG`, `CHANGES`, `NEWS`, any extension), `AUTHORS*`, `LICENSE*`,
  packaging and tool configuration (`setup.py`, `setup.cfg`, `pyproject.toml`, `tox.ini`,
  `Makefile`, `MANIFEST.in`, `requirements*.txt`, dot-files).
- **Everything else** is always searched: source, `docs/`, `README*`, `ext/`.

`README.md` was counted with "other files" in the miss analysis. It stays searchable here, because a
README answers user questions. So the candidate removes slightly less than the counterfactual did.

## Candidate (one only)

- **`scope_gate`:** rank exactly as production does. Then drop test chunks unless the question asks
  about tests, and drop project-file chunks unless the question asks about the project's history or
  packaging. Take the top 10 of what remains. Call-graph expansion is unchanged.
- A question **asks about tests** if it matches (case-insensitive) `\btests?\b`, `\btesting\b`,
  `pytest`, `unittest`, `\bmock`, `conftest` or `test_`.
- A question **asks about history or packaging** if it matches (case-insensitive) `changelog`,
  `\bhistory\b`, `release`, `\bversions?\b`, `upgrad`, `\bchanged?\b`, `deprecat`, `regression`,
  `breaking`, `\bsince\b`, `install`, `dependenc`, `requirement`, `setup\.py`, `pyproject`, or
  contains a version number (`\b\d+\.\d+(\.\d+)?\b`).
- **Control:** the current production hybrid (commit 6b57d12).

`scope_gate` is added to `scripts/eval_retrieval.py` and committed with this plan, before scoring.
If it is adopted, production gets the same rule. Retrieval would then score more candidates before
the cut, so that 10 results remain after filtering.

## Test queries

Each set is collected by its rule, labelled, and committed before any retrieval run on it. Titles
are used verbatim.

**Set A, code questions: 60** (author `stackoverflow-4`)
- Source: the saved Stack Overflow list, continuing in vote order from rank 1353. More pages of the
  same API query are fetched and appended to the saved list as needed.
- The same rule as before: keep a question only if one place in requests v2.32.3 implements what it
  asks about. Skip installation and environment errors and comparisons with other libraries. The
  repeat rule applies within the set. Both plain and identifier questions are kept.
- Ground truth is source code. `docs_answers` are labelled as before.

**Set B, history and test questions: up to 30** (author `github-history`)
- Source: the saved `psf/requests` issue list (ranks 0 to 999), in comment order.
- Keep an issue if its title reports behaviour that changed between versions, or names a test of
  requests, **and** `HISTORY.md` at v2.32.3 has an entry describing that change, or the test exists
  at v2.32.3. Ground truth is that changelog entry (the bullet's lines) or that test function.
  Implementing code, if any, goes in `docs_answers`, so Answered@10 counts it too.
- Issues already in the suite (the `github-issues` set) are skipped. Stop at 30, or at the end of
  the list if fewer qualify. The count is reported.
- Questions written by Claude are not used. The writer knows the trigger words, so such questions
  would favour the candidate. Real questions about the library's own tests turned out to be rare in
  both sources. If none qualify, the result says the test-question cost was not measured.

## Decision rules (paired bootstrap, 2000 resamples, seed 0, each set scored once)

Differences are `scope_gate` minus the current hybrid.

1. **Gain (set A):** the Recall@10 lower bound must be **above 0**. This is a superiority rule: the
   change hides content, so it has to show a gain.
2. **Cost (set B):** the Recall@10 lower bound must be **above −0.10**. This is non-inferiority: on
   these questions the candidate can only lose, and only when the trigger words miss.
3. **Adopt `scope_gate` only if both hold.** Otherwise production keeps searching everything.
4. Reported but not deciding: Answered@10 and MRR@10 on both sets, how often the triggers fire on
   set A (false alarms that remove the gain) and on set B (misses that cause the cost), and the
   number of set-B questions.
5. Results are reported whatever they show. Adoption is described with its intervals and query
   counts, not as a general claim about other repositories.

## Power, stated in advance

- **Set A:** in the miss analysis, 15 of 125 real questions (12%) gained and none lost. With 60
  questions that predicts about 7 gains. With no losses, the lower bound is above 0 once at least 4
  questions gain, which is likely (roughly 9 in 10) if the 12% rate holds. With 40 questions it
  would be about 7 in 10, so 60 are collected.
- **Set B:** there is no estimate of the control's hit rate on changelog and test answers. If the
  triggers catch nearly every question, the difference will be close to 0 and rule 2 passes. If
  they miss several questions that the control answered, it fails, which is the purpose of the rule.

## Collection notes (2026-11-15, before any retrieval run on these queries)

- **Set A:** Stack Overflow ranks 1353 to 2395 were examined in vote order, and the first 60 that
  qualified were kept as `stackoverflow-4`. Pages 16 to 25 of the same API query were fetched the
  same day and appended to the saved list (now 2,500 questions). 48 of the 60 have docs answers.
- **Set B:** all 1,000 saved issues were examined. 23 qualified (`github-history`): 21 with a
  `HISTORY.md` entry as ground truth and 2 with a test function. 14 also have implementing code in
  `docs_answers`. Where the title alone was unclear, the issue body was read through the GitHub
  API. Issues skipped because the change or test could not be matched to one entry: #1622, #2575,
  #1744, #1410, #1023, #4096, #6043, #2565, #2844, #2887. Repeats of a kept issue were skipped
  (#6167, #2456, #3386). The test-question cost rests on only 2 questions, so it is barely measured.
- **How `scope_gate` is computed:** `_scope_gate` in `scripts/eval_retrieval.py` recomputes the
  production scores over all chunks. It removes the blocked kinds before the `top_k * 3` cut, so
  the pool refills from deeper in the RRF order, as production would. Before scoring, a check on
  the 172 queries already in the suite, with nothing blocked, gave the same top 10 as production
  `retrieve()` on all 172. Call-graph hop chunks never reached the control's top 10 there, so the
  replica leaves them out.
- **Reading the rules:** the results file stores `hybrid_minus_scope_gate` per author under
  `hybrid_vs_baselines_by_author`. The rules use `scope_gate` minus the hybrid, so negate it and
  swap the interval ends. Trigger hits are stored per query as `scope_triggers`.
