# Do answers cite the code that retrieval found? Plan fixed before any answer is generated

Written 2026-11-15, before the answer script exists and before any answer to these questions was
generated. Everything so far measures retrieval only. This measures the step after it.

## Question

When retrieval puts the right code in front of the model, does the answer cite it? If it often does
not, the next work belongs in generation (prompt, citation format). If it usually does, the next
work stays in retrieval.

## Setup (fixed now)

- **Questions:** the 208 real questions already in `eval/suites/requests_v2_32_3.json` (the four
  Stack Overflow sets, `github-issues` and `github-history`), with their committed labels. No new
  questions, no relabelling.
- **Pipeline:** exactly what the chat endpoint does: `retrieve(top_k=8)` with call-graph expansion,
  the pre-generation abstention check, `generate_grounded_text`, then
  `verify_and_sanitize_response`. Model `gemini-2.5-flash` as configured, default sampling. Each
  question is answered once; there are no reruns to pick a better result.
- **Accepted spans:** the question's ground truth plus its `docs_answers`, as for Answered@10.
- **Script:** `scripts/eval_answers.py`, committed with this plan before it is run. It writes
  `eval/results/answers_requests_v2_32_3.json` with the full answer text and citations per question.

## Measures (per question)

- **Retrieved:** an accepted span is covered (40% rule, as in the retrieval benchmark) by the
  chunks given to the model.
- **Cited:** at least one of the model's own verified citations overlaps an accepted span by at
  least one line. The engine's `FALLBACK_REFERENCE` does not count. An abstained answer is not cited.
- **Headline: retention** = cited / retrieved, over the questions where the span was retrieved,
  with a 95% bootstrap interval (2000 resamples, seed 0, resampling questions).
- **Reported, not deciding:** cited rate over all 208 questions; abstention rate; the share of
  answers with no surviving model citation (fallback only); the share of the model's citations
  rejected by the check; the same figures for code-only ground truth; and results per question set.

## Decision rule

1. **Retention lower bound ≥ 0.80:** generation keeps most of what retrieval finds. Next work stays
   in retrieval.
2. **Retention upper bound < 0.80:** generation loses retrieved answers. Next work goes to the
   prompt and citation format, tested the same way.
3. **Otherwise:** inconclusive, reported as such, with no change to either.

## Validity rules

- If any answer falls back to the template (API error, quota), that question is retried once after
  the run. Questions that still fail are excluded and counted in the result. If more than 10% fail,
  the run is reported as incomplete and the rule is not applied.
- A question where the model refuses or abstains counts as not cited. It is not excluded.
- Default sampling means a rerun can differ. The result is reported as one run, not as a fixed
  property of the model.
- This does not check that an answer is correct, only that it cites the right code. An answer can
  cite the right lines and still explain them wrongly.

## Cost

About 208 Gemini calls (fewer if the abstention check stops some). It needs `GEMINI_API_KEY` set in
the shell for the run only; it is never written to a file or a log.
