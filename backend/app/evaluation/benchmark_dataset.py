from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class BenchmarkGroundTruthSpan:
    file_path: str
    start_line: int
    end_line: int


@dataclass(frozen=True)
class BenchmarkQueryItem:
    query_id: str
    query_text: str
    category: str  # "symbol_lookup", "cross_file_flow", "debugging", "negative_test"
    ground_truth_spans: List[BenchmarkGroundTruthSpan]
    expected_answer_keywords: List[str] = field(default_factory=list)


# Curated benchmark suite for FastAPI CloudFlow sample repository
FASTAPI_BENCHMARK_SUITE: List[BenchmarkQueryItem] = [
    BenchmarkQueryItem(
        query_id="q1_jwt_auth",
        query_text="Where is JWT token verification implemented and what exception is thrown on expiration?",
        category="debugging",
        ground_truth_spans=[BenchmarkGroundTruthSpan(file_path="src/auth/jwt_manager.py", start_line=11, end_line=34)],
        expected_answer_keywords=["verify_token", "JWTAuthenticationError", "ExpiredSignatureError"],
    ),
    BenchmarkQueryItem(
        query_id="q2_job_retry",
        query_text="How does the distributed scheduler handle retry backoff and concurrency limits?",
        category="cross_file_flow",
        ground_truth_spans=[
            BenchmarkGroundTruthSpan(file_path="src/services/job_scheduler.py", start_line=11, end_line=48)
        ],
        expected_answer_keywords=["execute_with_retry", "max_retries", "exponential backoff", "semaphore"],
    ),
    BenchmarkQueryItem(
        query_id="q3_user_roles",
        query_text="How are user roles defined and how is administrative access verified?",
        category="symbol_lookup",
        ground_truth_spans=[BenchmarkGroundTruthSpan(file_path="src/models/user.py", start_line=5, end_line=19)],
        expected_answer_keywords=["UserRole", "has_admin_access", "ADMIN"],
    ),
    BenchmarkQueryItem(
        query_id="q4_config_settings",
        query_text="What are the default configuration values for token expiry and concurrent jobs?",
        category="symbol_lookup",
        ground_truth_spans=[BenchmarkGroundTruthSpan(file_path="src/config.py", start_line=3, end_line=12)],
        expected_answer_keywords=["ACCESS_TOKEN_EXPIRE_MINUTES", "MAX_CONCURRENT_JOBS"],
    ),
    BenchmarkQueryItem(
        query_id="q5_negative_kubernetes",
        query_text="Where is the Kubernetes Helm chart deployment configuration defined?",
        category="negative_test",
        ground_truth_spans=[],  # Out of scope query to evaluate abstention
        expected_answer_keywords=["INSUFFICIENT_REPOSITORY_CONTEXT"],
    ),
]
