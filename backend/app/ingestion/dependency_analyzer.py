from __future__ import annotations

import ast
import posixpath
import re
import time
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Set
import networkx as nx


@dataclass
class DependencyNode:
    id: str
    label: str
    kind: str  # "internal_file" | "external_package"
    in_degree: int = 0
    out_degree: int = 0


@dataclass
class DependencyEdge:
    source: str
    target: str
    import_type: str = "direct"


@dataclass
class CodebaseDependencyGraph:
    nodes: List[DependencyNode] = field(default_factory=list)
    edges: List[DependencyEdge] = field(default_factory=list)
    external_packages: List[str] = field(default_factory=list)
    internal_files_count: int = 0
    circular_dependencies: List[List[str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodes": [
                {
                    "id": n.id,
                    "label": n.label,
                    "kind": n.kind,
                    "in_degree": n.in_degree,
                    "out_degree": n.out_degree,
                }
                for n in self.nodes
            ],
            "edges": [
                {
                    "source": e.source,
                    "target": e.target,
                    "import_type": e.import_type,
                }
                for e in self.edges
            ],
            "external_packages": self.external_packages,
            "internal_files_count": self.internal_files_count,
            "circular_dependencies": self.circular_dependencies,
        }


class CodebaseDependencyAnalyzer:
    """
    Analyzes static import relationships across repository files
    and produces an interactive dependency graph with coupling metrics.
    """

    # Strip Python triple-quoted strings so inline test fixtures/docstrings don't create phantom imports
    PY_TRIPLE_QUOTE_RE = re.compile(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'')

    # Matches single-line and parenthesized multi-line Python imports using [ \t] (never \s across lines)
    PYTHON_IMPORT_RE = re.compile(
        r"^[ \t]*(?:from[ \t]+(\.*[A-Za-z_][A-Za-z0-9_.]*)[ \t]+import[ \t]+(?:\(([^)]*)\)|([^\r\n#;()]+))|import[ \t]+([^\r\n#;()]+))",
        re.MULTILINE,
    )
    VALID_PY_MODULE_RE = re.compile(r"^\.*[A-Za-z_][A-Za-z0-9_.]*$")
    VALID_PKG_NAME_RE = re.compile(
        r"^(?:@[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+|[A-Za-z0-9_][A-Za-z0-9_.-]*)$"
    )
    IGNORED_EXTERNAL_MODULES: Set[str] = {"__future__", "__main__"}

    # Strip JS/TS comments before regex extraction to avoid matching inside comments
    TS_COMMENT_RE = re.compile(r"//[^\r\n]*|/\*[\s\S]*?\*/")

    # Single-line string literal specifiers for ES imports, re-exports, require(), and dynamic import()
    TS_IMPORT_RE = re.compile(
        r"""(?:(?:\bimport|\bexport)\s+(?:type\s+)?(?:[\w*\s{},$]*?\s+from\s+)?['"]([^'"\r\n]+)['"]|\b(?:require|import)\s*\(\s*['"]([^'"\r\n]+)['"]\s*\))"""
    )

    MAX_CYCLES = 15
    MAX_CYCLE_LENGTH = 6
    CYCLE_SEARCH_TIMEOUT_SEC = 0.25

    @classmethod
    def analyze(cls, files_dict: Dict[str, str]) -> CodebaseDependencyGraph:
        """
        files_dict maps relative file paths to their raw source code content.
        """
        graph = nx.DiGraph()

        # Normalize all file paths to POSIX format
        normalized_files: Dict[str, str] = {
            k.replace("\\", "/"): v for k, v in files_dict.items()
        }
        known_files: Set[str] = set(normalized_files.keys())
        external_pkgs: Set[str] = set()

        # Prebuild O(1) multi-segment suffix lookup index (2+ segments avoid colliding with stdlib names)
        suffix_index: Dict[str, str] = {}
        for f in sorted(known_files):
            parts = f.split("/")
            for i in range(2, len(parts) + 1):
                suffix = "/".join(parts[-i:])
                suffix_index.setdefault(suffix, f)

        # Add all internal files as graph nodes
        for f in sorted(known_files):
            graph.add_node(f, kind="internal_file", label=PurePosixPath(f).name)

        for file_path, code in normalized_files.items():
            if file_path.endswith(".py"):
                imports = cls._parse_python_imports(code)
                for imp in imports:
                    target = cls._resolve_python_import(
                        imp, file_path, known_files, suffix_index
                    )
                    if target:
                        if target != file_path:
                            graph.add_edge(file_path, target)
                    elif not imp.startswith("."):
                        top_pkg = imp.split(".")[0].strip()
                        if (
                            top_pkg
                            and top_pkg not in cls.IGNORED_EXTERNAL_MODULES
                            and cls.VALID_PKG_NAME_RE.match(top_pkg)
                        ):
                            external_pkgs.add(top_pkg)
                            pkg_node_id = f"pkg:{top_pkg}"
                            graph.add_node(
                                pkg_node_id,
                                kind="external_package",
                                label=top_pkg,
                            )
                            graph.add_edge(file_path, pkg_node_id)

            elif file_path.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")):
                imports = cls._parse_ts_imports(code)
                for imp in imports:
                    target = cls._resolve_ts_import(
                        imp, file_path, known_files, suffix_index
                    )
                    if target:
                        if target != file_path:
                            graph.add_edge(file_path, target)
                    elif not imp.startswith((".", "/", "@/", "~/")):
                        pkg_name = (
                            "/".join(imp.split("/")[:2])
                            if imp.startswith("@")
                            else imp.split("/")[0]
                        ).strip()
                        if (
                            pkg_name
                            and pkg_name not in cls.IGNORED_EXTERNAL_MODULES
                            and cls.VALID_PKG_NAME_RE.match(pkg_name)
                        ):
                            external_pkgs.add(pkg_name)
                            pkg_node_id = f"pkg:{pkg_name}"
                            graph.add_node(
                                pkg_node_id,
                                kind="external_package",
                                label=pkg_name,
                            )
                            graph.add_edge(file_path, pkg_node_id)

        # Safe, time-bounded cycle detection via Tarjan's Strongly Connected Components
        simple_cycles = cls._detect_cycles_bounded(graph, known_files)

        nodes: List[DependencyNode] = []
        for n, attrs in graph.nodes(data=True):
            nodes.append(
                DependencyNode(
                    id=n,
                    label=attrs.get("label", n),
                    kind=attrs.get("kind", "internal_file"),
                    in_degree=int(graph.in_degree(n)),
                    out_degree=int(graph.out_degree(n)),
                )
            )

        edges: List[DependencyEdge] = [
            DependencyEdge(source=u, target=v) for u, v in graph.edges()
        ]

        return CodebaseDependencyGraph(
            nodes=nodes,
            edges=edges,
            external_packages=sorted(external_pkgs),
            internal_files_count=len(known_files),
            circular_dependencies=simple_cycles,
        )

    @classmethod
    def _detect_cycles_bounded(
        cls, graph: nx.DiGraph, known_files: Set[str]
    ) -> List[List[str]]:
        """
        Uses Tarjan's O(V + E) Strongly Connected Components to isolate non-trivial
        cycle clusters first, then performs bounded cycle extraction with strict
        count and wall-clock time limits so large tangled graphs never hang.
        """
        cycles: List[List[str]] = []
        internal_subgraph = graph.subgraph(known_files)
        deadline = time.perf_counter() + cls.CYCLE_SEARCH_TIMEOUT_SEC

        try:
            sccs = [
                scc
                for scc in nx.strongly_connected_components(internal_subgraph)
                if len(scc) > 1
            ]
            sccs.sort(key=len)

            for scc in sccs:
                if len(cycles) >= cls.MAX_CYCLES or time.perf_counter() >= deadline:
                    break

                scc_graph = internal_subgraph.subgraph(scc)
                try:
                    cycle_iter = nx.simple_cycles(
                        scc_graph, length_bound=cls.MAX_CYCLE_LENGTH
                    )
                except TypeError:
                    cycle_iter = nx.simple_cycles(scc_graph)

                for cycle in cycle_iter:
                    if len(cycle) > 1:
                        cycles.append(list(cycle))
                    if (
                        len(cycles) >= cls.MAX_CYCLES
                        or time.perf_counter() >= deadline
                    ):
                        break
        except Exception:
            pass

        return cycles

    @classmethod
    def _parse_python_imports(cls, code: str) -> List[str]:
        """
        Extracts Python imports accurately without leaking newlines:
        1. For normal-sized files (<= 24 KB), uses Python's AST parser to ignore
           multiline test fixture strings and comments with 100% precision.
        2. For large files or files with syntax errors, strips triple-quoted strings
           and uses a horizontal-whitespace regex that never crosses line boundaries.
        """
        results: List[str] = []
        seen: Set[str] = set()

        def _add(mod_name: str) -> None:
            clean = mod_name.strip()
            if (
                clean
                and "\n" not in clean
                and "\r" not in clean
                and " " not in clean
                and "\t" not in clean
                and cls.VALID_PY_MODULE_RE.match(clean)
                and clean not in seen
            ):
                seen.add(clean)
                results.append(clean)

        if len(code) <= 24_000:
            try:
                tree = ast.parse(code)
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            if alias.name:
                                _add(alias.name)
                    elif isinstance(node, ast.ImportFrom):
                        dots = "." * (node.level or 0)
                        base_mod = node.module or ""
                        if base_mod:
                            for alias in node.names:
                                if alias.name and alias.name != "*":
                                    _add(f"{dots}{base_mod}.{alias.name}")
                            _add(f"{dots}{base_mod}")
                        elif dots:
                            for alias in node.names:
                                if alias.name and alias.name != "*":
                                    _add(f"{dots}{alias.name}")
                return results
            except Exception:
                pass

        # Fast regex parser after stripping triple-quoted strings
        cleaned_code = cls.PY_TRIPLE_QUOTE_RE.sub("", code)
        for match in cls.PYTHON_IMPORT_RE.finditer(cleaned_code):
            from_mod, paren_names, line_names, direct_mods = match.groups()
            if from_mod:
                raw_names = paren_names if paren_names is not None else (line_names or "")
                dots = "." * (len(from_mod) - len(from_mod.lstrip(".")))
                base_mod = from_mod.lstrip(".")
                for part in raw_names.split(","):
                    sym = part.split("#", 1)[0].strip().split(" as ")[0].strip()
                    if sym and sym != "*":
                        if base_mod:
                            _add(f"{dots}{base_mod}.{sym}")
                        else:
                            _add(f"{dots}{sym}")
                if base_mod:
                    _add(from_mod)
            elif direct_mods:
                for part in direct_mods.split(","):
                    mod = part.split("#", 1)[0].strip().split(" as ")[0].strip()
                    if mod:
                        _add(mod)

        return results

    @classmethod
    def _parse_ts_imports(cls, code: str) -> List[str]:
        """
        Strips comments and extracts single-line module specifiers from
        ES imports/exports, require(), and dynamic import() calls.
        """
        results: List[str] = []
        seen: Set[str] = set()
        clean_code = cls.TS_COMMENT_RE.sub("", code)

        for match in cls.TS_IMPORT_RE.finditer(clean_code):
            imp1, imp2 = match.groups()
            target = (imp1 or imp2 or "").strip()
            if (
                target
                and "\n" not in target
                and "\r" not in target
                and " " not in target
                and "\t" not in target
                and target not in seen
            ):
                seen.add(target)
                results.append(target)
        return results

    @classmethod
    def _resolve_python_import(
        cls,
        imp: str,
        current_file: str,
        known_files: Set[str],
        suffix_index: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        current_dir = posixpath.dirname(current_file)

        # Handle relative imports (e.g. `.utils`, `..models.user`)
        if imp.startswith("."):
            level = len(imp) - len(imp.lstrip("."))
            remainder = imp.lstrip(".")
            base_dir = current_dir
            for _ in range(max(0, level - 1)):
                base_dir = posixpath.dirname(base_dir)

            rel_path = remainder.replace(".", "/") if remainder else ""
            prefix = f"{base_dir}/{rel_path}".strip("/") if base_dir else rel_path
            candidates = (
                [f"{prefix}.py", f"{prefix}/__init__.py"]
                if prefix
                else [f"{base_dir}/__init__.py"]
            )
            for cand in candidates:
                norm = posixpath.normpath(cand)
                if norm in known_files:
                    return norm
            return None

        rel_mod = imp.replace(".", "/")
        direct_candidates = [
            f"{rel_mod}.py",
            f"{rel_mod}/__init__.py",
            f"src/{rel_mod}.py",
            f"src/{rel_mod}/__init__.py",
            f"app/{rel_mod}.py",
            f"app/{rel_mod}/__init__.py",
        ]
        if current_dir:
            direct_candidates.extend(
                [
                    posixpath.normpath(f"{current_dir}/{rel_mod}.py"),
                    posixpath.normpath(f"{current_dir}/{rel_mod}/__init__.py"),
                ]
            )

        for cand in direct_candidates:
            if cand in known_files:
                return cand

        if suffix_index is not None:
            for suffix in (f"{rel_mod}.py", f"{rel_mod}/__init__.py"):
                if suffix in suffix_index:
                    return suffix_index[suffix]

        # If `from pkg.mod import func` was tested as `pkg.mod.func`, also check parent `pkg.mod`
        if "." in imp:
            parent_mod = imp.rsplit(".", 1)[0].replace(".", "/")
            parent_candidates = [
                f"{parent_mod}.py",
                f"{parent_mod}/__init__.py",
                f"src/{parent_mod}.py",
                f"src/{parent_mod}/__init__.py",
                f"app/{parent_mod}.py",
                f"app/{parent_mod}/__init__.py",
            ]
            if current_dir:
                parent_candidates.extend(
                    [
                        posixpath.normpath(f"{current_dir}/{parent_mod}.py"),
                        posixpath.normpath(f"{current_dir}/{parent_mod}/__init__.py"),
                    ]
                )
            for cand in parent_candidates:
                if cand in known_files:
                    return cand
            if suffix_index is not None:
                for suffix in (f"{parent_mod}.py", f"{parent_mod}/__init__.py"):
                    if suffix in suffix_index:
                        return suffix_index[suffix]

        return None

    @classmethod
    def _resolve_ts_import(
        cls,
        imp: str,
        current_file: str,
        known_files: Set[str],
        suffix_index: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        if not imp.startswith((".", "/", "@/", "~/")):
            return None

        current_dir = posixpath.dirname(current_file)
        if imp.startswith(("@/", "~/")):
            clean_imp = imp[2:]
            base_candidates = [
                clean_imp,
                f"src/{clean_imp}",
                f"frontend/src/{clean_imp}",
            ]
        elif imp.startswith("/"):
            base_candidates = [imp.lstrip("/")]
        else:
            joined = f"{current_dir}/{imp}" if current_dir else imp
            base_candidates = [posixpath.normpath(joined)]

        extensions = [
            "",
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mjs",
            ".cjs",
            "/index.ts",
            "/index.tsx",
            "/index.js",
            "/index.jsx",
        ]

        for base in base_candidates:
            stripped = base.lstrip("./") if base.startswith("..") else base
            for ext in extensions:
                cand = posixpath.normpath(f"{stripped}{ext}")
                if cand in known_files:
                    return cand
                if suffix_index is not None and cand in suffix_index:
                    return suffix_index[cand]

        return None
