# Why the hybrid misses real questions (exploratory, 2026-11-15)

Not pre-registered. It looks at queries that have already been scored, to choose what to test
next. It changes nothing in production.

## Scope

The 125 real questions in the suite: the three Stack Overflow sets and the GitHub issue titles.
The production hybrid (commit 6b57d12) misses the implementing code on 70 of them (Recall@10 below 1).

## What the misses are not

- **Not chunking.** On every miss, the ground-truth function exists as one or two retrievable
  chunks (61 of 70 as a single chunk). Some ranking would score it.
- **Not just a near miss.** The right chunk is at hybrid rank 11–20 on 16 misses. On the other 52
  it is lower, or the hybrid drops it before rank 60.

## What crowds it out

On the 70 misses, the 700 top-10 slots hold:

| File kind | Slots |
| :--- | :--- |
| Source (`src/`) | 241 (34%) |
| Docs (`docs/`) | 200 (29%) |
| Tests (`tests/`) | 182 (26%) |
| Other, mostly `HISTORY.md` (109 slots) and `README.md` (15) | 77 (11%) |

The first result is a docs page on 31 misses, a test on 10 and the changelog on 6.

## Counterfactual: drop tests and changelog-type files from the ranking

Same hybrid ranking with chunks from `tests/` and non-source, non-docs files removed, then the top
10 is taken. Over all 125 real questions:

| Variant | Recall@10 (code) | Answered@10 |
| :--- | :--- | :--- |
| Current hybrid | 0.44 | 0.71 |
| Without tests | 0.53 | 0.78 |
| Without tests and other files | **0.56** | **0.83** |

The paired difference for removing both is Recall@10 +0.12 [+0.06, +0.18] and Answered@10 +0.12
[+0.06, +0.18]. It gained on 15 questions and lost on none.

## How much this shows

- The no-loss result is partly mechanical. Every ground truth here is source code and every docs
  answer is in `docs/`, so removing tests and changelog chunks can only move answers up. The suite
  has no questions whose answer is a test or the changelog, so it **cannot measure the cost**: a
  user who asks "is there a test for X?" or "when did X change?" would lose.
- So the open question is a product decision, not a statistical one: should tests and the
  changelog compete with source and docs by default?

## Candidate for the next pre-registered test

Search tests and changelog-type files only when the question asks for them (for example, it
mentions "test" or "changelog"/"history"/"version"). Otherwise rank source and docs only. A fair
test needs fresh questions that include some whose answer *is* a test or the changelog, so that
the cost can be measured as well as the gain.
