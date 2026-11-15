"""Loading and integrity checks for hand-labelled retrieval suites (eval/suites/*.json)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from app.evaluation.evaluator import LineSpan


@dataclass(frozen=True)
class SuiteQuery:
    id: str
    author: str
    query: str
    ground_truth: List[LineSpan]
    # Other spans that also answer the question (e.g. a user-docs section); used only by answered@k.
    docs_answers: List[LineSpan] = field(default_factory=list)


@dataclass(frozen=True)
class RetrievalSuite:
    name: str
    clone_url: str
    ref: str
    commit_sha: str
    queries: List[SuiteQuery]


def load_suite(path: Path) -> RetrievalSuite:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    repo = raw["repository"]
    queries: List[SuiteQuery] = []
    seen: set[str] = set()
    for q in raw["queries"]:
        if q["id"] in seen:
            raise ValueError(f"duplicate query id {q['id']!r}")
        seen.add(q["id"])
        spans = [LineSpan(g["file"], int(g["start"]), int(g["end"])) for g in q["ground_truth"]]
        if not spans:
            raise ValueError(f"query {q['id']!r} has no ground truth")
        docs = [LineSpan(g["file"], int(g["start"]), int(g["end"])) for g in q.get("docs_answers", [])]
        for s in spans + docs:
            if s.start_line < 1 or s.end_line < s.start_line:
                raise ValueError(f"query {q['id']!r} has an invalid span {s}")
        queries.append(SuiteQuery(q["id"], q.get("author", "unknown"), q["query"].strip(), spans, docs))
    if not queries:
        raise ValueError("suite has no queries")
    return RetrievalSuite(raw["name"], repo["clone_url"], repo["ref"], repo["commit_sha"], queries)


def validate_against_checkout(suite: RetrievalSuite, repo_dir: Path) -> List[str]:
    """Returns problems (missing files, spans past end of file) for the pinned checkout."""
    problems: List[str] = []
    for q in suite.queries:
        for s in q.ground_truth + q.docs_answers:
            f = repo_dir / s.file_path
            if not f.is_file():
                problems.append(f"{q.id}: {s.file_path} does not exist")
                continue
            n_lines = len(f.read_text(encoding="utf-8", errors="replace").splitlines())
            if s.end_line > n_lines:
                problems.append(f"{q.id}: {s.file_path} has {n_lines} lines, span ends at {s.end_line}")
    return problems
