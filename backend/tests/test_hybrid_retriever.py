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


def test_extract_referenced_symbols():
    import uuid
    from app.retrieval.hybrid_retriever import RetrievedChunk

    retriever = HybridCodeRetriever()
    primary = [
        RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path="src/api/routes.py",
            language="python",
            start_line=1,
            end_line=20,
            raw_code="""
def login_handler(creds: Credentials):
    token = TokenManager.verify_token(creds)
    if not has_admin_access(token):
        raise HTTPException(403)
""",
            contextualized_text="login_handler",
            symbol_name="login_handler",
            symbol_kind="function",
            final_score=0.95,
        )
    ]

    refs = retriever._extract_referenced_symbols(primary)
    assert "TokenManager" in refs
    assert "verify_token" in refs
    assert "has_admin_access" in refs
    # Built-in or excluded symbols like raise, if, not are not in refs
    assert "login_handler" not in refs
    assert "self" not in refs
