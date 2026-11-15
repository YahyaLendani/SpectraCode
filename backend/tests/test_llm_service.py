"""Tests for the Gemini path in LLMService.

The real Gemini client is replaced with a small fake, so these tests never call the network
or need a real key. What they check is our code around the call: that the key is read from
settings, that a model answer is used when one arrives, that expected failures fall back to
the template visibly (logged, and marked as a template answer), and that bugs are not hidden.
"""
from __future__ import annotations

import json
import logging
import uuid

import httpx
import pytest
from google.genai import errors as genai_errors

from app.core.config import settings
from app.core.logging import JsonFormatter
from app.generation import llm_service as llm_module
from app.generation.llm_service import LLMService
from app.retrieval.hybrid_retriever import RetrievedChunk

SECRET_CODE = "def verify_token(token):\n    return decode(token, SECRET_KEY)"


def _chunks():
    return [
        RetrievedChunk(
            chunk_id=uuid.uuid4(),
            file_path="src/auth/jwt.py",
            language="python",
            start_line=10,
            end_line=11,
            raw_code=SECRET_CODE,
            contextualized_text=SECRET_CODE,
            symbol_name="verify_token",
            symbol_kind="function",
            final_score=0.9,
        )
    ]


class FakeResponse:
    def __init__(self, text):
        self.text = text


def install_fake_client(monkeypatch, *, text="Gemini says hi [src/auth/jwt.py:10-11]", error=None):
    """Replace genai.Client with a fake and return a dict recording how it was used."""
    calls = {"api_key": None, "model": None, "count": 0}

    class FakeModels:
        def generate_content(self, model, contents, config):
            calls["model"] = model
            calls["count"] += 1
            if error is not None:
                raise error
            return FakeResponse(text)

    class FakeClient:
        def __init__(self, api_key):
            calls["api_key"] = api_key
            self.models = FakeModels()

    monkeypatch.setattr(llm_module.genai, "Client", FakeClient)
    return calls


@pytest.fixture
def gemini_configured(monkeypatch):
    # Set the key on settings only. conftest.py removes it from os.environ, so this also
    # proves the service reads settings (which is where backend/.env values end up).
    monkeypatch.setattr(settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")


@pytest.mark.asyncio
async def test_uses_gemini_answer_when_configured(monkeypatch, gemini_configured):
    calls = install_fake_client(monkeypatch)

    result = await LLMService().generate_grounded_text("how is the token verified?", _chunks())

    assert result.source == "gemini"
    assert result.text == "Gemini says hi [src/auth/jwt.py:10-11]"
    assert result.fallback_reason is None
    assert calls == {"api_key": "test-key", "model": settings.GEMINI_MODEL, "count": 1}


@pytest.mark.parametrize(
    "error",
    [
        genai_errors.ClientError(403, {"error": {"message": "API key not valid"}}),
        genai_errors.ServerError(503, {"error": {"message": "overloaded"}}),
        httpx.ConnectError("network down"),
    ],
    ids=["bad-key", "server-error", "network"],
)
@pytest.mark.asyncio
async def test_expected_failures_fall_back_visibly(monkeypatch, gemini_configured, error):
    install_fake_client(monkeypatch, error=error)

    # Capture with our own handler on the service logger. pytest's caplog depends on whether
    # configure_logging() has already run (it stops "app" logs propagating to the root logger),
    # which would make this test pass or fail depending on test order.
    records = []
    handler = logging.Handler()
    handler.emit = records.append
    service_logger = logging.getLogger("app.generation.llm_service")
    service_logger.addHandler(handler)
    try:
        result = await LLMService().generate_grounded_text("how is the token verified?", _chunks())
    finally:
        service_logger.removeHandler(handler)

    assert result.source == "template"
    assert type(error).__name__ in result.fallback_reason
    assert result.text  # the user still gets an answer

    fallback_logs = [r for r in records if r.getMessage() == "llm_fallback"]
    assert len(fallback_logs) == 1
    assert type(error).__name__ in fallback_logs[0].reason
    # The prompt contains the user's code; it must never end up in the logs.
    assert all("SECRET_KEY" not in JsonFormatter().format(r) for r in records)


@pytest.mark.asyncio
async def test_empty_gemini_answer_falls_back(monkeypatch, gemini_configured):
    install_fake_client(monkeypatch, text="")

    result = await LLMService().generate_grounded_text("q", _chunks())

    assert result.source == "template"
    assert result.fallback_reason == "Gemini returned no text"


@pytest.mark.asyncio
async def test_unexpected_errors_are_not_hidden(monkeypatch, gemini_configured):
    # A bug in our own code must surface, not silently turn into a template answer.
    install_fake_client(monkeypatch, error=KeyError("bug"))

    with pytest.raises(KeyError):
        await LLMService().generate_grounded_text("q", _chunks())


@pytest.mark.asyncio
async def test_no_key_uses_template_without_calling_gemini(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    calls = install_fake_client(monkeypatch)

    result = await LLMService().generate_grounded_text("q", _chunks())

    assert result.source == "template"
    assert result.fallback_reason == "GEMINI_API_KEY not set"
    assert calls["count"] == 0


@pytest.mark.asyncio
async def test_template_provider_never_calls_gemini(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "template")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    calls = install_fake_client(monkeypatch)

    result = await LLMService().generate_grounded_text("q", _chunks())

    assert result.source == "template"
    assert calls["count"] == 0


@pytest.mark.asyncio
async def test_stream_reports_generation_source(monkeypatch, gemini_configured):
    install_fake_client(monkeypatch)
    monkeypatch.setattr(llm_module.asyncio, "sleep", _no_sleep)

    events = [
        json.loads(line.removeprefix("data: "))
        async for line in LLMService().stream_grounded_answer("how is the token verified?", _chunks())
    ]

    done = events[-1]
    assert done["type"] == "done"
    if not done["is_abstained"]:
        assert done["generation_source"] == "gemini"


async def _no_sleep(_seconds):
    return None


def test_json_formatter_puts_extra_fields_on_the_line():
    record = logging.makeLogRecord(
        {"name": "app.test", "levelname": "WARNING", "msg": "llm_fallback", "reason": "ClientError: 403"}
    )

    line = json.loads(JsonFormatter().format(record))

    assert line["msg"] == "llm_fallback"
    assert line["level"] == "WARNING"
    assert line["reason"] == "ClientError: 403"
    assert line["ts"].endswith("Z")
