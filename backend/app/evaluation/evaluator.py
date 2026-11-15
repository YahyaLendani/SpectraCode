from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class LineSpan:
    file_path: str
    start_line: int
    end_line: int

    def overlap_lines(self, other: "LineSpan") -> int:
        norm_self = self.file_path.replace("\\", "/").lstrip("/")
        norm_other = other.file_path.replace("\\", "/").lstrip("/")
        if not (norm_self == norm_other or norm_self.endswith(norm_other) or norm_other.endswith(norm_self)):
            return 0
        return max(0, min(self.end_line, other.end_line) - max(self.start_line, other.start_line) + 1)

    def coverage_of(self, ground_truth: "LineSpan") -> float:
        gt_len = max(1, ground_truth.end_line - ground_truth.start_line + 1)
        return self.overlap_lines(ground_truth) / gt_len


@dataclass(frozen=True)
class EvaluationMetricsResult:
    recall_at_k: float
    reciprocal_rank: float
    citation_precision: float
    citation_recall: float
    citation_f1: float
    faithfulness: float


class SpectraCodeBenchmarkEvaluator:
    """Calculates Recall@K, MRR@K, Citation Precision/Recall/F1, and Faithfulness."""

    def __init__(self, coverage_threshold: float = 0.40) -> None:
        self.coverage_threshold = coverage_threshold

    def evaluate_sample(
        self,
        retrieved_spans: Sequence[LineSpan],
        ground_truth_spans: Sequence[LineSpan],
        emitted_citations: Sequence[LineSpan],
        is_abstained: bool,
        k: int = 5,
    ) -> EvaluationMetricsResult:
        # Negative test handling (no ground truth spans)
        if not ground_truth_spans:
            # If the query was out of scope, abstaining is 100% correct
            score = 1.0 if is_abstained else 0.0
            return EvaluationMetricsResult(
                recall_at_k=score,
                reciprocal_rank=score,
                citation_precision=score,
                citation_recall=score,
                citation_f1=score,
                faithfulness=score,
            )

        # 1. Recall@K
        top_k = retrieved_spans[:k]
        hits = 0
        for gt in ground_truth_spans:
            covered_lines = set()
            for r in top_k:
                if r.overlap_lines(gt) > 0:
                    ov_s = max(r.start_line, gt.start_line)
                    ov_e = min(r.end_line, gt.end_line)
                    covered_lines.update(range(ov_s, ov_e + 1))
            gt_len = max(1, gt.end_line - gt.start_line + 1)
            if (len(covered_lines) / gt_len) >= self.coverage_threshold:
                hits += 1
        recall_at_k = hits / len(ground_truth_spans)

        # 2. MRR (Reciprocal Rank)
        rr = 0.0
        for rank, r in enumerate(retrieved_spans[:k], start=1):
            if any(r.coverage_of(gt) >= self.coverage_threshold for gt in ground_truth_spans):
                rr = 1.0 / rank
                break

        # 3. Citation Precision & Recall
        if not emitted_citations:
            cit_p, cit_r, cit_f1 = 0.0, 0.0, 0.0
        else:
            valid_citations = sum(
                1 for c in emitted_citations if any(c.overlap_lines(gt) > 0 for gt in ground_truth_spans)
            )
            cit_p = valid_citations / len(emitted_citations)

            covered_gt = 0
            for gt in ground_truth_spans:
                covered_lines = set()
                for c in emitted_citations:
                    if c.overlap_lines(gt) > 0:
                        ov_s = max(c.start_line, gt.start_line)
                        ov_e = min(c.end_line, gt.end_line)
                        covered_lines.update(range(ov_s, ov_e + 1))
                gt_len = max(1, gt.end_line - gt.start_line + 1)
                if (len(covered_lines) / gt_len) >= self.coverage_threshold:
                    covered_gt += 1
            cit_r = covered_gt / len(ground_truth_spans)
            cit_f1 = (2 * cit_p * cit_r / (cit_p + cit_r)) if (cit_p + cit_r) > 0 else 0.0

        # 4. Faithfulness: Every emitted citation must be covered by retrieved spans
        if not emitted_citations:
            faithfulness = 1.0 if is_abstained else 0.5
        else:
            grounded_cits = sum(
                1
                for c in emitted_citations
                if any(r.overlap_lines(c) >= (c.end_line - c.start_line + 1) * 0.8 for r in retrieved_spans)
            )
            faithfulness = grounded_cits / len(emitted_citations)

        return EvaluationMetricsResult(
            recall_at_k=recall_at_k,
            reciprocal_rank=rr,
            citation_precision=cit_p,
            citation_recall=cit_r,
            citation_f1=cit_f1,
            faithfulness=faithfulness,
        )
