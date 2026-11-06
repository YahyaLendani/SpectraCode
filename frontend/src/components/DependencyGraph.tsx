"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GitFork,
  Package,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCode2,
  RefreshCw,
  ArrowDownLeft,
  Compass,
  X,
  Table2,
} from "lucide-react";
import { api, DependencyGraph as DependencyGraphData } from "@/lib/api";

interface DependencyGraphProps {
  repoId: string;
  onSelectFile?: (filePath: string) => void;
}

type NodeFilterMode = "all" | "internal" | "external" | "cycles";
type LayoutMode = "force" | "radial";
type SubViewMode = "canvas" | "matrix";

interface GraphNodeEnriched {
  id: string;
  label: string;
  kind: "internal_file" | "external_package" | string;
  in_degree: number;
  out_degree: number;
  total_degree: number;
  centrality: number;
  inCycle: boolean;
  category: "python" | "typescript" | "javascript" | "external" | "other";
  x: number;
  y: number;
  radius: number;
}

const CATEGORY_COLORS: Record<
  GraphNodeEnriched["category"],
  { fill: string; stroke: string; text: string; badge: string; label: string }
> = {
  python: {
    fill: "#1c1c1f",
    stroke: "#71717a",
    text: "#e4e4e7",
    badge: "bg-zinc-800 text-zinc-300 border-white/[0.08]",
    label: "Python Module",
  },
  typescript: {
    fill: "#18181b",
    stroke: "#94a3b8",
    text: "#f1f5f9",
    badge: "bg-slate-800/80 text-slate-300 border-white/[0.08]",
    label: "TypeScript Module",
  },
  javascript: {
    fill: "#26221c",
    stroke: "#d97706",
    text: "#fef3c7",
    badge: "bg-amber-950/40 text-amber-300 border-amber-500/20",
    label: "JavaScript Module",
  },
  external: {
    fill: "#141416",
    stroke: "#52525b",
    text: "#a1a1aa",
    badge: "bg-zinc-900 text-zinc-400 border-white/[0.06]",
    label: "External Package",
  },
  other: {
    fill: "#18201a",
    stroke: "#a3be8c",
    text: "#d1fae5",
    badge: "bg-emerald-950/30 text-emerald-300 border-emerald-500/20",
    label: "Internal Module",
  },
};

function classifyNodeCategory(
  id: string,
  kind: string
): GraphNodeEnriched["category"] {
  if (kind === "external_package" || id.startsWith("pkg:")) {
    return "external";
  }
  const lower = id.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }
  return "other";
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  repoId,
  onSelectFile,
}) => {
  const [data, setData] = useState<DependencyGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Controls State
  const [subView, setSubView] = useState<SubViewMode>("canvas");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<NodeFilterMode>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [maxVisibleNodes, setMaxVisibleNodes] = useState<number>(85);

  // Selection & Hover State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // SVG Pan & Zoom State
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 620;

  const loadGraph = () => {
    setLoading(true);
    setError(null);
    api
      .getDependencies(repoId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load dependency graph"
        );
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    api
      .getDependencies(repoId)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load dependency graph"
          );
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [repoId]);

  const cycleNodeSet = useMemo(() => {
    const set = new Set<string>();
    if (!data) return set;
    for (const cycle of data.circular_dependencies) {
      for (const nodeId of cycle) {
        set.add(nodeId);
      }
    }
    return set;
  }, [data]);

  const cycleEdgeSet = useMemo(() => {
    const set = new Set<string>();
    if (!data) return set;
    for (const cycle of data.circular_dependencies) {
      for (let i = 0; i < cycle.length; i++) {
        const u = cycle[i];
        const v = cycle[(i + 1) % cycle.length];
        set.add(`${u}->${v}`);
      }
    }
    return set;
  }, [data]);

  const allEnrichedNodes = useMemo<GraphNodeEnriched[]>(() => {
    if (!data) return [];
    const denom = Math.max(1, data.nodes.length - 1);
    return data.nodes.map((n) => {
      const total = n.in_degree + n.out_degree;
      const centrality = total / denom;
      const inCycle = cycleNodeSet.has(n.id);
      const category = classifyNodeCategory(n.id, n.kind);
      const radius = Math.max(7, Math.min(20, 7 + Math.sqrt(total) * 2.4));
      return {
        ...n,
        total_degree: total,
        centrality,
        inCycle,
        category,
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        radius,
      };
    });
  }, [data, cycleNodeSet]);

  const { canvasNodes, canvasEdges, nodeMap } = useMemo(() => {
    if (!data || allEnrichedNodes.length === 0) {
      return {
        canvasNodes: [] as GraphNodeEnriched[],
        canvasEdges: [] as { source: string; target: string; isCycle: boolean }[],
        nodeMap: new Map<string, GraphNodeEnriched>(),
      };
    }

    const q = searchQuery.trim().toLowerCase();

    const filtered = allEnrichedNodes.filter((n) => {
      if (filterMode === "internal" && n.kind !== "internal_file") return false;
      if (filterMode === "external" && n.kind !== "external_package") return false;
      if (filterMode === "cycles" && !n.inCycle) return false;
      if (q && !n.id.toLowerCase().includes(q) && !n.label.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.id === selectedNodeId) return -1;
      if (b.id === selectedNodeId) return 1;
      if (a.inCycle !== b.inCycle) return a.inCycle ? -1 : 1;
      if (b.total_degree !== a.total_degree) return b.total_degree - a.total_degree;
      return a.id.localeCompare(b.id);
    });

    const selectedSlice = sorted.slice(0, maxVisibleNodes).map((n) => ({ ...n }));
    const visibleIds = new Set(selectedSlice.map((n) => n.id));

    const validEdges = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        isCycle: cycleEdgeSet.has(`${e.source}->${e.target}`),
      }));

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const count = selectedSlice.length;

    if (layoutMode === "radial" || count <= 2) {
      const hubs = selectedSlice.filter(
        (n) => n.kind === "internal_file" && n.total_degree >= 4
      );
      const regulars = selectedSlice.filter(
        (n) => n.kind === "internal_file" && n.total_degree < 4
      );
      const externals = selectedSlice.filter((n) => n.kind === "external_package");

      const placeRing = (items: GraphNodeEnriched[], radius: number) => {
        const len = items.length;
        items.forEach((node, idx) => {
          const angle = (2 * Math.PI * idx) / Math.max(1, len) - Math.PI / 2;
          node.x = cx + radius * Math.cos(angle);
          node.y = cy + radius * Math.sin(angle);
        });
      };

      if (hubs.length === 1 && regulars.length + externals.length > 0) {
        hubs[0].x = cx;
        hubs[0].y = cy;
      } else {
        placeRing(hubs, Math.min(cx, cy) * 0.34);
      }
      placeRing(regulars, Math.min(cx, cy) * 0.62);
      placeRing(externals, Math.min(cx, cy) * 0.86);
    } else {
      selectedSlice.forEach((node, idx) => {
        const angle = (2 * Math.PI * idx) / count;
        const h = (hashString(node.id) % 100) / 100;
        const baseR =
          node.kind === "external_package"
            ? Math.min(cx, cy) * (0.72 + h * 0.14)
            : Math.min(cx, cy) * (0.22 + h * 0.45);
        node.x = cx + baseR * Math.cos(angle);
        node.y = cy + baseR * Math.sin(angle);
      });

      const idxMap = new Map<string, number>();
      selectedSlice.forEach((n, i) => idxMap.set(n.id, i));

      const iterations = count > 100 ? 45 : 70;
      const k =
        Math.sqrt((CANVAS_WIDTH * CANVAS_HEIGHT) / Math.max(1, count)) * 0.65;

      const dispX = new Float64Array(count);
      const dispY = new Float64Array(count);

      for (let iter = 0; iter < iterations; iter++) {
        const temp = (1 - iter / iterations) * 18;
        dispX.fill(0);
        dispY.fill(0);

        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            const dx = selectedSlice[i].x - selectedSlice[j].x;
            const dy = selectedSlice[i].y - selectedSlice[j].y;
            const distSq = dx * dx + dy * dy + 0.01;
            const dist = Math.sqrt(distSq);
            const minGap = selectedSlice[i].radius + selectedSlice[j].radius + 18;
            const force = ((k * k) / dist) * (dist < minGap ? 2.1 : 1.0);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            dispX[i] += fx;
            dispY[i] += fy;
            dispX[j] -= fx;
            dispY[j] -= fy;
          }
        }

        for (const edge of validEdges) {
          const u = idxMap.get(edge.source);
          const v = idxMap.get(edge.target);
          if (u === undefined || v === undefined) continue;
          const dx = selectedSlice[u].x - selectedSlice[v].x;
          const dy = selectedSlice[u].y - selectedSlice[v].y;
          const dist = Math.sqrt(dx * dx + dy * dy + 0.01);
          const force = (dist * dist) / (k * 1.15);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          dispX[u] -= fx;
          dispY[u] -= fy;
          dispX[v] += fx;
          dispY[v] += fy;
        }

        for (let i = 0; i < count; i++) {
          const dx = cx - selectedSlice[i].x;
          const dy = cy - selectedSlice[i].y;
          dispX[i] += dx * 0.05;
          dispY[i] += dy * 0.05;

          const dispLen = Math.sqrt(
            dispX[i] * dispX[i] + dispY[i] * dispY[i] + 0.01
          );
          const step = Math.min(dispLen, temp);
          selectedSlice[i].x += (dispX[i] / dispLen) * step;
          selectedSlice[i].y += (dispY[i] / dispLen) * step;

          const pad = 44;
          selectedSlice[i].x = Math.max(
            pad,
            Math.min(CANVAS_WIDTH - pad, selectedSlice[i].x)
          );
          selectedSlice[i].y = Math.max(
            pad,
            Math.min(CANVAS_HEIGHT - pad, selectedSlice[i].y)
          );
        }
      }
    }

    const map = new Map<string, GraphNodeEnriched>();
    for (const n of selectedSlice) {
      map.set(n.id, n);
    }

    return {
      canvasNodes: selectedSlice,
      canvasEdges: validEdges,
      nodeMap: map,
    };
  }, [
    data,
    allEnrichedNodes,
    searchQuery,
    filterMode,
    layoutMode,
    maxVisibleNodes,
    selectedNodeId,
    cycleEdgeSet,
  ]);

  const fullNodeMap = useMemo(() => {
    const map = new Map<string, GraphNodeEnriched>();
    for (const n of allEnrichedNodes) {
      map.set(n.id, n);
    }
    return map;
  }, [allEnrichedNodes]);

  const activeNodeId = hoveredNodeId || selectedNodeId;

  const activeNeighborhood = useMemo(() => {
    const incoming = new Set<string>();
    const outgoing = new Set<string>();
    if (!data || !activeNodeId) return { incoming, outgoing };

    for (const e of data.edges) {
      if (e.target === activeNodeId) incoming.add(e.source);
      if (e.source === activeNodeId) outgoing.add(e.target);
    }
    return { incoming, outgoing };
  }, [data, activeNodeId]);

  const selectedNodeDetails = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    const node = fullNodeMap.get(selectedNodeId);
    if (!node) return null;

    const incomingSources = data.edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => e.source);
    const outgoingTargets = data.edges
      .filter((e) => e.source === selectedNodeId)
      .map((e) => e.target);

    return {
      node,
      incomingSources,
      outgoingTargets,
    };
  }, [data, selectedNodeId, fullNodeMap]);

  const topHubNode = useMemo(() => {
    const internals = allEnrichedNodes.filter((n) => n.kind === "internal_file");
    if (internals.length === 0) return null;
    return internals.reduce((best, curr) =>
      curr.total_degree > best.total_degree ? curr : best
    );
  }, [allEnrichedNodes]);

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.9;
    setZoom((prev) =>
      Math.max(0.35, Math.min(3.5, Number((prev * delta).toFixed(2))))
    );
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#09090b] p-8 text-xs text-zinc-400">
        <RefreshCw className="h-5 w-5 animate-spin text-zinc-400" />
        <div>Analyzing AST import relationships &amp; constructing dependency graph...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#09090b] p-8 text-center">
        <AlertTriangle className="h-7 w-7 text-rose-400" />
        <div className="text-sm font-semibold text-zinc-200">
          Failed to load dependency graph
        </div>
        <p className="max-w-md text-xs text-zinc-400">
          {error || "Unable to compute static import dependencies for this repository."}
        </p>
        <button
          onClick={loadGraph}
          className="mt-2 flex items-center gap-1.5 rounded bg-zinc-100 hover:bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#09090b]">
      {/* Compact Top Telemetry & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0c0c0e] px-4 py-2">
        {/* Left: Compact Architecture Telemetry Strip */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">Modules:</span>
            <strong className="font-semibold text-zinc-100">
              {data.internal_files_count}
            </strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">Edges:</span>
            <strong className="font-semibold text-zinc-100">
              {data.edges.length}
            </strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">Ext Pkgs:</span>
            <strong className="font-semibold text-zinc-100">
              {data.external_packages.length}
            </strong>
          </div>
          <span className="text-zinc-700">·</span>
          <div className="flex items-center gap-1.5">
            {data.circular_dependencies.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>0 Cycles</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{data.circular_dependencies.length} Cycles</span>
              </span>
            )}
          </div>
          {topHubNode && (
            <>
              <span className="hidden xl:inline text-zinc-700">·</span>
              <div className="hidden xl:flex items-center gap-1.5">
                <span className="text-zinc-500">Top Hub:</span>
                <button
                  onClick={() => setSelectedNodeId(topHubNode.id)}
                  className="text-blue-400 hover:underline font-medium"
                >
                  {topHubNode.label}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Search + View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44 sm:w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter modules..."
              className="w-full rounded-md border border-white/[0.08] bg-[#090b10] pl-7 pr-6 py-1 font-mono text-[11px] text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center rounded-md border border-white/[0.08] bg-[#090b10] p-0.5 text-[11px] font-medium">
            <button
              onClick={() => setSubView("canvas")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                subView === "canvas"
                  ? "bg-white/[0.1] text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Network className="h-3 w-3 text-blue-400" />
              <span>Graph</span>
            </button>
            <button
              onClick={() => setSubView("matrix")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                subView === "matrix"
                  ? "bg-white/[0.1] text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Table2 className="h-3 w-3 text-blue-400" />
              <span>Matrix &amp; Pkgs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Toolbar for Graph Filter & Layout (Shown in Graph Mode) */}
      {subView === "canvas" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0b0e15] px-4 py-1.5 text-[11px]">
          <div className="flex items-center gap-1">
            {(
              [
                { id: "all", label: "All Nodes" },
                { id: "internal", label: "Internal Files" },
                { id: "external", label: "External Pkgs" },
                { id: "cycles", label: `Cycles (${cycleNodeSet.size})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id)}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  filterMode === tab.id
                    ? "bg-blue-600/20 text-blue-300 border border-blue-500/35"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded border border-white/[0.08] bg-[#090b10] p-0.5">
              <button
                onClick={() => setLayoutMode("force")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                  layoutMode === "force"
                    ? "bg-white/[0.1] text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Network className="h-3 w-3" /> Force
              </button>
              <button
                onClick={() => setLayoutMode("radial")}
                className={`flex items-center gap-1 rounded px-2 py-0.5 ${
                  layoutMode === "radial"
                    ? "bg-white/[0.1] text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Compass className="h-3 w-3" /> Radial
              </button>
            </div>

            <select
              value={maxVisibleNodes}
              onChange={(e) => setMaxVisibleNodes(Number(e.target.value))}
              className="rounded border border-white/[0.08] bg-[#090b10] px-2 py-0.5 font-mono text-[10px] text-zinc-300 focus:border-blue-500 focus:outline-none"
            >
              <option value={50}>Top 50</option>
              <option value={85}>Top 85</option>
              <option value={140}>Top 140</option>
              <option value={250}>Top 250</option>
            </select>
          </div>
        </div>
      )}

      {/* Main Content Area: Full-Height Canvas OR Scrollable Coupling Matrix */}
      {subView === "canvas" ? (
        <div className="relative flex flex-1 overflow-hidden">
          {/* Interactive SVG Canvas */}
          <div className="relative flex-1 overflow-hidden bg-[#07090e]">
            {/* Floating Zoom Controls (Top-Right) */}
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0d1017]/90 backdrop-blur-sm p-1">
              <button
                onClick={() =>
                  setZoom((z) => Math.min(3.5, Number((z * 1.2).toFixed(2))))
                }
                className="rounded p-1.5 text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() =>
                  setZoom((z) => Math.max(0.35, Number((z * 0.8).toFixed(2))))
                }
                className="rounded p-1.5 text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={resetViewport}
                className="rounded p-1.5 text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                title="Reset Pan & Zoom"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-mono text-[10px] text-zinc-400 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Floating Legend (Bottom-Left) */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.08] bg-[#0d1017]/90 backdrop-blur-sm px-3 py-1.5 text-[10px] text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500 ring-1 ring-blue-300" />
                Python
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500 ring-1 ring-sky-300" />
                TypeScript
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-amber-300" />
                JavaScript
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-teal-600 ring-1 ring-teal-300" />
                External Pkg
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-rose-500 bg-transparent" />
                Cycle
              </span>
            </div>

            {/* Canvas Status Pill (Top-Left) */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/[0.08] bg-[#0d1017]/90 backdrop-blur-sm px-2.5 py-1 font-mono text-[10px] text-zinc-400 tabular-nums">
              {canvasNodes.length} nodes · {canvasEdges.length} edges · Drag to pan, scroll to zoom
            </div>

            {canvasNodes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                No modules match the current filter criteria.
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                className={`h-full w-full select-none ${
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                }`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <defs>
                  <pattern
                    id="dep-grid"
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.06)" />
                  </pattern>

                  <marker
                    id="arrow-default"
                    viewBox="0 -5 10 10"
                    refX="9"
                    refY="0"
                    markerWidth="5.5"
                    markerHeight="5.5"
                    orient="auto"
                  >
                    <path d="M0,-4L10,0L0,4" fill="#52525b" />
                  </marker>
                  <marker
                    id="arrow-outgoing"
                    viewBox="0 -5 10 10"
                    refX="9"
                    refY="0"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,-4L10,0L0,4" fill="#60a5fa" />
                  </marker>
                  <marker
                    id="arrow-incoming"
                    viewBox="0 -5 10 10"
                    refX="9"
                    refY="0"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,-4L10,0L0,4" fill="#34d399" />
                  </marker>
                  <marker
                    id="arrow-cycle"
                    viewBox="0 -5 10 10"
                    refX="9"
                    refY="0"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,-4L10,0L0,4" fill="#f43f5e" />
                  </marker>
                </defs>

                <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#dep-grid)" />

                <g
                  transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                  style={{ transformOrigin: "center center" }}
                >
                  {canvasEdges.map((edge) => {
                    const src = nodeMap.get(edge.source);
                    const tgt = nodeMap.get(edge.target);
                    if (!src || !tgt) return null;

                    const isOutgoingFromActive = activeNodeId === edge.source;
                    const isIncomingToActive = activeNodeId === edge.target;
                    const isHighlighted = isOutgoingFromActive || isIncomingToActive;

                    const dx = tgt.x - src.x;
                    const dy = tgt.y - src.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                    const startX = src.x + (dx / dist) * src.radius;
                    const startY = src.y + (dy / dist) * src.radius;
                    const endX = tgt.x - (dx / dist) * (tgt.radius + 4);
                    const endY = tgt.y - (dy / dist) * (tgt.radius + 4);

                    const midX = (startX + endX) / 2 - (dy / dist) * 16;
                    const midY = (startY + endY) / 2 + (dx / dist) * 16;

                    let stroke = "#3f3f46";
                    let marker = "url(#arrow-default)";
                    let strokeWidth = 1.15;
                    let opacity = activeNodeId ? 0.14 : 0.55;

                    if (edge.isCycle) {
                      stroke = "#f43f5e";
                      marker = "url(#arrow-cycle)";
                      strokeWidth = 1.8;
                      opacity = activeNodeId && !isHighlighted ? 0.35 : 0.9;
                    }
                    if (isOutgoingFromActive) {
                      stroke = "#60a5fa";
                      marker = "url(#arrow-outgoing)";
                      strokeWidth = 2.2;
                      opacity = 1;
                    } else if (isIncomingToActive) {
                      stroke = "#34d399";
                      marker = "url(#arrow-incoming)";
                      strokeWidth = 2.2;
                      opacity = 1;
                    }

                    return (
                      <path
                        key={`${edge.source}->${edge.target}`}
                        d={`M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeOpacity={opacity}
                        markerEnd={marker}
                        className={isHighlighted || edge.isCycle ? "animate-flow-dash" : undefined}
                      />
                    );
                  })}

                  {canvasNodes.map((node) => {
                    const palette = CATEGORY_COLORS[node.category];
                    const isSelected = selectedNodeId === node.id;
                    const isHovered = hoveredNodeId === node.id;
                    const isNeighbor =
                      activeNeighborhood.incoming.has(node.id) ||
                      activeNeighborhood.outgoing.has(node.id);
                    const isDimmed =
                      Boolean(activeNodeId) &&
                      activeNodeId !== node.id &&
                      !isNeighbor;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="cursor-pointer transition-opacity duration-150"
                        style={{ opacity: isDimmed ? 0.22 : 1 }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId((prev) =>
                            prev === node.id ? null : node.id
                          );
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (node.kind === "internal_file" && onSelectFile) {
                            onSelectFile(node.id);
                          }
                        }}
                      >
                        {(node.inCycle || isSelected || isHovered) && (
                          <circle
                            r={node.radius + 4.5}
                            fill="none"
                            stroke={
                              node.inCycle
                                ? "#f43f5e"
                                : isSelected
                                ? "#ffffff"
                                : palette.stroke
                            }
                            strokeWidth={isSelected ? 2.2 : 1.6}
                            strokeDasharray={
                              node.inCycle && !isSelected ? "3 2" : undefined
                            }
                          />
                        )}

                        <circle
                          r={node.radius}
                          fill={palette.fill}
                          stroke={isSelected ? "#ffffff" : palette.stroke}
                          strokeWidth={isSelected ? 2.2 : 1.4}
                        />

                        <text
                          y={node.radius + 12}
                          textAnchor="middle"
                          fill={isSelected || isHovered ? "#ffffff" : palette.text}
                          fontSize={isSelected || isHovered ? 11 : 9.5}
                          fontWeight={isSelected || isHovered ? 700 : 500}
                          className="pointer-events-none font-mono"
                        >
                          {node.label.length > 22
                            ? `${node.label.slice(0, 20)}…`
                            : node.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          {/* Right Docked Node Inspector Drawer */}
          {selectedNodeDetails && (
            <div className="w-80 shrink-0 border-l border-white/[0.07] bg-[#0d1017] p-4 overflow-y-auto space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] pb-3">
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold ${
                      CATEGORY_COLORS[selectedNodeDetails.node.category].badge
                    }`}
                  >
                    {CATEGORY_COLORS[selectedNodeDetails.node.category].label}
                  </span>
                  <h4 className="mt-1.5 truncate font-mono text-sm font-bold text-zinc-100">
                    {selectedNodeDetails.node.label}
                  </h4>
                  <p className="break-all font-mono text-[11px] text-zinc-400 mt-0.5">
                    {selectedNodeDetails.node.id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                <div className="rounded-lg border border-white/[0.07] bg-[#090b10] p-2">
                  <div className="text-[10px] text-zinc-500 uppercase">In</div>
                  <div className="font-mono text-sm font-bold text-emerald-400">
                    {selectedNodeDetails.node.in_degree}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-[#090b10] p-2">
                  <div className="text-[10px] text-zinc-500 uppercase">Out</div>
                  <div className="font-mono text-sm font-bold text-blue-400">
                    {selectedNodeDetails.node.out_degree}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-[#090b10] p-2">
                  <div className="text-[10px] text-zinc-500 uppercase">Centrality</div>
                  <div className="font-mono text-sm font-bold text-zinc-100">
                    {(selectedNodeDetails.node.centrality * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {selectedNodeDetails.node.kind === "internal_file" && onSelectFile && (
                <button
                  onClick={() => onSelectFile(selectedNodeDetails.node.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  <span>Open File in Code Viewer</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}

              <div>
                <h5 className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400 tabular-nums">
                  <ArrowDownLeft className="h-3 w-3" /> Imported By (
                  {selectedNodeDetails.incomingSources.length})
                </h5>
                {selectedNodeDetails.incomingSources.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 italic">
                    No internal modules import this target.
                  </p>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {selectedNodeDetails.incomingSources.map((src) => (
                      <button
                        key={src}
                        onClick={() => setSelectedNodeId(src)}
                        className="flex w-full items-center justify-between rounded border border-white/[0.07] bg-[#090b10] px-2.5 py-1 text-left font-mono text-[11px] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
                      >
                        <span className="truncate">{src}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h5 className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-400 tabular-nums">
                  <ArrowUpRight className="h-3 w-3" /> Direct Imports (
                  {selectedNodeDetails.outgoingTargets.length})
                </h5>
                {selectedNodeDetails.outgoingTargets.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 italic">
                    No outgoing imports detected.
                  </p>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {selectedNodeDetails.outgoingTargets.map((tgt) => (
                      <button
                        key={tgt}
                        onClick={() => setSelectedNodeId(tgt)}
                        className="flex w-full items-center justify-between rounded border border-white/[0.07] bg-[#090b10] px-2.5 py-1 text-left font-mono text-[11px] text-zinc-300 hover:border-blue-500/40 hover:text-blue-300"
                      >
                        <span className="truncate">
                          {tgt.replace(/^pkg:/, "pkg: ")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Matrix & External Packages View */
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {data.circular_dependencies.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2.5 flex items-center gap-2 tabular-nums">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Circular Dependency Chains (
                {data.circular_dependencies.length})
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data.circular_dependencies.map((cycle, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/20 bg-[#090b10] px-3 py-2 font-mono text-[11px] text-zinc-300"
                  >
                    {cycle.map((modPath, mIdx) => (
                      <React.Fragment key={`${idx}-${modPath}`}>
                        <button
                          onClick={() => {
                            setSelectedNodeId(modPath);
                            setSubView("canvas");
                          }}
                          className="text-amber-300 hover:underline"
                        >
                          {modPath}
                        </button>
                        {mIdx < cycle.length - 1 && (
                          <span className="text-zinc-600">→</span>
                        )}
                      </React.Fragment>
                    ))}
                    <span className="text-zinc-600">→</span>
                    <span className="text-rose-400">{cycle[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External Packages */}
          <div className="surface-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider mb-3 flex items-center gap-2 tabular-nums">
              <Package className="h-4 w-4 text-teal-400" /> External Package Dependencies (
              {data.external_packages.length})
            </h3>
            {data.external_packages.length === 0 ? (
              <p className="text-xs text-zinc-500">No external packages detected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.external_packages.map((pkg) => {
                  const pkgNodeId = `pkg:${pkg}`;
                  return (
                    <button
                      key={pkg}
                      onClick={() => {
                        setSelectedNodeId(pkgNodeId);
                        setSubView("canvas");
                      }}
                      className="rounded border border-white/[0.08] bg-[#090b10] px-2.5 py-1 text-xs font-mono text-teal-300 hover:border-teal-500/50 transition-colors"
                    >
                      {pkg}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Internal Module Coupling Matrix */}
          <div className="surface-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <GitFork className="h-4 w-4 text-blue-400" /> Internal Module Coupling Matrix
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allEnrichedNodes
                .filter((n) => n.kind === "internal_file")
                .filter((n) => {
                  const q = searchQuery.trim().toLowerCase();
                  return (
                    !q ||
                    n.id.toLowerCase().includes(q) ||
                    n.label.toLowerCase().includes(q)
                  );
                })
                .sort((a, b) => b.total_degree - a.total_degree)
                .slice(0, 60)
                .map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      setSubView("canvas");
                    }}
                    className="group flex items-center justify-between rounded-lg border border-white/[0.07] bg-[#090b10] hover:border-white/[0.15] p-2.5 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs font-medium text-zinc-200 group-hover:text-blue-400">
                          {node.label}
                        </span>
                        {node.inCycle && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-rose-300">
                            Cycle
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[10px] text-zinc-500">
                        {node.id}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums">
                      <span
                        className="rounded border border-white/[0.07] bg-[#11151f] px-1.5 py-0.5 text-emerald-300"
                        title="Incoming imports (dependents)"
                      >
                        In:{node.in_degree}
                      </span>
                      <span
                        className="rounded border border-white/[0.07] bg-[#11151f] px-1.5 py-0.5 text-blue-300"
                        title="Outgoing imports (dependencies)"
                      >
                        Out:{node.out_degree}
                      </span>
                      {onSelectFile && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectFile(node.id);
                          }}
                          className="rounded bg-white/[0.06] p-1 text-zinc-300 hover:bg-blue-600 hover:text-white"
                          title="Open file in Code Viewer"
                        >
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
