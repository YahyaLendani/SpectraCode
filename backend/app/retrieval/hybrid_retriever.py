from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from typing import Dict, List, Optional
import uuid

import numpy as np
from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from app.db.models import ASTSymbol, ChunkEmbedding, CodeChunk, RepositoryFile
from app.ingestion.ast_chunker import CodeQueryNormalizer
from app.retrieval.embeddings import EmbeddingService


@dataclass
class RetrievedChunk:
    chunk_id: uuid.UUID
    file_path: str
    language: str
    start_line: int
    end_line: int
    raw_code: str
    contextualized_text: str
    symbol_name: Optional[str]
    symbol_kind: Optional[str]
    dense_score: float = 0.0
    sparse_score: float = 0.0
    dense_rank: Optional[int] = None
    sparse_rank: Optional[int] = None
    rrf_score: float = 0.0
    rerank_score: float = 0.0
    final_score: float = 0.0
    is_linked_hop: bool = False
    linked_from_symbol: Optional[str] = None


class HybridCodeRetriever:
    """
    Executes parallel Dense Semantic search + Sparse Lexical matching,
    merges via weighted Reciprocal Rank Fusion (RRF), and applies score calibration.
    """

    CODE_TOKEN_PATTERN = re.compile(
        r"[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-z]+[A-Z][a-zA-Z0-9]*|[a-zA-Z0-9]+_[a-zA-Z0-9_]+"
    )
    CALL_OR_TYPE_RE = re.compile(
        r"\b([A-Za-z_][A-Za-z0-9_]{2,})\s*\(|\b([A-Z][A-Za-z0-9_]{2,})\b"
    )
    _IGNORED_SYMBOLS = frozenset({
        "self", "cls", "super", "init", "__init__", "len", "str", "int", "float",
        "bool", "list", "dict", "set", "tuple", "max", "min", "sum", "any", "all",
        "print", "range", "enumerate", "zip", "isinstance", "getattr", "setattr",
        "List", "Dict", "Set", "Tuple", "Optional", "Sequence", "Any", "Union",
        "Callable", "Promise", "Array", "Record", "Error", "Exception", "ValueError",
        "True", "False", "None", "async", "await", "return", "raise", "yield",
    })

    def __init__(
        self,
        rrf_k: int = 60,
        rerank_weight: float = 0.75,
        min_relevance_threshold: float = 0.15,
    ) -> None:
        self.rrf_k = rrf_k
        self.rerank_weight = rerank_weight
        self.min_relevance_threshold = min_relevance_threshold

    def compute_dynamic_alpha(self, query: str, base_alpha: float = 0.55) -> float:
        """Shifts weight toward sparse lexical search if query contains explicit code identifiers or paths."""
        if self.CODE_TOKEN_PATTERN.search(query) or "/" in query or "\\" in query:
            return 0.35
        return base_alpha

    async def retrieve(
        self,
        session: AsyncSession,
        repository_id: uuid.UUID,
        query: str,
        query_embedding: Optional[List[float]] = None,
        top_k: int = 10,
    ) -> List[RetrievedChunk]:
        if query_embedding is None:
            query_embedding = await EmbeddingService.embed_query(query)

        # 1. Fetch all chunks with their embeddings and files for this repo (with optimized relationship loading)
        stmt = (
            select(CodeChunk, RepositoryFile, ChunkEmbedding)
            .join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id)
            .outerjoin(ChunkEmbedding, CodeChunk.id == ChunkEmbedding.chunk_id)
            .where(CodeChunk.repository_id == repository_id)
            .options(
                selectinload(CodeChunk.symbol),
                noload(RepositoryFile.chunks),
                noload(RepositoryFile.symbols),
            )
        )
        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        # 2. Vectorized Dense Similarity + Fast-Path Sparse Lexical Overlap
        items: List[RetrievedChunk] = []

        query_expanded = CodeQueryNormalizer.expand_code_text(query).lower()
        query_terms = set(query_expanded.split())
        num_terms = max(1, len(query_terms))

        q_dim = len(query_embedding)
        emb_matrix = np.zeros((len(rows), q_dim), dtype=np.float32)
        for idx, (_, _, emb_obj) in enumerate(rows):
            if emb_obj and emb_obj.embedding_vector and len(emb_obj.embedding_vector) == q_dim:
                emb_matrix[idx] = emb_obj.embedding_vector

        dense_scores = EmbeddingService.batch_cosine_similarity(query_embedding, emb_matrix)

        for idx, (chunk, file_obj, _) in enumerate(rows):
            dense_score = float(dense_scores[idx])

            # Sparse score: fast token overlap + selective fuzzy match
            lex_text = (chunk.lexical_tokens or "").lower()
            file_path_lower = file_obj.file_path.lower()

            overlap_hits = sum(
                1 for term in query_terms if term in lex_text or term in file_path_lower
            )
            overlap_ratio = overlap_hits / num_terms

            # Optimization: Only compute expensive partial Levenshtein ratio when there are lexical hits or high dense score
            if overlap_hits > 0 or dense_score > 0.35:
                fuzzy_ratio = fuzz.partial_ratio(query_expanded, lex_text) / 100.0
            else:
                fuzzy_ratio = 0.0

            sparse_score = (0.6 * overlap_ratio) + (0.4 * fuzzy_ratio)

            item = RetrievedChunk(
                chunk_id=chunk.id,
                file_path=file_obj.file_path,
                language=file_obj.language,
                start_line=chunk.start_line,
                end_line=chunk.end_line,
                raw_code=chunk.raw_code,
                contextualized_text=chunk.contextualized_text,
                symbol_name=chunk.symbol.name if chunk.symbol else None,
                symbol_kind=chunk.symbol.kind.value if chunk.symbol else None,
                dense_score=max(0.0, dense_score),
                sparse_score=max(0.0, float(sparse_score)),
            )
            items.append(item)

        # 3. Dense & Sparse Ranking
        items_by_dense = sorted(items, key=lambda x: x.dense_score, reverse=True)
        for rank, it in enumerate(items_by_dense, start=1):
            it.dense_rank = rank

        items_by_sparse = sorted(items, key=lambda x: x.sparse_score, reverse=True)
        for rank, it in enumerate(items_by_sparse, start=1):
            it.sparse_rank = rank

        # 4. Reciprocal Rank Fusion (RRF)
        alpha = self.compute_dynamic_alpha(query)
        for chunk in items:
            d_contrib = (1.0 / (self.rrf_k + chunk.dense_rank)) if chunk.dense_rank else 0.0
            s_contrib = (1.0 / (self.rrf_k + chunk.sparse_rank)) if chunk.sparse_rank else 0.0
            chunk.rrf_score = (alpha * d_contrib) + ((1.0 - alpha) * s_contrib)

        items.sort(key=lambda x: x.rrf_score, reverse=True)

        # Min-Max normalize RRF
        if items:
            min_rrf = min(c.rrf_score for c in items)
            max_rrf = max(c.rrf_score for c in items)
            span = max_rrf - min_rrf
            for c in items:
                c.rrf_score = (c.rrf_score - min_rrf) / span if span > 1e-9 else 1.0

        # 5. Rerank / Calibrate Score
        reranked: List[RetrievedChunk] = []
        for c in items[: top_k * 3]:
            c.rerank_score = (0.55 * c.dense_score) + (0.45 * c.sparse_score)
            c.final_score = (self.rerank_weight * c.rerank_score) + (
                (1.0 - self.rerank_weight) * c.rrf_score
            )
            if c.final_score >= self.min_relevance_threshold:
                reranked.append(c)

        reranked.sort(key=lambda x: x.final_score, reverse=True)
        primary = reranked[:top_k]

        # 6. 1-Hop AST Call-Graph Expansion
        hop_chunks = await self._expand_one_hop_chunks(
            session=session,
            repository_id=repository_id,
            primary_chunks=primary,
            all_scored_items=items,
            max_hops=2,
        )
        return primary + hop_chunks

    def _extract_referenced_symbols(
        self, primary_chunks: List[RetrievedChunk]
    ) -> Dict[str, str]:
        """Returns {candidate_symbol_name: source_chunk_symbol_or_file}."""
        existing_symbols = {c.symbol_name for c in primary_chunks if c.symbol_name}
        candidates: Dict[str, str] = {}

        for chunk in primary_chunks[:3]:
            origin = chunk.symbol_name or chunk.file_path
            for m in self.CALL_OR_TYPE_RE.finditer(chunk.raw_code):
                sym = m.group(1) or m.group(2)
                if sym and sym not in self._IGNORED_SYMBOLS and sym not in existing_symbols:
                    candidates.setdefault(sym, origin)
        return candidates

    async def _expand_one_hop_chunks(
        self,
        session: AsyncSession,
        repository_id: uuid.UUID,
        primary_chunks: List[RetrievedChunk],
        all_scored_items: List[RetrievedChunk],
        max_hops: int = 2,
    ) -> List[RetrievedChunk]:
        if not primary_chunks or max_hops <= 0:
            return []

        candidates = self._extract_referenced_symbols(primary_chunks)
        if not candidates:
            return []

        primary_ids = {c.chunk_id for c in primary_chunks}
        hop_chunks: List[RetrievedChunk] = []
        matched_symbols: set[str] = set()

        # Pass 1: Fast in-memory lookup from already-loaded & scored chunks
        by_symbol: Dict[str, RetrievedChunk] = {}
        for item in all_scored_items:
            if item.chunk_id not in primary_ids and item.symbol_name in candidates:
                prev = by_symbol.get(item.symbol_name)
                if prev is None or item.final_score > prev.final_score:
                    by_symbol[item.symbol_name] = item

        for sym_name, item in sorted(
            by_symbol.items(), key=lambda kv: kv[1].final_score, reverse=True
        )[:max_hops]:
            matched_symbols.add(sym_name)
            hop_chunks.append(
                dataclasses.replace(
                    item,
                    is_linked_hop=True,
                    linked_from_symbol=candidates[sym_name],
                )
            )

        if len(hop_chunks) >= max_hops:
            return hop_chunks

        # Pass 2: Single batched SQL query on ASTSymbol -> CodeChunk by line containment
        remaining = [s for s in candidates if s not in matched_symbols]
        if remaining:
            stmt = (
                select(ASTSymbol, CodeChunk, RepositoryFile)
                .join(
                    CodeChunk,
                    (CodeChunk.file_id == ASTSymbol.file_id)
                    & (CodeChunk.start_line <= ASTSymbol.start_line)
                    & (CodeChunk.end_line >= ASTSymbol.start_line),
                )
                .join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id)
                .where(
                    ASTSymbol.repository_id == repository_id,
                    ASTSymbol.name.in_(remaining),
                    CodeChunk.id.notin_(primary_ids | {h.chunk_id for h in hop_chunks}),
                )
                .limit((max_hops - len(hop_chunks)) * 2)
            )
            rows = (await session.execute(stmt)).all()
            seen_chunk_ids = primary_ids | {h.chunk_id for h in hop_chunks}

            base_discount = primary_chunks[-1].final_score * 0.5 if primary_chunks else 0.1
            for sym_obj, chunk_obj, file_obj in rows:
                if chunk_obj.id in seen_chunk_ids:
                    continue
                seen_chunk_ids.add(chunk_obj.id)
                hop_chunks.append(
                    RetrievedChunk(
                        chunk_id=chunk_obj.id,
                        file_path=file_obj.file_path,
                        language=file_obj.language,
                        start_line=chunk_obj.start_line,
                        end_line=chunk_obj.end_line,
                        raw_code=chunk_obj.raw_code,
                        contextualized_text=chunk_obj.contextualized_text,
                        symbol_name=sym_obj.name,
                        symbol_kind=sym_obj.kind.value if hasattr(sym_obj.kind, "value") else str(sym_obj.kind),
                        final_score=round(base_discount, 4),
                        is_linked_hop=True,
                        linked_from_symbol=candidates.get(sym_obj.name),
                    )
                )
                if len(hop_chunks) >= max_hops:
                    break

        return hop_chunks
