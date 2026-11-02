from __future__ import annotations

import asyncio
from typing import List, Sequence
import numpy as np
from fastembed import TextEmbedding
from app.core.config import settings


class EmbeddingService:
    """
    Manages vector embeddings using local ONNX FastEmbed with batched inference.
    """

    _model: TextEmbedding | None = None
    _lock = asyncio.Lock()

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
        Generates embedding for a single search query.
        """
        res = await cls.embed_texts([query])
        return res[0] if res else [0.0] * settings.EMBEDDING_DIM

    @staticmethod
    def cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
        """
        Calculates cosine similarity between two float vectors.
        """
        a = np.array(vec_a, dtype=np.float32)
        b = np.array(vec_b, dtype=np.float32)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
