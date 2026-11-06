from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Tuple
import uuid

from app.retrieval.hybrid_retriever import RetrievedChunk

SYSTEM_PROMPT_TEMPLATE = """You are RepoLens, an intelligent codebase analysis and software architecture assistant.
You answer questions accurately and strictly grounded in the provided `<repository_context>`.

### CRITICAL GROUNDING & CITATION RULES:
1. Every technical explanation, code reference, or architectural claim MUST include an inline citation formatted as: `[filepath:line_start-line_end]` (e.g. `[src/auth/jwt_manager.py:22-35]`).
2. Each line of code in `<repository_context>` has its exact line number prefixed (e.g. `  22 | class TokenManager:`). Use these exact numbers.
3. NEVER invent file paths or line numbers.
4. If the provided `<repository_context>` does not contain enough information to answer the question, respond with:
   `INSUFFICIENT_REPOSITORY_CONTEXT: <brief reason why the context does not cover the question>`
5. Chunks inside `<linked_hop_chunk>` provide 1-hop AST symbol definitions for contextual reference. Only cite a `<linked_hop_chunk>` with `[filepath:line_start-line_end]` if its code is directly required to answer the user's question.
"""


class CitationStatus(str, Enum):
    EXACT_MATCH = "exact_match"
    CLAMPED_TO_BOUNDS = "clamped_to_bounds"
    INVALID_LINE_RANGE = "invalid_line_range"
    HALLUCINATED_FILE = "hallucinated_file"


@dataclass(frozen=True)
class VerifiedCitation:
    raw_marker: str
    file_path: str
    cited_start_line: int
    cited_end_line: int
    verified_start_line: int
    verified_end_line: int
    chunk_id: Optional[uuid.UUID]
    status: CitationStatus

    @property
    def is_valid(self) -> bool:
        return self.status in (CitationStatus.EXACT_MATCH, CitationStatus.CLAMPED_TO_BOUNDS)

    @property
    def canonical_marker(self) -> str:
        return f"[{self.file_path}:{self.verified_start_line}-{self.verified_end_line}]"


@dataclass
class GroundedResponse:
    answer_markdown: str
    verified_citations: List[VerifiedCitation] = field(default_factory=list)
    rejected_citations: List[VerifiedCitation] = field(default_factory=list)
    is_abstained: bool = False
    abstention_reason: Optional[str] = None


class GroundedCitationEngine:
    """
    Compiles line-numbered prompts, parses [filepath:start-end] citations,
    verifies them against retrieved chunk intervals, and enforces groundedness.
    """

    CITATION_REGEX = re.compile(
        r"\[(?P<file>[a-zA-Z0-9_.\-/\\]+?\.[a-zA-Z0-9]+):L?(?P<start>\d+)(?:-L?(?P<end>\d+))?\]"
    )
    ABSTENTION_PREFIX = "INSUFFICIENT_REPOSITORY_CONTEXT:"

    # Generic question words that carry no domain meaning for lexical grounding checks.
    _STOPWORDS = frozenset(
        "a an the is are was were be been being how what where which who whom why when does do did "
        "and or not of to in on for with by at from into this that these those it its as can could "
        "should would will i we you they there any all some each defined define implemented implement "
        "handled handle handles used use uses work works happen happens exist exists value values "
        "code file files function functions class method".split()
    )
    _TERM_RE = re.compile(r"[a-z0-9]+")

    def __init__(self, min_context_score: float = 0.15, min_term_coverage: float = 0.05) -> None:
        self.min_context_score = min_context_score
        # Abstain when the fraction of query content terms found in the retrieved code is <= this value.
        self.min_term_coverage = min_term_coverage

    @staticmethod
    def _stem_candidates(term: str) -> set[str]:
        cands = {term}
        n = len(term)
        if n >= 4:
            if term.endswith("ies") and n >= 5:
                cands.add(term[:-3] + "y")
            elif term.endswith("ied") and n >= 5:
                cands.add(term[:-3] + "y")
            elif term.endswith("es"):
                cands.add(term[:-2])
                cands.add(term[:-1])
            elif term.endswith("s") and not term.endswith("ss"):
                cands.add(term[:-1])
            if term.endswith("ing") and n >= 5:
                cands.add(term[:-3])
                cands.add(term[:-3] + "e")
            if term.endswith("ed") and n >= 4:
                cands.add(term[:-2])
                cands.add(term[:-1])
            if term.endswith("tion") and n >= 6:
                cands.add(term[:-4])
                cands.add(term[:-4] + "te")
        return {c for c in cands if len(c) >= 2}

    def query_term_coverage(self, query: str, chunks: Sequence[RetrievedChunk]) -> Tuple[float, List[str]]:
        """Fraction of meaningful query terms that occur in the retrieved code (token & stem-tolerant)."""
        from app.ingestion.ast_chunker import CodeQueryNormalizer

        expanded = CodeQueryNormalizer.expand_code_text(query).lower()
        terms = sorted(
            {t for t in self._TERM_RE.findall(expanded) if len(t) >= 2 and t not in self._STOPWORDS}
        )
        if not terms:
            return 1.0, []
        haystack_raw = " ".join(
            f"{c.raw_code or ''} {c.file_path} {c.symbol_name or ''}" for c in chunks
        )
        haystack = CodeQueryNormalizer.expand_code_text(haystack_raw).lower()
        hay_tokens = set(self._TERM_RE.findall(haystack))
        hay_stems: set[str] = set()
        for tok in hay_tokens:
            hay_stems.update(self._stem_candidates(tok))

        missing = []
        for t in terms:
            t_cands = self._stem_candidates(t)
            if t in hay_tokens or bool(t_cands & hay_tokens) or bool(t_cands & hay_stems):
                continue
            missing.append(t)

        return (len(terms) - len(missing)) / len(terms), missing

    def should_abstain_pre_generation(
        self, chunks: Sequence[RetrievedChunk], query: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        if not chunks:
            return True, "No relevant code chunks were found in the indexed repository for this query."
        primary_chunks = [c for c in chunks if not getattr(c, "is_linked_hop", False)]
        eval_chunks = primary_chunks if primary_chunks else chunks
        max_score = max(c.final_score for c in eval_chunks)
        if max_score < self.min_context_score:
            return (
                True,
                f"Retrieved code chunks had insufficient relevance (max score {max_score:.2f} < threshold {self.min_context_score:.2f}).",
            )
        if query:
            coverage, missing = self.query_term_coverage(query, eval_chunks)
            if coverage <= self.min_term_coverage:
                return (
                    True,
                    "None of the key terms in the question ("
                    + ", ".join(f"`{t}`" for t in missing[:6])
                    + ") appear in the retrieved repository code.",
                )
        return False, None

    def compile_prompt(self, query: str, chunks: Sequence[RetrievedChunk]) -> str:
        context_blocks: List[str] = ["<repository_context>"]
        for chunk in chunks:
            numbered_lines = self._add_line_numbers(chunk.raw_code, chunk.start_line)
            symbol_info = f' symbol="{chunk.symbol_name}"' if chunk.symbol_name else ""
            tag = "linked_hop_chunk" if getattr(chunk, "is_linked_hop", False) else "code_chunk"
            hop_attr = (
                f' linked_from="{chunk.linked_from_symbol}"'
                if getattr(chunk, "is_linked_hop", False) and getattr(chunk, "linked_from_symbol", None)
                else ""
            )
            context_blocks.append(
                f'<{tag} file="{chunk.file_path}" lines="{chunk.start_line}-{chunk.end_line}"'
                f' language="{chunk.language}"{symbol_info}{hop_attr}>\n'
                f"{numbered_lines}\n"
                f"</{tag}>"
            )
        context_blocks.append("</repository_context>")
        compiled_context = "\n\n".join(context_blocks)

        return (
            f"{compiled_context}\n\n"
            f"### Question:\n{query}\n\n"
            f"Answer the question thoroughly, citing all code statements with `[filepath:line_start-line_end]`."
        )

    def verify_and_sanitize_response(
        self,
        raw_llm_output: str,
        retrieved_chunks: Sequence[RetrievedChunk],
        query: Optional[str] = None,
    ) -> GroundedResponse:
        abstain, reason = self.should_abstain_pre_generation(retrieved_chunks, query)
        if abstain:
            return self._build_fallback_response(reason or "No relevant code found.", retrieved_chunks)

        if self.ABSTENTION_PREFIX in raw_llm_output:
            extracted_reason = raw_llm_output.split(self.ABSTENTION_PREFIX, 1)[-1].strip()
            return self._build_fallback_response(extracted_reason, retrieved_chunks)

        chunks_by_file: Dict[str, List[RetrievedChunk]] = {}
        for c in retrieved_chunks:
            # Normalize file paths with forward slashes
            norm_path = c.file_path.replace("\\", "/")
            chunks_by_file.setdefault(norm_path, []).append(c)

        verified_list: List[VerifiedCitation] = []
        rejected_list: List[VerifiedCitation] = []
        seen_keys: set = set()

        def replace_citation(match: re.Match) -> str:
            raw_marker = match.group(0)
            file_path = match.group("file").strip().replace("\\", "/")
            start_line = int(match.group("start"))
            end_line = int(match.group("end")) if match.group("end") else start_line

            if start_line > end_line:
                start_line, end_line = end_line, start_line

            verification = self._verify_single_citation(
                raw_marker=raw_marker,
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                chunks_by_file=chunks_by_file,
            )

            if verification.is_valid:
                key = (verification.file_path, verification.verified_start_line, verification.verified_end_line)
                if key not in seen_keys:
                    seen_keys.add(key)
                    verified_list.append(verification)
                return verification.canonical_marker
            else:
                rejected_list.append(verification)
                return ""  # Remove hallucinated citation from text

        sanitized_markdown = self.CITATION_REGEX.sub(replace_citation, raw_llm_output)
        sanitized_markdown = re.sub(r"  +", " ", sanitized_markdown).strip()

        # If LLM wrote a response but zero citations verified, attach verified references or fallback
        if not verified_list and retrieved_chunks:
            # Check if any chunk file is mentioned in the answer
            top_chunk = retrieved_chunks[0]
            auto_cit = VerifiedCitation(
                raw_marker=f"[{top_chunk.file_path}:{top_chunk.start_line}-{top_chunk.end_line}]",
                file_path=top_chunk.file_path,
                cited_start_line=top_chunk.start_line,
                cited_end_line=top_chunk.end_line,
                verified_start_line=top_chunk.start_line,
                verified_end_line=top_chunk.end_line,
                chunk_id=top_chunk.chunk_id,
                status=CitationStatus.EXACT_MATCH,
            )
            verified_list.append(auto_cit)
            sanitized_markdown += f"\n\n**Reference:** {auto_cit.canonical_marker}"

        return GroundedResponse(
            answer_markdown=sanitized_markdown,
            verified_citations=verified_list,
            rejected_citations=rejected_list,
            is_abstained=False,
        )

    def _verify_single_citation(
        self,
        raw_marker: str,
        file_path: str,
        start_line: int,
        end_line: int,
        chunks_by_file: Dict[str, List[RetrievedChunk]],
    ) -> VerifiedCitation:
        # Check direct or suffix match (e.g. 'jwt_manager.py' matching 'src/auth/jwt_manager.py')
        matched_chunks = chunks_by_file.get(file_path)
        actual_path = file_path

        if not matched_chunks:
            for k, v in chunks_by_file.items():
                if k.endswith(file_path) or file_path.endswith(k):
                    matched_chunks = v
                    actual_path = k
                    break

        if not matched_chunks:
            return VerifiedCitation(
                raw_marker=raw_marker,
                file_path=file_path,
                cited_start_line=start_line,
                cited_end_line=end_line,
                verified_start_line=start_line,
                verified_end_line=end_line,
                chunk_id=None,
                status=CitationStatus.HALLUCINATED_FILE,
            )

        # Pass 1: Exact containment within a retrieved chunk
        for chunk in matched_chunks:
            if chunk.start_line <= start_line and end_line <= chunk.end_line:
                return VerifiedCitation(
                    raw_marker=raw_marker,
                    file_path=actual_path,
                    cited_start_line=start_line,
                    cited_end_line=end_line,
                    verified_start_line=start_line,
                    verified_end_line=end_line,
                    chunk_id=chunk.chunk_id,
                    status=CitationStatus.EXACT_MATCH,
                )

        # Pass 2: Clamped overlap with retrieved chunk
        best_chunk: Optional[RetrievedChunk] = None
        best_overlap = 0
        clamped_s, clamped_e = start_line, end_line

        for chunk in matched_chunks:
            ov_start = max(start_line, chunk.start_line)
            ov_end = min(end_line, chunk.end_line)
            overlap = max(0, ov_end - ov_start + 1)
            if overlap > best_overlap:
                best_overlap = overlap
                best_chunk = chunk
                clamped_s, clamped_e = ov_start, ov_end

        if best_chunk is not None and best_overlap > 0:
            return VerifiedCitation(
                raw_marker=raw_marker,
                file_path=actual_path,
                cited_start_line=start_line,
                cited_end_line=end_line,
                verified_start_line=clamped_s,
                verified_end_line=clamped_e,
                chunk_id=best_chunk.chunk_id,
                status=CitationStatus.CLAMPED_TO_BOUNDS,
            )

        return VerifiedCitation(
            raw_marker=raw_marker,
            file_path=actual_path,
            cited_start_line=start_line,
            cited_end_line=end_line,
            verified_start_line=start_line,
            verified_end_line=end_line,
            chunk_id=None,
            status=CitationStatus.INVALID_LINE_RANGE,
        )

    @staticmethod
    def _add_line_numbers(raw_code: str, start_line: int) -> str:
        lines = raw_code.splitlines()
        return "\n".join(f"{start_line + idx:4d} | {line}" for idx, line in enumerate(lines))

    @staticmethod
    def _build_fallback_response(
        reason: str, chunks: Sequence[RetrievedChunk]
    ) -> GroundedResponse:
        refs = ""
        if chunks:
            ref_list = [f"- `{c.file_path}` (lines {c.start_line}-{c.end_line})" for c in chunks[:3]]
            refs = "\n\n**Closest inspected locations in codebase:**\n" + "\n".join(ref_list)

        msg = (
            f"**Cannot verify an answer from the indexed codebase.**\n\n"
            f"**Reason:** {reason}{refs}"
        )
        return GroundedResponse(
            answer_markdown=msg,
            verified_citations=[],
            rejected_citations=[],
            is_abstained=True,
            abstention_reason=reason,
        )

