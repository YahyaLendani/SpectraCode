import pytest
from app.evaluation.evaluator import LineSpan, RepoLensBenchmarkEvaluator


def test_evaluator_metrics():
    evaluator = RepoLensBenchmarkEvaluator(coverage_threshold=0.50)

    gt_spans = [
        LineSpan(file_path="src/auth.py", start_line=10, end_line=30),
        LineSpan(file_path="src/config.py", start_line=1, end_line=15),
    ]

    # Retrieved spans cover gt 1 fully and gt 2 partially
    retrieved_spans = [
        LineSpan(file_path="src/auth.py", start_line=5, end_line=35),
        LineSpan(file_path="src/config.py", start_line=1, end_line=10),
    ]

    emitted_citations = [
        LineSpan(file_path="src/auth.py", start_line=12, end_line=25),
        LineSpan(file_path="src/config.py", start_line=1, end_line=12),
    ]

    res = evaluator.evaluate_sample(
        retrieved_spans=retrieved_spans,
        ground_truth_spans=gt_spans,
        emitted_citations=emitted_citations,
        is_abstained=False,
        k=5,
    )

    assert res.recall_at_k > 0.0
    assert res.reciprocal_rank == 1.0
    assert res.citation_precision == 1.0
    assert res.citation_recall > 0.0
    assert res.faithfulness > 0.0


def test_evaluator_negative_abstention():
    evaluator = RepoLensBenchmarkEvaluator()

    # Query was negative/out-of-scope (no ground truth spans)
    res_correct_abstain = evaluator.evaluate_sample(
        retrieved_spans=[],
        ground_truth_spans=[],
        emitted_citations=[],
        is_abstained=True,
    )
    assert res_correct_abstain.recall_at_k == 1.0
    assert res_correct_abstain.faithfulness == 1.0

    res_hallucinated = evaluator.evaluate_sample(
        retrieved_spans=[],
        ground_truth_spans=[],
        emitted_citations=[LineSpan(file_path="src/fake.py", start_line=1, end_line=5)],
        is_abstained=False,
    )
    assert res_hallucinated.recall_at_k == 0.0
