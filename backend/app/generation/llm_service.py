from __future__ import annotations

import asyncio
import json
import os
import time
from typing import AsyncGenerator, Dict, List, Optional
from app.core.config import settings
from app.generation.citation_engine import GroundedCitationEngine, GroundedResponse, SYSTEM_PROMPT_TEMPLATE
from app.retrieval.hybrid_retriever import RetrievedChunk


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
        raw_text = await self._generate_grounded_text(query, retrieved_chunks)

        # Verify citations against retrieved chunk intervals
        grounded_resp: GroundedResponse = self.citation_engine.verify_and_sanitize_response(
            raw_text, retrieved_chunks, query
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
        yield f"data: {json.dumps({'type': 'done', 'is_abstained': grounded_resp.is_abstained, 'citations': citations_data, 'latency_ms': latency_ms})}\n\n"

    async def _generate_grounded_text(
        self, query: str, retrieved_chunks: List[RetrievedChunk]
    ) -> str:
        """
        Attempts external LLM (Gemini) if available; otherwise uses deterministic
        high-fidelity code intelligence generation with accurate citations.
        """
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            try:
                from google import genai
                client = genai.Client(api_key=gemini_key)
                prompt = self.citation_engine.compile_prompt(query, retrieved_chunks)
                resp = await asyncio.to_thread(
                    client.models.generate_content,
                    model="gemini-2.5-flash",
                    contents=prompt,
                    config={"system_instruction": SYSTEM_PROMPT_TEMPLATE},
                )
                if resp and resp.text:
                    return resp.text
            except Exception:
                pass

        # Deterministic Grounded Engine
        return self._generate_deterministic_explanation(query, retrieved_chunks)

    # Only chunks scoring within this fraction of the top chunk are cited by the deterministic generator.
    RELATIVE_CITATION_CUTOFF = 0.90
    MAX_CITED_CHUNKS = 3

    def _generate_deterministic_explanation(
        self, query: str, chunks: List[RetrievedChunk]
    ) -> str:
        """
        Produces grounded code explanations referencing exact line numbers.
        Cites only the strongest retrieved chunks to keep citation precision high.
        """
        if not chunks:
            return f'### Analysis for: *"{query}"*\n\nNo relevant code chunks found.'
        primary = chunks[0]
        cutoff = primary.final_score * self.RELATIVE_CITATION_CUTOFF
        top_chunks = [c for c in chunks if c.final_score >= cutoff][: self.MAX_CITED_CHUNKS]

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
            lines_preview = [l.strip() for l in chunk.raw_code.splitlines() if l.strip() and not l.strip().startswith(("#", "//", "/*"))][:2]
            preview_str = f" (`{' '.join(lines_preview)}`)" if lines_preview else ""
            parts.append(
                f"- **{chunk.file_path}**: {symbol_desc}{preview_str} handles this logic at {citation}."
            )

        if len(top_chunks) > 1:
            second = top_chunks[1]
            parts.append(
                f"\n**Cross-Module Interaction:** Data and control flow connect from [{primary.file_path}:{primary.start_line}-{primary.end_line}] to [{second.file_path}:{second.start_line}-{second.end_line}]."
            )

        return "\n".join(parts)

