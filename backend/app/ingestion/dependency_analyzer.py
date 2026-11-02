from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set
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


class CodebaseDependencyAnalyzer:
    """
    Analyzes static import relationships across repository files
    and produces an interactive dependency graph with coupling metrics.
    """

    PYTHON_IMPORT_RE = re.compile(
        r"^(?:from\s+([a-zA-Z0-9_.]+)\s+import|import\s+([a-zA-Z0-9_.,\s]+))",
        re.MULTILINE,
    )
    TS_IMPORT_RE = re.compile(
        r"""(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))""",
        re.MULTILINE,
    )

    @classmethod
    def analyze(cls, files_dict: Dict[str, str]) -> CodebaseDependencyGraph:
        """
        files_dict maps relative file paths to their raw source code content.
        """
        graph = nx.DiGraph()
        known_files = set(files_dict.keys())
        external_pkgs: Set[str] = set()

        # Add all internal files as graph nodes
        for f in known_files:
            graph.add_node(f, kind="internal_file", label=Path(f).name)

        for file_path, code in files_dict.items():
            if file_path.endswith(".py"):
                imports = cls._parse_python_imports(code)
                for imp in imports:
                    target = cls._resolve_python_import(imp, file_path, known_files)
                    if target:
                        graph.add_edge(file_path, target)
                    else:
                        top_pkg = imp.split(".")[0]
                        if top_pkg and not top_pkg.startswith("."):
                            external_pkgs.add(top_pkg)
                            graph.add_node(f"pkg:{top_pkg}", kind="external_package", label=top_pkg)
                            graph.add_edge(file_path, f"pkg:{top_pkg}")

            elif file_path.endswith((".ts", ".tsx", ".js", ".jsx")):
                imports = cls._parse_ts_imports(code)
                for imp in imports:
                    target = cls._resolve_ts_import(imp, file_path, known_files)
                    if target:
                        graph.add_edge(file_path, target)
                    else:
                        if not imp.startswith("."):
                            pkg_name = imp.split("/")[0] if not imp.startswith("@") else "/".join(imp.split("/")[:2])
                            external_pkgs.add(pkg_name)
                            graph.add_node(f"pkg:{pkg_name}", kind="external_package", label=pkg_name)
                            graph.add_edge(file_path, f"pkg:{pkg_name}")

        # Cycle detection
        simple_cycles: List[List[str]] = []
        try:
            # Subgraph of only internal files for cycles
            internal_subgraph = graph.subgraph(known_files)
            for cycle in nx.simple_cycles(internal_subgraph):
                if len(cycle) > 1:
                    simple_cycles.append(cycle)
        except Exception:
            pass

        nodes: List[DependencyNode] = []
        for n, attrs in graph.nodes(data=True):
            nodes.append(
                DependencyNode(
                    id=n,
                    label=attrs.get("label", n),
                    kind=attrs.get("kind", "internal_file"),
                    in_degree=graph.in_degree(n),
                    out_degree=graph.out_degree(n),
                )
            )

        edges: List[DependencyEdge] = [
            DependencyEdge(source=u, target=v) for u, v in graph.edges()
        ]

        return CodebaseDependencyGraph(
            nodes=nodes,
            edges=edges,
            external_packages=sorted(list(external_pkgs)),
            internal_files_count=len(known_files),
            circular_dependencies=simple_cycles[:10],
        )

    @classmethod
    def _parse_python_imports(cls, code: str) -> List[str]:
        results: List[str] = []
        for match in cls.PYTHON_IMPORT_RE.finditer(code):
            from_pkg, direct_pkgs = match.groups()
            if from_pkg:
                results.append(from_pkg)
            elif direct_pkgs:
                for p in direct_pkgs.split(","):
                    clean = p.strip().split(" as ")[0].strip()
                    if clean:
                        results.append(clean)
        return results

    @classmethod
    def _parse_ts_imports(cls, code: str) -> List[str]:
        results: List[str] = []
        for match in cls.TS_IMPORT_RE.finditer(code):
            imp1, imp2 = match.groups()
            target = imp1 or imp2
            if target:
                results.append(target.strip())
        return results

    @classmethod
    def _resolve_python_import(
        cls, imp: str, current_file: str, known_files: Set[str]
    ) -> str | None:
        parts = imp.split(".")
        current_dir = Path(current_file).parent

        # Try relative or absolute file paths
        candidates = [
            "/".join(parts) + ".py",
            "/".join(parts) + "/__init__.py",
            (current_dir / ("/".join(parts) + ".py")).as_posix(),
        ]
        for c in candidates:
            if c in known_files:
                return c
        return None

    @classmethod
    def _resolve_ts_import(
        cls, imp: str, current_file: str, known_files: Set[str]
    ) -> str | None:
        if not imp.startswith("."):
            return None
        current_dir = Path(current_file).parent
        resolved = (current_dir / imp).resolve()
        # Find match in known files with extensions
        for ext in ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"]:
            test_path = (current_dir / f"{imp}{ext}").as_posix()
            # Normalize path
            norm = Path(test_path).as_posix()
            if norm in known_files:
                return norm
            # Check relative to base
            for k in known_files:
                if k.endswith(f"{imp}{ext}"):
                    return k
        return None
