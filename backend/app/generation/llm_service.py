from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import AsyncGenerator, List, Literal, Optional

import httpx
from google import genai
from google.genai import errors as genai_errors

from app.core.config import settings
from app.generation.citation_engine import SYSTEM_PROMPT_TEMPLATE, GroundedCitationEngine, GroundedResponse
from app.retrieval.hybrid_retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# Errors that mean "Gemini could not answer this time": API rejections (bad key, quota,
# safety block, server error) and network failures. Anything else is a bug in our code and
# is allowed to raise instead of being hidden behind the template fallback.
_GEMINI_FAILURES = (genai_errors.APIError, httpx.HTTPError, TimeoutError)


@dataclass
class GeneratedText:
    """Raw answer text plus which generator produced it."""

    text: str
    source: Literal["gemini", "template"]
    fallback_reason: Optional[str] = None


class LLMService:
    """
    Orchestrates streaming LLM responses with real-time citation verification.
    """

    def __init__(self) -> None:
        self.citation_engine = GroundedCitationEngine()

    async def stream_grounded_answer(
        self,
        query: str,
        retrieved_chunks: List[RetrievedChunk],
    ) -> AsyncGenerator[str, None]:
        start_time = time.time()

        # Check pre-generation abstention
        abstain, reason = self.citation_engine.should_abstain_pre_generation(retrieved_chunks, query)
        if abstain:
            fallback = self.citation_engine._build_fallback_response(
                reason or "Context insufficient", retrieved_chunks
            )
            yield f"data: {json.dumps({'type': 'token', 'content': fallback.answer_markdown})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'is_abstained': True, 'citations': [], 'latency_ms': int((time.time() - start_time) * 1000)})}\n\n"
            return

        # Attempt generation via Gemini / Vertex AI or local grounded generator
        generated = await self.generate_grounded_text(query, retrieved_chunks)

        # Verify citations against retrieved chunk intervals
        grounded_resp: GroundedResponse = self.citation_engine.verify_and_sanitize_response(
            generated.text, retrieved_chunks, query
        )

        # Stream words/tokens to client
        words = grounded_resp.answer_markdown.split(" ")
        for i, word in enumerate(words):
            token = word if i == len(words) - 1 else word + " "
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            await asyncio.sleep(0.015)  # Realistic smooth streaming cadence

        # Send citations and completion payload
        citations_data = [
            {
                "marker": c.canonical_marker,
                "file_path": c.file_path,
                "start_line": c.verified_start_line,
                "end_line": c.verified_end_line,
                "status": c.status.value,
            }
            for c in grounded_resp.verified_citations
        ]
        rejected_data = [
            {
                "marker": c.raw_marker,
                "file_path": c.file_path,
                "status": c.status.value,
            }
            for c in grounded_resp.rejected_citations
        ]

        latency_ms = int((time.time() - start_time) * 1000)
        yield f"data: {json.dumps({'type': 'citations', 'citations': citations_data, 'rejected': rejected_data})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'is_abstained': grounded_resp.is_abstained, 'citations': citations_data, 'latency_ms': latency_ms, 'generation_source': generated.source})}\n\n"

    async def generate_grounded_text(self, query: str, retrieved_chunks: List[RetrievedChunk]) -> GeneratedText:
        """Answer with Gemini when it is configured, otherwise with the extractive template.

        The result records which generator answered, so callers (the chat stream, the
        evaluation harness) never mistake a template answer for a model answer.
        """
        if settings.LLM_PROVIDER != "gemini":
            return self._template(query, retrieved_chunks, reason=f"LLM_PROVIDER={settings.LLM_PROVIDER}")
        if not settings.GEMINI_API_KEY:
            return self._template(query, retrieved_chunks, reason="GEMINI_API_KEY not set")

        prompt = self.citation_engine.compile_prompt(query, retrieved_chunks)
        started = time.perf_counter()
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config={"system_instruction": SYSTEM_PROMPT_TEMPLATE},
            )
        except _GEMINI_FAILURES as exc:
            # Log the error type and message only, never the prompt: it contains the user's code.
            return self._template(
                query, retrieved_chunks, reason=f"{type(exc).__name__}: {exc}", level=logging.WARNING
            )

        if not (resp and resp.text):
            return self._template(query, retrieved_chunks, reason="Gemini returned no text", level=logging.WARNING)

        logger.info(
            "llm_answer",
            extra={
                "provider": "gemini",
                "model": settings.GEMINI_MODEL,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "chunks": len(retrieved_chunks),
            },
        )
        return GeneratedText(text=resp.text, source="gemini")

    def _template(
        self, query: str, retrieved_chunks: List[RetrievedChunk], reason: str, level: int = logging.INFO
    ) -> GeneratedText:
        logger.log(level, "llm_fallback", extra={"provider": settings.LLM_PROVIDER, "reason": reason})
        return GeneratedText(
            text=self._generate_deterministic_explanation(query, retrieved_chunks),
            source="template",
            fallback_reason=reason,
        )

    # Only chunks scoring within this fraction of the top chunk are cited by the deterministic generator.
    RELATIVE_CITATION_CUTOFF = 0.90
    MAX_CITED_CHUNKS = 3

    def _generate_deterministic_explanation(
        self, query: str, chunks: List[RetrievedChunk]
    ) -> str:
        """
        Produces grounded code explanations referencing exact line numbers.
        Cites only the strongest primary retrieved chunks to keep citation precision high,
        while presenting 1-hop AST call-graph definitions for contextual tracing.
        """
        if not chunks:
            return f'### Analysis for: *"{query}"*\n\nNo relevant code chunks found.'

        primary_chunks = [c for c in chunks if not getattr(c, "is_linked_hop", False)]
        hop_chunks = [c for c in chunks if getattr(c, "is_linked_hop", False)]
        if not primary_chunks:
            primary_chunks = chunks

        primary = primary_chunks[0]
        cutoff = primary.final_score * self.RELATIVE_CITATION_CUTOFF
        top_chunks = [c for c in primary_chunks if c.final_score >= cutoff][: self.MAX_CITED_CHUNKS]

        parts = [
            f"### Analysis for: *\"{query}\"*\n",
            f"Based on the indexed codebase analysis, the relevant implementation is located in `{primary.file_path}`.",
        ]

        if primary.symbol_name:
            parts.append(
                f"\n**Core Symbol:** `{primary.symbol_name}` ({primary.symbol_kind or 'symbol'}) in [{primary.file_path}:{primary.start_line}-{primary.end_line}]."
            )

        parts.append("\n**Key Implementation Details:**")
        for chunk in top_chunks:
            citation = f"[{chunk.file_path}:{chunk.start_line}-{chunk.end_line}]"
            symbol_desc = f"`{chunk.symbol_name}`" if chunk.symbol_name else "Code block"
            lines_preview = [line.strip() for line in chunk.raw_code.splitlines() if line.strip() and not line.strip().startswith(("#", "//", "/*"))][:2]
            preview_str = f" (`{' '.join(lines_preview)}`)" if lines_preview else ""
            parts.append(
                f"- **{chunk.file_path}**: {symbol_desc}{preview_str} handles this logic at {citation}."
            )

        if len(top_chunks) > 1:
            second = top_chunks[1]
            parts.append(
                f"\n**Cross-Module Interaction:** Data and control flow connect from [{primary.file_path}:{primary.start_line}-{primary.end_line}] to [{second.file_path}:{second.start_line}-{second.end_line}]."
            )

        if hop_chunks:
            query_lower = query.lower()
            hop_lines = []
            for hc in hop_chunks[:2]:
                via = f" (referenced by `{hc.linked_from_symbol}`)" if hc.linked_from_symbol else ""
                if hc.symbol_name and hc.symbol_name.lower() in query_lower:
                    loc = f"[{hc.file_path}:{hc.start_line}-{hc.end_line}]"
                else:
                    loc = f"`{hc.file_path}` (lines {hc.start_line}–{hc.end_line})"
                hop_lines.append(
                    f"- `{hc.symbol_name or 'symbol'}` ({hc.symbol_kind or 'definition'}){via} defined in {loc}."
                )
            parts.append("\n**1-Hop AST Call-Graph Context:**\n" + "\n".join(hop_lines))

        return "\n".join(parts)

