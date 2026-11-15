import uuid

from app.generation.citation_engine import CitationStatus, GroundedCitationEngine
from app.retrieval.hybrid_retriever import RetrievedChunk


def test_citation_verification_exact_and_clamped():
    engine = GroundedCitationEngine()

    chunk_id = uuid.uuid4()
    chunks = [
        RetrievedChunk(
            chunk_id=chunk_id,
            file_path="src/auth/jwt.py",
            language="python",
            start_line=10,
            end_line=50,
            raw_code="def verify():\n    pass",
            contextualized_text="...",
            symbol_name="verify",
            symbol_kind="function",
            final_score=0.85,
        )
    ]

    # Test 1: Exact containment [src/auth/jwt.py:15-30] inside [10-50]
    llm_output_exact = "The token is validated by the verify method [src/auth/jwt.py:15-30]."
    resp_exact = engine.verify_and_sanitize_response(llm_output_exact, chunks)
    assert not resp_exact.is_abstained
    assert len(resp_exact.verified_citations) == 1
    assert resp_exact.verified_citations[0].status == CitationStatus.EXACT_MATCH
    assert resp_exact.verified_citations[0].canonical_marker == "[src/auth/jwt.py:15-30]"

    # Test 2: Clamped overlap [src/auth/jwt.py:5-30] overlaps [10-50] -> clamped to [10-30]
    llm_output_clamped = "Token check starts early [src/auth/jwt.py:5-30]."
    resp_clamped = engine.verify_and_sanitize_response(llm_output_clamped, chunks)
    assert len(resp_clamped.verified_citations) == 1
    assert resp_clamped.verified_citations[0].status == CitationStatus.CLAMPED_TO_BOUNDS
    assert resp_clamped.verified_citations[0].canonical_marker == "[src/auth/jwt.py:10-30]"

    # Test 3: Hallucinated file [src/fake/missing.py:1-10]
    llm_output_hallucinated = "Something else [src/fake/missing.py:1-10]."
    resp_hallucinated = engine.verify_and_sanitize_response(llm_output_hallucinated, chunks)
    assert len(resp_hallucinated.rejected_citations) == 1
    assert resp_hallucinated.rejected_citations[0].status == CitationStatus.HALLUCINATED_FILE


def test_citation_abstention():
    engine = GroundedCitationEngine(min_context_score=0.40)

    # Empty chunks -> pre-generation abstention
    resp_empty = engine.verify_and_sanitize_response("any output", [])
    assert resp_empty.is_abstained
    assert "No relevant code chunks" in (resp_empty.abstention_reason or "")

    # Low score chunks -> pre-generation abstention
    low_chunks = [
        RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path="src/utils.py",
            language="python",
            start_line=1,
            end_line=5,
            raw_code="x = 1",
            contextualized_text="...",
            symbol_name=None,
            symbol_kind=None,
            final_score=0.08,
        )
    ]
    resp_low = engine.verify_and_sanitize_response("some text", low_chunks)
    assert resp_low.is_abstained
    assert "insufficient relevance" in (resp_low.abstention_reason or "")


def test_citation_out_of_scope_term_abstention():
    engine = GroundedCitationEngine(min_term_coverage=0.05)
    chunks = [
        RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path="src/auth/jwt.py",
            language="python",
            start_line=1,
            end_line=20,
            raw_code="def verify_token(token: str):\n    return decode(token)",
            contextualized_text="JWT authentication",
            symbol_name="verify_token",
            symbol_kind="function",
            final_score=0.85,
        )
    ]

    # Out-of-scope query with 0 term coverage
    out_of_scope_query = "Where is the Kubernetes Helm chart deployment configuration?"
    abstain, reason = engine.should_abstain_pre_generation(chunks, out_of_scope_query)
    assert abstain is True
    assert "None of the key terms in the question" in (reason or "")

    resp = engine.verify_and_sanitize_response("Kubernetes config [src/auth/jwt.py:1-5]", chunks, out_of_scope_query)
    assert resp.is_abstained is True
    assert len(resp.verified_citations) == 0


def test_citation_deduplication():
    engine = GroundedCitationEngine()
    chunks = [
        RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path="src/auth/jwt.py",
            language="python",
            start_line=10,
            end_line=50,
            raw_code="def verify():\n    pass",
            contextualized_text="...",
            symbol_name="verify",
            symbol_kind="function",
            final_score=0.85,
        )
    ]

    # Repeated duplicate citations in text
    repeated_output = (
        "Token verification occurs here [src/auth/jwt.py:15-30]. "
        "As explained above [src/auth/jwt.py:15-30], tokens are validated."
    )
    resp = engine.verify_and_sanitize_response(repeated_output, chunks)
    assert not resp.is_abstained
    assert len(resp.verified_citations) == 1
    assert resp.verified_citations[0].canonical_marker == "[src/auth/jwt.py:15-30]"
