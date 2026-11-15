from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Tuple

import tree_sitter_python as tspython
import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Node, Parser


class SupportedLanguage(str, Enum):
    PYTHON = "python"
    TYPESCRIPT = "typescript"
    TSX = "tsx"
    JAVASCRIPT = "javascript"
    GENERIC = "generic"


@dataclass(frozen=True)
class ExtractedSymbol:
    name: str
    kind: str  # "class", "function", "method", "interface", "type_alias", "variable"
    signature: str
    docstring: Optional[str]
    start_line: int  # 1-indexed inclusive
    end_line: int  # 1-indexed inclusive
    start_byte: int
    end_byte: int
    parent_scope: Optional[str] = None


@dataclass(frozen=True)
class CodeChunkPayload:
    file_path: str
    language: str
    chunk_index: int
    start_line: int  # 1-indexed inclusive
    end_line: int  # 1-indexed inclusive
    raw_code: str
    contextualized_text: str
    content_hash: str
    lexical_tokens: str
    symbol_name: Optional[str] = None
    symbol_kind: Optional[str] = None
    parent_scope: Optional[str] = None
    docstring: Optional[str] = None
    imports_context: List[str] = field(default_factory=list)
    token_estimate: int = 0


class CodeQueryNormalizer:
    """Expands camelCase, PascalCase, and snake_case identifiers for lexical matching."""

    IDENTIFIER_SPLIT_RE = re.compile(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_./:\\-]+")

    @classmethod
    def expand_code_text(cls, raw_text: str) -> str:
        tokens = re.findall(r"[A-Za-z0-9_./:-]+", raw_text)
        expanded: List[str] = []
        for token in tokens:
            clean = re.sub(r"[^A-Za-z0-9_]", "", token)
            if clean:
                expanded.append(clean.lower())
            subparts = [p.lower() for p in cls.IDENTIFIER_SPLIT_RE.split(token) if p.isalnum()]
            if len(subparts) > 1:
                expanded.extend(subparts)
        return " ".join(expanded)


class CodeASTChunker:
    """
    Tree-sitter AST parser and semantic chunker for Python, TypeScript, and JavaScript.
    Guarantees 1-indexed line intervals and scope-aware contextual headers.
    """

    EXTENSION_MAP: Dict[str, SupportedLanguage] = {
        ".py": SupportedLanguage.PYTHON,
        ".ts": SupportedLanguage.TYPESCRIPT,
        ".tsx": SupportedLanguage.TSX,
        ".js": SupportedLanguage.JAVASCRIPT,
        ".jsx": SupportedLanguage.TSX,
    }

    def __init__(
        self,
        max_chunk_chars: int = 3000,
        min_chunk_chars: int = 100,
        overlap_lines: int = 4,
    ) -> None:
        self.max_chunk_chars = max_chunk_chars
        self.min_chunk_chars = min_chunk_chars
        self.overlap_lines = overlap_lines

        self._languages: Dict[SupportedLanguage, Language] = {
            SupportedLanguage.PYTHON: Language(tspython.language()),
            SupportedLanguage.TYPESCRIPT: Language(tstypescript.language_typescript()),
            SupportedLanguage.TSX: Language(tstypescript.language_tsx()),
            SupportedLanguage.JAVASCRIPT: Language(tstypescript.language_tsx()),
        }
        self._parsers: Dict[SupportedLanguage, Parser] = {
            lang: Parser(native_lang) for lang, native_lang in self._languages.items()
        }

    def detect_language(self, file_path: str) -> SupportedLanguage:
        for ext, lang in self.EXTENSION_MAP.items():
            if file_path.lower().endswith(ext):
                return lang
        return SupportedLanguage.GENERIC

    def parse_and_chunk(self, file_path: str, source_code: str) -> Tuple[List[ExtractedSymbol], List[CodeChunkPayload]]:
        language = self.detect_language(file_path)
        source_bytes = source_code.encode("utf-8")
        source_lines = source_code.splitlines(keepends=True)

        if not source_lines:
            return [], []

        if language == SupportedLanguage.GENERIC:
            return [], self._fallback_line_chunk(file_path, source_lines)

        parser = self._parsers[language]
        tree = parser.parse(source_bytes)
        root_node = tree.root_node

        if language == SupportedLanguage.PYTHON:
            imports = self._extract_python_imports(root_node, source_bytes)
            symbols, raw_intervals = self._walk_python_ast(root_node, source_bytes)
        else:
            imports = self._extract_ts_imports(root_node, source_bytes)
            symbols, raw_intervals = self._walk_ts_ast(root_node, source_bytes)

        chunks = self._build_chunks_from_intervals(
            file_path=file_path,
            language=language,
            source_lines=source_lines,
            raw_intervals=raw_intervals,
            imports=imports,
        )
        return symbols, chunks

    # -------------------------------------------------------------------------
    # Python AST Traversal
    # -------------------------------------------------------------------------
    def _extract_python_imports(self, root: Node, source_bytes: bytes) -> List[str]:
        imports: List[str] = []
        for child in root.children:
            if child.type in ("import_statement", "import_from_statement"):
                stmt = self._node_text(child, source_bytes).strip()
                imports.append(re.sub(r"\s+", " ", stmt))
        return imports[:25]

    def _walk_python_ast(self, root: Node, source_bytes: bytes) -> Tuple[List[ExtractedSymbol], List[Dict[str, Any]]]:
        symbols: List[ExtractedSymbol] = []
        intervals: List[Dict[str, Any]] = []

        def visit_node(node: Node, parent_scope: Optional[str] = None, create_interval: bool = True) -> None:
            actual_node = node
            start_row = node.start_point.row

            if node.type == "decorated_definition":
                for sub in node.children:
                    if sub.type in ("class_definition", "function_definition"):
                        actual_node = sub
                        break

            if actual_node.type == "class_definition":
                name_node = actual_node.child_by_field_name("name")
                class_name = self._node_text(name_node, source_bytes) if name_node else "AnonymousClass"
                qualified_name = f"{parent_scope}.{class_name}" if parent_scope else class_name
                docstring = self._extract_python_docstring(actual_node, source_bytes)
                signature = self._extract_header_signature(actual_node, source_bytes)

                sym = ExtractedSymbol(
                    name=class_name,
                    kind="class",
                    signature=signature,
                    docstring=docstring,
                    start_line=start_row + 1,
                    end_line=node.end_point.row + 1,
                    start_byte=node.start_byte,
                    end_byte=node.end_byte,
                    parent_scope=parent_scope,
                )
                symbols.append(sym)

                node_char_len = node.end_byte - node.start_byte
                is_small_class = node_char_len <= self.max_chunk_chars

                if is_small_class and create_interval:
                    intervals.append(
                        {
                            "start_line": sym.start_line,
                            "end_line": sym.end_line,
                            "symbol_name": sym.name,
                            "symbol_kind": "class",
                            "parent_scope": parent_scope,
                            "docstring": docstring,
                        }
                    )

                body_node = actual_node.child_by_field_name("body")
                if body_node:
                    for child in body_node.children:
                        visit_node(child, parent_scope=qualified_name, create_interval=(not is_small_class))

            elif actual_node.type == "function_definition":
                name_node = actual_node.child_by_field_name("name")
                fn_name = self._node_text(name_node, source_bytes) if name_node else "anonymous_fn"
                kind = "method" if parent_scope else "function"
                docstring = self._extract_python_docstring(actual_node, source_bytes)
                signature = self._extract_header_signature(actual_node, source_bytes)

                sym = ExtractedSymbol(
                    name=fn_name,
                    kind=kind,
                    signature=signature,
                    docstring=docstring,
                    start_line=start_row + 1,
                    end_line=node.end_point.row + 1,
                    start_byte=node.start_byte,
                    end_byte=node.end_byte,
                    parent_scope=parent_scope,
                )
                symbols.append(sym)
                if create_interval:
                    intervals.append(
                        {
                            "start_line": sym.start_line,
                            "end_line": sym.end_line,
                            "symbol_name": sym.name,
                            "symbol_kind": kind,
                            "parent_scope": parent_scope,
                            "docstring": docstring,
                        }
                    )

        for top_child in root.children:
            visit_node(top_child, parent_scope=None, create_interval=True)

        return symbols, intervals

    def _extract_python_docstring(self, def_node: Node, source_bytes: bytes) -> Optional[str]:
        body = def_node.child_by_field_name("body")
        if not body or not body.children:
            return None
        first_stmt = body.children[0]
        if first_stmt.type == "expression_statement" and first_stmt.children:
            expr = first_stmt.children[0]
            if expr.type == "string":
                raw_doc = self._node_text(expr, source_bytes).strip()
                return raw_doc.strip("\"' \n\t")
        return None

    # -------------------------------------------------------------------------
    # TypeScript / JavaScript AST Traversal
    # -------------------------------------------------------------------------
    def _extract_ts_imports(self, root: Node, source_bytes: bytes) -> List[str]:
        imports: List[str] = []
        for child in root.children:
            if child.type == "import_statement":
                stmt = self._node_text(child, source_bytes).strip()
                imports.append(re.sub(r"\s+", " ", stmt))
        return imports[:25]

    def _walk_ts_ast(self, root: Node, source_bytes: bytes) -> Tuple[List[ExtractedSymbol], List[Dict[str, Any]]]:
        symbols: List[ExtractedSymbol] = []
        intervals: List[Dict[str, Any]] = []

        def get_leading_jsdoc(node: Node) -> Tuple[int, Optional[str]]:
            start_row = node.start_point.row
            prev = node.prev_named_sibling
            if prev and prev.type == "comment":
                comment_text = self._node_text(prev, source_bytes)
                if comment_text.startswith("/**") and (start_row - prev.end_point.row) <= 1:
                    cleaned = re.sub(r"(^/\*\*|\*/$|^\s*\*\s?)", "", comment_text, flags=re.MULTILINE).strip()
                    return prev.start_point.row, cleaned
            return start_row, None

        def visit_ts_node(node: Node, parent_scope: Optional[str] = None, create_interval: bool = True) -> None:
            outer_node = node
            inner_node = node

            if node.type == "export_statement":
                decl = node.child_by_field_name("declaration")
                if decl:
                    inner_node = decl

            start_row, jsdoc = get_leading_jsdoc(outer_node)

            if inner_node.type in ("class_declaration", "interface_declaration", "type_alias_declaration"):
                name_node = inner_node.child_by_field_name("name")
                sym_name = self._node_text(name_node, source_bytes) if name_node else "AnonymousType"
                kind_map = {
                    "class_declaration": "class",
                    "interface_declaration": "interface",
                    "type_alias_declaration": "type_alias",
                }
                kind = kind_map[inner_node.type]
                qualified = f"{parent_scope}.{sym_name}" if parent_scope else sym_name
                signature = self._extract_header_signature(inner_node, source_bytes)

                sym = ExtractedSymbol(
                    name=sym_name,
                    kind=kind,
                    signature=signature,
                    docstring=jsdoc,
                    start_line=start_row + 1,
                    end_line=outer_node.end_point.row + 1,
                    start_byte=outer_node.start_byte,
                    end_byte=outer_node.end_byte,
                    parent_scope=parent_scope,
                )
                symbols.append(sym)

                node_len = outer_node.end_byte - outer_node.start_byte
                is_small_unit = inner_node.type != "class_declaration" or node_len <= self.max_chunk_chars

                if is_small_unit and create_interval:
                    intervals.append(
                        {
                            "start_line": sym.start_line,
                            "end_line": sym.end_line,
                            "symbol_name": sym.name,
                            "symbol_kind": kind,
                            "parent_scope": parent_scope,
                            "docstring": jsdoc,
                        }
                    )

                body = inner_node.child_by_field_name("body")
                if body:
                    for member in body.children:
                        if member.type in ("method_definition", "public_field_definition"):
                            visit_ts_node(member, parent_scope=qualified, create_interval=(not is_small_unit))

            elif inner_node.type in ("function_declaration", "method_definition"):
                name_node = inner_node.child_by_field_name("name")
                fn_name = self._node_text(name_node, source_bytes) if name_node else "anonymous"
                kind = "method" if inner_node.type == "method_definition" else "function"
                signature = self._extract_header_signature(inner_node, source_bytes)

                sym = ExtractedSymbol(
                    name=fn_name,
                    kind=kind,
                    signature=signature,
                    docstring=jsdoc,
                    start_line=start_row + 1,
                    end_line=outer_node.end_point.row + 1,
                    start_byte=outer_node.start_byte,
                    end_byte=outer_node.end_byte,
                    parent_scope=parent_scope,
                )
                symbols.append(sym)
                if create_interval:
                    intervals.append(
                        {
                            "start_line": sym.start_line,
                            "end_line": sym.end_line,
                            "symbol_name": sym.name,
                            "symbol_kind": kind,
                            "parent_scope": parent_scope,
                            "docstring": jsdoc,
                        }
                    )

            elif inner_node.type == "lexical_declaration":
                for child in inner_node.children:
                    if child.type == "variable_declarator":
                        name_node = child.child_by_field_name("name")
                        val_node = child.child_by_field_name("value")
                        if val_node and val_node.type in ("arrow_function", "function_expression"):
                            fn_name = self._node_text(name_node, source_bytes) if name_node else "arrow_fn"
                            signature = self._extract_header_signature(outer_node, source_bytes)
                            sym = ExtractedSymbol(
                                name=fn_name,
                                kind="function",
                                signature=signature,
                                docstring=jsdoc,
                                start_line=start_row + 1,
                                end_line=outer_node.end_point.row + 1,
                                start_byte=outer_node.start_byte,
                                end_byte=outer_node.end_byte,
                                parent_scope=parent_scope,
                            )
                            symbols.append(sym)
                            intervals.append(
                                {
                                    "start_line": sym.start_line,
                                    "end_line": sym.end_line,
                                    "symbol_name": sym.name,
                                    "symbol_kind": "function",
                                    "parent_scope": parent_scope,
                                    "docstring": jsdoc,
                                }
                            )

        for top_child in root.children:
            visit_ts_node(top_child, parent_scope=None)

        return symbols, intervals

    # -------------------------------------------------------------------------
    # Interval Gap Filling & Contextual Chunk Construction
    # -------------------------------------------------------------------------
    def _build_chunks_from_intervals(
        self,
        file_path: str,
        language: SupportedLanguage,
        source_lines: Sequence[str],
        raw_intervals: List[Dict[str, Any]],
        imports: List[str],
    ) -> List[CodeChunkPayload]:
        total_lines = len(source_lines)
        if total_lines == 0:
            return []

        raw_intervals.sort(key=lambda x: (x["start_line"], x["end_line"]))

        complete_intervals: List[Dict[str, Any]] = []
        cursor = 1
        for item in raw_intervals:
            if item["start_line"] > cursor:
                gap_text = "".join(source_lines[cursor - 1 : item["start_line"] - 1]).strip()
                if len(gap_text) >= self.min_chunk_chars:
                    complete_intervals.append(
                        {
                            "start_line": cursor,
                            "end_line": item["start_line"] - 1,
                            "symbol_name": "<module_scope>",
                            "symbol_kind": "module",
                            "parent_scope": None,
                            "docstring": None,
                        }
                    )
            complete_intervals.append(item)
            cursor = max(cursor, item["end_line"] + 1)

        if cursor <= total_lines:
            tail_text = "".join(source_lines[cursor - 1 : total_lines]).strip()
            if len(tail_text) >= self.min_chunk_chars or not complete_intervals:
                complete_intervals.append(
                    {
                        "start_line": cursor,
                        "end_line": total_lines,
                        "symbol_name": "<module_scope>",
                        "symbol_kind": "module",
                        "parent_scope": None,
                        "docstring": None,
                    }
                )

        final_chunks: List[CodeChunkPayload] = []
        chunk_idx = 0

        for interval in complete_intervals:
            s_line = interval["start_line"]
            e_line = interval["end_line"]
            block_lines = source_lines[s_line - 1 : e_line]
            raw_code = "".join(block_lines)

            if len(raw_code) <= self.max_chunk_chars:
                sub_ranges = [(s_line, e_line)]
            else:
                sub_ranges = self._split_oversized_line_range(source_lines, s_line, e_line)

            for sub_start, sub_end in sub_ranges:
                sub_raw = "".join(source_lines[sub_start - 1 : sub_end])
                if not sub_raw.strip():
                    continue

                header = self._format_contextual_header(
                    file_path=file_path,
                    language=language.value,
                    start_line=sub_start,
                    end_line=sub_end,
                    symbol_name=interval.get("symbol_name"),
                    symbol_kind=interval.get("symbol_kind"),
                    parent_scope=interval.get("parent_scope"),
                    docstring=interval.get("docstring"),
                    imports=imports,
                )
                contextualized = f"{header}\n{sub_raw}"
                content_hash = hashlib.sha256(
                    f"{file_path}:{sub_start}-{sub_end}:{sub_raw}".encode("utf-8")
                ).hexdigest()
                lexical_tokens = CodeQueryNormalizer.expand_code_text(
                    f"{file_path} {interval.get('symbol_name', '')} {sub_raw}"
                )

                final_chunks.append(
                    CodeChunkPayload(
                        file_path=file_path,
                        language=language.value,
                        chunk_index=chunk_idx,
                        start_line=sub_start,
                        end_line=sub_end,
                        raw_code=sub_raw,
                        contextualized_text=contextualized,
                        content_hash=content_hash,
                        lexical_tokens=lexical_tokens,
                        symbol_name=interval.get("symbol_name"),
                        symbol_kind=interval.get("symbol_kind"),
                        parent_scope=interval.get("parent_scope"),
                        docstring=interval.get("docstring"),
                        imports_context=imports,
                        token_estimate=max(1, len(contextualized) // 4),
                    )
                )
                chunk_idx += 1

        return final_chunks

    def _fallback_line_chunk(self, file_path: str, source_lines: Sequence[str]) -> List[CodeChunkPayload]:
        """Simple line-based sliding window for generic configuration and non-AST files."""
        chunks: List[CodeChunkPayload] = []
        chunk_size_lines = 60
        overlap = self.overlap_lines
        total = len(source_lines)
        idx = 0
        line_num = 1

        while line_num <= total:
            end_num = min(line_num + chunk_size_lines - 1, total)
            sub_raw = "".join(source_lines[line_num - 1 : end_num])
            if sub_raw.strip():
                header = (
                    f"# [SpectraCode Context] File: {file_path} | Lines: {line_num}-{end_num}\n# --- BEGIN SOURCE ---"
                )
                contextualized = f"{header}\n{sub_raw}"
                content_hash = hashlib.sha256(f"{file_path}:{line_num}-{end_num}".encode("utf-8")).hexdigest()
                lexical_tokens = CodeQueryNormalizer.expand_code_text(f"{file_path} {sub_raw}")

                chunks.append(
                    CodeChunkPayload(
                        file_path=file_path,
                        language="generic",
                        chunk_index=idx,
                        start_line=line_num,
                        end_line=end_num,
                        raw_code=sub_raw,
                        contextualized_text=contextualized,
                        content_hash=content_hash,
                        lexical_tokens=lexical_tokens,
                        symbol_name=None,
                        symbol_kind=None,
                        parent_scope=None,
                        docstring=None,
                        imports_context=[],
                        token_estimate=max(1, len(contextualized) // 4),
                    )
                )
                idx += 1

            if end_num >= total:
                break
            line_num = max(line_num + 1, end_num - overlap)

        return chunks

    def _split_oversized_line_range(
        self, source_lines: Sequence[str], start_line: int, end_line: int
    ) -> List[Tuple[int, int]]:
        ranges: List[Tuple[int, int]] = []
        curr_start = start_line
        curr_chars = 0

        for line_num in range(start_line, end_line + 1):
            line_len = len(source_lines[line_num - 1])
            if curr_chars + line_len > self.max_chunk_chars and line_num > curr_start:
                ranges.append((curr_start, line_num - 1))
                curr_start = max(start_line, line_num - self.overlap_lines)
                curr_chars = sum(len(source_lines[i - 1]) for i in range(curr_start, line_num + 1))
            else:
                curr_chars += line_len

        if curr_start <= end_line:
            ranges.append((curr_start, end_line))
        return ranges

    @staticmethod
    def _format_contextual_header(
        file_path: str,
        language: str,
        start_line: int,
        end_line: int,
        symbol_name: Optional[str],
        symbol_kind: Optional[str],
        parent_scope: Optional[str],
        docstring: Optional[str],
        imports: List[str],
    ) -> str:
        scope_chain = f"{parent_scope}.{symbol_name}" if parent_scope and symbol_name else (symbol_name or "module")
        imports_str = "; ".join(imports[:6]) if imports else "none"
        doc_summary = docstring.splitlines()[0][:100] if docstring else "none"
        return (
            f"# [SpectraCode AST Context] File: {file_path} | Lines: {start_line}-{end_line} | Lang: {language}\n"
            f"# Scope: {scope_chain} ({symbol_kind or 'block'}) | Doc: {doc_summary}\n"
            f"# Imports: {imports_str}\n"
            f"# --- BEGIN SOURCE ---"
        )

    @staticmethod
    def _node_text(node: Node, source_bytes: bytes) -> str:
        return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")

    def _extract_header_signature(self, node: Node, source_bytes: bytes) -> str:
        text = self._node_text(node, source_bytes)
        first_line = text.splitlines()[0].strip() if text else ""
        return first_line[:200]
