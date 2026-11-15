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


@pytest.mark.asyncio
async def test_final_scoring_scales_dense_before_blending_with_bm25(monkeypatch):
    """Cosines bunch near 0.7-0.8; unscaled, the BM25 term alone would decide the order."""
    import uuid

    from app.retrieval.hybrid_retriever import RetrievedChunk

    def chunk(name, dense, sparse):
        return RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path=f"{name}.py",
            language="python",
            start_line=1,
            end_line=10,
            raw_code="pass",
            contextualized_text=name,
            symbol_name=name,
            symbol_kind="function",
            dense_score=dense,
            sparse_score=sparse,
        )

    # Best cosine but no keyword overlap, against a worse cosine with the best BM25 score.
    semantic = chunk("semantic", dense=0.81, sparse=0.0)
    lexical = chunk("lexical", dense=0.70, sparse=1.0)

    async def fake_scores(*args, **kwargs):
        return [semantic, lexical]

    async def no_hops(*args, **kwargs):
        return []

    retriever = HybridCodeRetriever()
    monkeypatch.setattr(retriever, "score_candidates", fake_scores)
    monkeypatch.setattr(retriever, "_expand_one_hop_chunks", no_hops)

    ranked = await retriever.retrieve(None, uuid.uuid4(), "how does it work", query_embedding=[0.0], top_k=2)

    # Scaled: semantic 0.75*0.55 + 0.25*1 = 0.6625, lexical 0.75*0.45 + 0 = 0.3375.
    # The old raw blend ranked lexical first (0.626 vs 0.584).
    assert [c.file_path for c in ranked] == ["semantic.py", "lexical.py"]
    assert ranked[0].final_score == pytest.approx(0.6625)
    assert ranked[1].final_score == pytest.approx(0.3375)
    # The raw cosine stays on the chunk for dense ranking and the search API.
    assert ranked[0].dense_score == pytest.approx(0.81)
