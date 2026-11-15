from __future__ import annotations

import asyncio
from collections import OrderedDict
from typing import List, Sequence

import numpy as np
from fastembed import TextEmbedding

from app.core.config import settings


class EmbeddingService:
    """
    Manages vector embeddings using local ONNX FastEmbed with batched inference,
    query-level LRU caching, and vectorized NumPy cosine similarity.
    """

    _model: TextEmbedding | None = None
    _lock = asyncio.Lock()
    _query_cache: OrderedDict[str, List[float]] = OrderedDict()
    _MAX_CACHE_SIZE = 256

    @classmethod
    def get_model(cls) -> TextEmbedding:
        if cls._model is None:
            # BAAI/bge-small-en-v1.5 produces 384-dimensional dense vectors
            cls._model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
        return cls._model

    @classmethod
    async def embed_texts(cls, texts: Sequence[str]) -> List[List[float]]:
        """
        Embeds a sequence of text strings asynchronously using a worker thread.
        """
        if not texts:
            return []

        def _sync_embed() -> List[List[float]]:
            model = cls.get_model()
            embeddings_generator = model.embed(texts)
            return [vec.tolist() for vec in embeddings_generator]

        return await asyncio.to_thread(_sync_embed)

    @classmethod
    async def embed_query(cls, query: str) -> List[float]:
        """
        Generates embedding for a single search query with thread-safe fast LRU cache lookup.
        """
        norm_key = query.strip()
        async with cls._lock:
            if norm_key in cls._query_cache:
                cls._query_cache.move_to_end(norm_key)
                return cls._query_cache[norm_key]

        res = await cls.embed_texts([norm_key])
        vec = res[0] if res else [0.0] * settings.EMBEDDING_DIM

        async with cls._lock:
            if len(cls._query_cache) >= cls._MAX_CACHE_SIZE:
                cls._query_cache.popitem(last=False)
            cls._query_cache[norm_key] = vec
        return vec

    @staticmethod
    def cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
        """
        Calculates cosine similarity between two float vectors.
        """
        a = np.asarray(vec_a, dtype=np.float32)
        b = np.asarray(vec_b, dtype=np.float32)
        norm_a = float(np.linalg.norm(a))
        norm_b = float(np.linalg.norm(b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    @staticmethod
    def batch_cosine_similarity(
        query_vec: Sequence[float], matrix: np.ndarray
    ) -> np.ndarray:
        """
        Vectorized cosine similarity between a 1D query vector and a 2D (N, D) chunk embedding matrix.
        Optimized single-pass computation with safe non-zero division.
        """
        if matrix.size == 0:
            return np.zeros(0, dtype=np.float32)
        q = np.asarray(query_vec, dtype=np.float32)
        q_norm = float(np.linalg.norm(q))
        if q_norm == 0.0:
            return np.zeros(matrix.shape[0], dtype=np.float32)
        dot_products = np.dot(matrix, q)
        row_norms = np.linalg.norm(matrix, axis=1)
        denoms = row_norms * q_norm
        return np.divide(
            dot_products,
            denoms,
            out=np.zeros_like(dot_products, dtype=np.float32),
            where=denoms > 0,
        )
