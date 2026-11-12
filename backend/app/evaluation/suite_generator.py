from __future__ import annotations

import re
from typing import List, Tuple
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ASTSymbol, CodeChunk, RepositoryFile, SymbolKind
from app.evaluation.benchmark_dataset import (
    FASTAPI_BENCHMARK_SUITE,
    BenchmarkGroundTruthSpan,
    BenchmarkQueryItem,
)


class DynamicBenchmarkGenerator:
    """
    Synthesizes repository-tailored benchmark suites from indexed AST symbols
    (with generic chunk fallback for non-AST repositories and curated fallback
    when insufficient data is indexed).
    """

    EXCLUDED_SYMBOL_NAMES = frozenset({"main", "test", "setup"})
    MAX_SYMBOL_QUERIES = 4

    NEGATIVE_HELM_QUERY = BenchmarkQueryItem(
        query_id="q_negative_helm",
        query_text="Where is the Kubernetes Helm chart deployment configuration defined?",
        category="negative_test",
        ground_truth_spans=[],
    )

    @classmethod
    async def generate(
        cls, session: AsyncSession, repo_id: uuid.UUID
    ) -> List[BenchmarkQueryItem]:
        stmt = (
            select(ASTSymbol, RepositoryFile.file_path)
            .join(RepositoryFile, ASTSymbol.file_id == RepositoryFile.id)
            .where(ASTSymbol.repository_id == repo_id)
        )
        result = await session.execute(stmt)
        rows: List[Tuple[ASTSymbol, str]] = list(result.all())

        valid_candidates: List[Tuple[ASTSymbol, str]] = []
        for sym, file_path in rows:
            if not sym.name or sym.name.startswith("<"):
                continue
            if (sym.end_line - sym.start_line) < 2:
                continue
            if sym.name.startswith("__"):
                continue
            if sym.name.lower() in cls.EXCLUDED_SYMBOL_NAMES:
                continue
            valid_candidates.append((sym, file_path))

        if len(valid_candidates) < 2:
            return await cls._fallback_suite(session, repo_id)

        valid_candidates.sort(key=cls._symbol_sort_key)

        selected: List[Tuple[ASTSymbol, str]] = []
        seen_files: set[str] = set()
        seen_names: set[str] = set()

        # Pass 1: Pick up to 4 symbols across distinct files and distinct symbol names
        for sym, file_path in valid_candidates:
            norm_path = file_path.replace("\\", "/")
            if norm_path in seen_files or sym.name in seen_names:
                continue
            selected.append((sym, norm_path))
            seen_files.add(norm_path)
            seen_names.add(sym.name)
            if len(selected) >= cls.MAX_SYMBOL_QUERIES:
                break

        # Pass 2: Still enforce distinct files if distinct-name check skipped available files
        if len(selected) < cls.MAX_SYMBOL_QUERIES:
            selected_ids = {s.id for s, _ in selected}
            for sym, file_path in valid_candidates:
                norm_path = file_path.replace("\\", "/")
                if sym.id in selected_ids or norm_path in seen_files:
                    continue
                selected.append((sym, norm_path))
                selected_ids.add(sym.id)
                seen_files.add(norm_path)
                if len(selected) >= cls.MAX_SYMBOL_QUERIES:
                    break

        # Pass 3: If all valid symbols live in a single file (< 2 distinct files),
        # fill up to at least 2 items from remaining valid symbols so single-file repos work
        if len(selected) < 2 and len(valid_candidates) >= 2:
            selected_ids = {s.id for s, _ in selected}
            for sym, file_path in valid_candidates:
                norm_path = file_path.replace("\\", "/")
                if sym.id in selected_ids:
                    continue
                overlaps = any(
                    p == norm_path
                    and min(s.end_line, sym.end_line) >= max(s.start_line, sym.start_line)
                    for s, p in selected
                )
                if not overlaps:
                    selected.append((sym, norm_path))
                    selected_ids.add(sym.id)
                    if len(selected) >= cls.MAX_SYMBOL_QUERIES:
                        break

            if len(selected) < 2:
                for sym, file_path in valid_candidates:
                    norm_path = file_path.replace("\\", "/")
                    if sym.id not in selected_ids:
                        selected.append((sym, norm_path))
                        selected_ids.add(sym.id)
                        if len(selected) >= 2:
                            break

        if len(selected) < 2:
            return await cls._fallback_suite(session, repo_id)

        suite: List[BenchmarkQueryItem] = []
        for idx, (sym, file_path) in enumerate(selected, start=1):
            span = BenchmarkGroundTruthSpan(
                file_path=file_path,
                start_line=sym.start_line,
                end_line=sym.end_line,
            )
            if sym.kind == SymbolKind.CLASS:
                query_text = f"Where is class {sym.name} defined and what is its role?"
            else:
                query_text = (
                    f"Where is function {sym.name} defined and what does its signature look like?"
                )

            suite.append(
                BenchmarkQueryItem(
                    query_id=f"q_{idx}_{sym.name}",
                    query_text=query_text,
                    category="symbol_lookup",
                    ground_truth_spans=[span],
                )
            )

        suite.append(cls.NEGATIVE_HELM_QUERY)
        return suite

    @staticmethod
    def _symbol_sort_key(
        item: Tuple[ASTSymbol, str],
    ) -> Tuple[int, int, int, int, int, str, int, str]:
        sym, file_path = item
        norm_path = file_path.replace("\\", "/")
        path_lower = norm_path.lower()

        # Prefer SymbolKind.FUNCTION or SymbolKind.CLASS
        if sym.kind in (SymbolKind.FUNCTION, SymbolKind.CLASS):
            kind_rank = 0
        elif sym.kind == SymbolKind.METHOD:
            kind_rank = 1
        else:
            kind_rank = 2

        # Prefer primary application modules over test/fixture files when available
        is_test_file = 1 if ("test" in path_lower or "fixture" in path_lower) else 0

        # Prefer public API symbols over single-underscore internal helpers
        is_private_helper = 1 if sym.name.startswith("_") else 0

        # Prefer self-contained spans that fit cleanly inside 1-2 retrieval chunks
        span_len = sym.end_line - sym.start_line
        oversized_rank = 0 if span_len <= 75 else 1

        # Prefer substantive definitions deterministically
        size_rank = -min(span_len, 40)

        return (
            kind_rank,
            is_test_file,
            is_private_helper,
            oversized_rank,
            size_rank,
            norm_path,
            sym.start_line,
            sym.name,
        )

    @classmethod
    async def _fallback_suite(
        cls, session: AsyncSession, repo_id: uuid.UUID
    ) -> List[BenchmarkQueryItem]:
        """
        For repositories without Python/TS AST symbols (e.g., Markdown, shell, or config repos),
        synthesizes generic file/chunk lookup items if indexed chunks exist; otherwise falls back
        to FASTAPI_BENCHMARK_SUITE.
        """
        chunk_stmt = (
            select(CodeChunk, RepositoryFile.file_path)
            .join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id)
            .where(CodeChunk.repository_id == repo_id)
            .order_by(CodeChunk.chunk_index.asc())
        )
        chunk_rows: List[Tuple[CodeChunk, str]] = list((await session.execute(chunk_stmt)).all())

        valid_chunks: List[Tuple[CodeChunk, str]] = []
        for chunk, file_path in chunk_rows:
            norm_path = file_path.replace("\\", "/")
            base_name = norm_path.rsplit("/", 1)[-1]
            if base_name.startswith("."):
                continue
            if (chunk.end_line - chunk.start_line) < 2:
                continue
            valid_chunks.append((chunk, norm_path))

        if len(valid_chunks) < 2:
            return list(FASTAPI_BENCHMARK_SUITE)

        boilerplate_names = frozenset(
            {
                "license",
                "code_of_conduct.md",
                "security.md",
                "contributing.md",
                "changelog.md",
                "issue_template.md",
            }
        )

        # Prefer non-test, non-boilerplate files across distinct paths
        valid_chunks.sort(
            key=lambda item: (
                1 if ("test" in item[1].lower() or "fixture" in item[1].lower()) else 0,
                1 if item[1].rsplit("/", 1)[-1].lower() in boilerplate_names else 0,
                item[0].chunk_index,
                item[1],
            )
        )

        chosen_chunks: List[Tuple[CodeChunk, str]] = []
        seen_paths: set[str] = set()
        for chunk, norm_path in valid_chunks:
            if norm_path in seen_paths:
                continue
            chosen_chunks.append((chunk, norm_path))
            seen_paths.add(norm_path)
            if len(chosen_chunks) >= cls.MAX_SYMBOL_QUERIES:
                break

        if len(chosen_chunks) < 2:
            chosen_ids = {c.id for c, _ in chosen_chunks}
            for chunk, norm_path in valid_chunks:
                if chunk.id not in chosen_ids:
                    chosen_chunks.append((chunk, norm_path))
                    chosen_ids.add(chunk.id)
                    if len(chosen_chunks) >= 2:
                        break

        if len(chosen_chunks) < 2:
            return list(FASTAPI_BENCHMARK_SUITE)

        generic_suite: List[BenchmarkQueryItem] = []
        for idx, (chunk, norm_path) in enumerate(chosen_chunks, start=1):
            slug = re.sub(r"[^a-zA-Z0-9_]+", "_", norm_path).strip("_")[:32] or f"chunk_{idx}"
            topic = cls._extract_chunk_topic(chunk.raw_code, norm_path)
            generic_suite.append(
                BenchmarkQueryItem(
                    query_id=f"q_{idx}_{slug}",
                    query_text=f"Where in {norm_path} is {topic} defined and documented?",
                    category="symbol_lookup",
                    ground_truth_spans=[
                        BenchmarkGroundTruthSpan(
                            file_path=norm_path,
                            start_line=chunk.start_line,
                            end_line=chunk.end_line,
                        )
                    ],
                )
            )

        generic_suite.append(cls.NEGATIVE_HELM_QUERY)
        return generic_suite

    @staticmethod
    def _extract_chunk_topic(raw_code: str, file_path: str) -> str:
        for line in raw_code.splitlines():
            cleaned = re.sub(r"^[#*\-\s>`]+", "", line).strip()
            if "http://" in cleaned or "https://" in cleaned:
                continue
            words = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", cleaned)
            if len(words) >= 2:
                return " ".join(words[:5])
        base = file_path.rsplit("/", 1)[-1]
        return base
