import pytest
from app.ingestion.ast_chunker import CodeQueryNormalizer
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
