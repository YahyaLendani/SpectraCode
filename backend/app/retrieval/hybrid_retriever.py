from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence
import uuid

import numpy as np
from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChunkEmbedding, CodeChunk, RepositoryFile
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


class HybridCodeRetriever:
    """
    Executes parallel Dense Semantic search + Sparse Lexical matching,
    merges via weighted Reciprocal Rank Fusion (RRF), and applies score calibration.
    """

    CODE_TOKEN_PATTERN = re.compile(
        r"[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-z]+[A-Z][a-zA-Z0-9]*|[a-zA-Z0-9]+_[a-zA-Z0-9_]+"
    )

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

        # 1. Fetch all chunks with their embeddings and files for this repo
        stmt = (
            select(CodeChunk, RepositoryFile, ChunkEmbedding)
            .join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id)
            .outerjoin(ChunkEmbedding, CodeChunk.id == ChunkEmbedding.chunk_id)
            .where(CodeChunk.repository_id == repository_id)
        )
        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        # 2. Compute Dense Similarity
        dense_candidates: List[RetrievedChunk] = []
        sparse_candidates: List[RetrievedChunk] = []

        query_expanded = CodeQueryNormalizer.expand_code_text(query).lower()
        query_terms = set(query_expanded.split())

        for chunk, file_obj, emb_obj in rows:
            # Dense score
            dense_score = 0.0
            if emb_obj and emb_obj.embedding_vector:
                dense_score = EmbeddingService.cosine_similarity(query_embedding, emb_obj.embedding_vector)

            # Sparse score: token overlap & fuzzy match against lexical tokens & file path
            lex_text = (chunk.lexical_tokens or "").lower()
            file_path_lower = file_obj.file_path.lower()

            overlap_hits = sum(1 for term in query_terms if term in lex_text or term in file_path_lower)
            overlap_ratio = overlap_hits / max(1, len(query_terms))
            fuzzy_ratio = fuzz.partial_ratio(query_expanded, lex_text) / 100.0

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
                dense_score=max(0.0, float(dense_score)),
                sparse_score=max(0.0, float(sparse_score)),
            )
            dense_candidates.append(item)
            sparse_candidates.append(item)

        # Sort and rank dense
        dense_candidates.sort(key=lambda x: x.dense_score, reverse=True)
        for rank, item in enumerate(dense_candidates, start=1):
            item.dense_rank = rank

        # Sort and rank sparse
        sparse_candidates.sort(key=lambda x: x.sparse_score, reverse=True)
        for rank, item in enumerate(sparse_candidates, start=1):
            item.sparse_rank = rank

        # 3. Reciprocal Rank Fusion (RRF)
        alpha = self.compute_dynamic_alpha(query)
        chunks_by_id: Dict[uuid.UUID, RetrievedChunk] = {c.chunk_id: c for c in dense_candidates}

        for chunk in chunks_by_id.values():
            d_contrib = (1.0 / (self.rrf_k + chunk.dense_rank)) if chunk.dense_rank else 0.0
            s_contrib = (1.0 / (self.rrf_k + chunk.sparse_rank)) if chunk.sparse_rank else 0.0
            chunk.rrf_score = (alpha * d_contrib) + ((1.0 - alpha) * s_contrib)

        fused = list(chunks_by_id.values())
        fused.sort(key=lambda x: x.rrf_score, reverse=True)

        # Min-Max normalize RRF
        if fused:
            min_rrf = min(c.rrf_score for c in fused)
            max_rrf = max(c.rrf_score for c in fused)
            span = max_rrf - min_rrf
            for c in fused:
                c.rrf_score = (c.rrf_score - min_rrf) / span if span > 1e-9 else 1.0

        # 4. Rerank / Calibrate Score
        reranked: List[RetrievedChunk] = []
        for c in fused[: top_k * 3]:
            # Calibrated composite relevance combining dense similarity, lexical overlap, and RRF rank
            c.rerank_score = (0.55 * c.dense_score) + (0.45 * c.sparse_score)
            c.final_score = (self.rerank_weight * c.rerank_score) + ((1.0 - self.rerank_weight) * c.rrf_score)
            if c.final_score >= self.min_relevance_threshold:
                reranked.append(c)

        reranked.sort(key=lambda x: x.final_score, reverse=True)
        return reranked[:top_k]
