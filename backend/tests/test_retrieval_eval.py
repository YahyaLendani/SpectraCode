"""Unit tests for the offline retrieval benchmark: BM25 baseline, metrics, suite loading."""

import json
from pathlib import Path

import pytest

from app.evaluation import ranking_metrics as rm
from app.evaluation.evaluator import LineSpan
from app.evaluation.retrieval_suite import load_suite, validate_against_checkout
from app.retrieval.bm25 import BM25Index, tokenize

SUITES_DIR = Path(__file__).resolve().parents[1] / "eval" / "suites"


# --- BM25 -------------------------------------------------------------------------


def test_bm25_ranks_matching_document_first_and_splits_identifiers():
    docs = [
        "def parse_header_links(value): return links",
        "def get_netrc_auth(url): read the netrc file",
        "class CaseInsensitiveDict: lower case keys",
    ]
    index = BM25Index(docs)
    ranked = index.rank("where is the netrc auth read", top_k=3)
    assert ranked[0][0] == 1
    # snake_case is split, so a query word matches part of an identifier
    assert index.rank("header", top_k=3)[0][0] == 0


def test_bm25_drops_documents_with_no_shared_terms():
    index = BM25Index(["alpha beta", "gamma delta"])
    assert [i for i, _ in index.rank("beta", top_k=5)] == [0]
    assert index.rank("zeta", top_k=5) == []


def test_bm25_rare_terms_weigh_more_than_common_ones():
    docs = ["common rare", "common", "common", "common"]
    scores = BM25Index(docs).score("common rare")
    assert scores[0] > scores[1] == scores[2] == scores[3]


# --- metrics ----------------------------------------------------------------------

GT = [LineSpan("src/pkg/utils.py", 100, 149)]  # 50 lines


def test_recall_uses_union_coverage_of_top_k():
    # two chunks each cover 25% of the span; together 50% >= 40%
    ranked = [LineSpan("src/pkg/utils.py", 100, 112), LineSpan("src/pkg/utils.py", 113, 124)]
    assert rm.recall_at_k(ranked, GT, k=2) == 1.0
    assert rm.recall_at_k(ranked, GT, k=1) == 0.0


def test_recall_is_partial_with_multiple_ground_truth_spans():
    gts = GT + [LineSpan("src/pkg/models.py", 1, 10)]
    ranked = [LineSpan("src/pkg/models.py", 1, 10)]
    assert rm.recall_at_k(ranked, gts, k=5) == 0.5


def test_recall_requires_ground_truth():
    with pytest.raises(ValueError):
        rm.recall_at_k([], [], k=5)


def test_answered_needs_only_one_accepted_span():
    code = LineSpan("a.py", 1, 10)
    docs = LineSpan("docs/x.rst", 100, 119)
    ranked = [LineSpan("docs/x.rst", 95, 115), LineSpan("b.py", 1, 5)]
    assert rm.recall_at_k(ranked, [code, docs], 10) == 0.5
    assert rm.answered_at_k(ranked, [code, docs], 10) == 1.0
    assert rm.answered_at_k(ranked, [code], 10) == 0.0
    assert rm.answered_at_k(ranked, [code, docs], 1) == 1.0
    assert rm.answered_at_k(ranked[1:], [code, docs], 10) == 0.0


def test_reciprocal_rank_counts_small_chunk_inside_long_span():
    ranked = [
        LineSpan("src/pkg/other.py", 1, 40),
        LineSpan("src/pkg/utils.py", 120, 129),  # 10 lines, fully inside the 50-line span
    ]
    assert rm.reciprocal_rank(ranked, GT, k=10) == 0.5


def test_reciprocal_rank_ignores_chunk_that_barely_touches_span():
    ranked = [LineSpan("src/pkg/utils.py", 140, 260)]  # 10 of 121 lines overlap, 20% of GT
    assert rm.reciprocal_rank(ranked, GT, k=10) == 0.0


def test_bootstrap_ci_brackets_mean_and_is_reproducible():
    values = [0.0, 1.0] * 15
    lo, hi = rm.bootstrap_ci(values)
    assert lo < 0.5 < hi
    assert rm.bootstrap_ci(values) == (lo, hi)
    assert rm.bootstrap_ci([1.0] * 10) == (1.0, 1.0)


def test_paired_diff_detects_consistent_gap_and_rejects_mismatched_lengths():
    a = [1.0] * 20
    b = [0.0] * 18 + [1.0] * 2
    diff, lo, hi = rm.paired_bootstrap_diff(a, b)
    assert diff == pytest.approx(0.9)
    assert lo > 0
    with pytest.raises(ValueError):
        rm.paired_bootstrap_diff([1.0], [1.0, 0.0])


# --- suite loading -----------------------------------------------------------------


def test_committed_suites_load_and_are_well_formed():
    paths = sorted(SUITES_DIR.glob("*.json"))
    assert paths, "no suites committed"
    for path in paths:
        suite = load_suite(path)
        assert len(suite.commit_sha) == 40
        assert len(suite.queries) >= 20


def _write_suite(tmp_path, queries):
    data = {
        "name": "t",
        "repository": {"clone_url": "https://github.com/a/b.git", "ref": "v1", "commit_sha": "0" * 40},
        "queries": queries,
    }
    p = tmp_path / "suite.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_load_suite_rejects_duplicate_ids_and_bad_spans(tmp_path):
    q = {"id": "x", "query": "q", "ground_truth": [{"file": "a.py", "start": 1, "end": 2}]}
    with pytest.raises(ValueError, match="duplicate"):
        load_suite(_write_suite(tmp_path, [q, q]))
    bad = {"id": "y", "query": "q", "ground_truth": [{"file": "a.py", "start": 5, "end": 2}]}
    with pytest.raises(ValueError, match="invalid span"):
        load_suite(_write_suite(tmp_path, [bad]))


def test_validate_against_checkout_reports_missing_files_and_overlong_spans(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("1\n2\n3\n", encoding="utf-8")
    suite = load_suite(
        _write_suite(
            tmp_path,
            [
                {"id": "ok", "query": "q", "ground_truth": [{"file": "a.py", "start": 1, "end": 3}]},
                {"id": "long", "query": "q", "ground_truth": [{"file": "a.py", "start": 1, "end": 9}]},
                {"id": "gone", "query": "q", "ground_truth": [{"file": "b.py", "start": 1, "end": 1}]},
            ],
        )
    )
    problems = validate_against_checkout(suite, repo)
    assert len(problems) == 2
    assert any(p.startswith("long:") for p in problems)
    assert any(p.startswith("gone:") for p in problems)


def test_bm25_from_token_lists_matches_text_constructor():
    docs = ["def get_netrc_auth(url): pass", "class Session: redirects", "unrelated text"]
    from_text = BM25Index(docs).score("netrc auth session")
    from_tokens = BM25Index.from_token_lists([tokenize(d) for d in docs]).score("netrc auth session")
    assert from_text == pytest.approx(from_tokens)
    assert from_text[0] > 0 and from_text[1] > 0 and from_text[2] == 0


def test_docs_answers_are_loaded_and_validated(tmp_path):
    q = {
        "id": "x",
        "query": "q",
        "ground_truth": [{"file": "a.py", "start": 1, "end": 2}],
        "docs_answers": [{"file": "docs/missing.rst", "start": 1, "end": 3}],
    }
    suite = load_suite(_write_suite(tmp_path, [q]))
    assert suite.queries[0].docs_answers == [LineSpan("docs/missing.rst", 1, 3)]
    (tmp_path / "a.py").write_text("x\ny\n", encoding="utf-8")
    assert validate_against_checkout(suite, tmp_path) == ["x: docs/missing.rst does not exist"]
    bad = {**q, "docs_answers": [{"file": "d.rst", "start": 5, "end": 2}]}
    with pytest.raises(ValueError, match="invalid span"):
        load_suite(_write_suite(tmp_path, [bad]))
