import numpy as np
import pytest
from app.ingestion.ast_chunker import CodeQueryNormalizer
from app.retrieval.embeddings import EmbeddingService
from app.retrieval.hybrid_retriever import HybridCodeRetriever


def test_code_query_normalizer():
    # camelCase and snake_case expansion
    res = CodeQueryNormalizer.expand_code_text("getUserById AND verify_jwt_token")
    words = res.split()
    assert "getuserbyid" in words
    assert "user" in words
    assert "jwt" in words
    assert "token" in words


def test_dynamic_alpha():
    retriever = HybridCodeRetriever()

    # Conceptual question -> dense focus (alpha = 0.55)
    alpha_conceptual = retriever.compute_dynamic_alpha("How does the token expire?")
    assert alpha_conceptual == 0.55

    # Identifier question -> sparse lexical focus (alpha = 0.35)
    alpha_code = retriever.compute_dynamic_alpha("Where is verify_jwt_signature located?")
    assert alpha_code == 0.35


def test_batch_cosine_similarity():
    query = [1.0, 0.0, 0.0]
    matrix = np.array(
        [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.5, 0.5, 0.0],
        ],
        dtype=np.float32,
    )
    scores = EmbeddingService.batch_cosine_similarity(query, matrix)
    assert len(scores) == 3
    assert np.isclose(scores[0], 1.0)
    assert np.isclose(scores[1], 0.0)
    assert np.isclose(scores[2], 0.70710677)
