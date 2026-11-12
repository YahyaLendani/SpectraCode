"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, Maximize2, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { api, DependencyGraph as DependencyGraphData } from "@/lib/api";
import { cn, LINE_COLORS } from "@/lib/utils";

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

/*
 * Drawing colours for the map. SVG attributes cannot take Tailwind classes,
 * so these are the Line Map token values as raw hex.
 */
const INK = "#15171A";
const PAPER = "#FFFFFF";
const SUNK = "#E9EBED";
const WASH = "#F3F4F5";
const SIGNAL = "#FFD400";
const SIGNAL_SOFT = "#FFF3B0";
const EDGE = "#9BA1A8";
const EDGE_FADED = "#D9DCDF";
const STATION_DIM = "#C9CDD1";
const LABEL_DIM = "#9BA1A8";
const IMPORTS = LINE_COLORS[0]; // blue: files the active station imports
const IMPORTED_BY = LINE_COLORS[1]; // red: files that import the active station
const CIRCULAR = LINE_COLORS[3]; // orange: part of a circular import

/*
 * A station's ring says what kind of file it is. Blue, red and orange are
 * taken by the lines above, so languages use the three line colours left
 * over. Packages keep an ink ring and get a grey fill instead.
 */
const CATEGORY_STYLE: Record<
  GraphNodeEnriched["category"],
  { stroke: string; label: string }
> = {
  python: { stroke: LINE_COLORS[4], label: "Python file" },
  typescript: { stroke: LINE_COLORS[5], label: "TypeScript file" },
  javascript: { stroke: LINE_COLORS[2], label: "JavaScript file" },
  other: { stroke: INK, label: "Other file" },
  external: { stroke: INK, label: "External package" },
};

const CATEGORY_ORDER: GraphNodeEnriched["category"][] = [
  "python",
  "typescript",
  "javascript",
  "other",
  "external",
];

const ARROWS = [
  { id: "dep-arrow-default", color: EDGE, size: 8 },
  { id: "dep-arrow-faded", color: EDGE_FADED, size: 8 },
  { id: "dep-arrow-imports", color: IMPORTS, size: 10 },
  { id: "dep-arrow-imported-by", color: IMPORTED_BY, size: 10 },
  { id: "dep-arrow-circular", color: CIRCULAR, size: 8 },
] as const;

/* Local to this file: ticks that travel along the selected station's lines. */
const FLOW_CSS = `
@keyframes dep-flow { to { stroke-dashoffset: -24; } }
.dep-flow { animation: dep-flow 1.2s linear infinite; }
`;

const LABEL_FONT =
  'var(--font-sans), "Segoe UI", "Helvetica Neue", Arial, sans-serif';

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const StationSwatch: React.FC<{ stroke: string; fill?: string }> = ({
  stroke,
  fill = PAPER,
}) => (
  <svg
    aria-hidden="true"
    width={14}
    height={14}
    viewBox="0 0 14 14"
    className="shrink-0"
  >
    <circle cx={7} cy={7} r={5} fill={fill} stroke={stroke} strokeWidth={3} />
  </svg>
);

const LineSwatch: React.FC<{ stroke: string; dashed?: boolean }> = ({
  stroke,
  dashed,
}) => (
  <svg
    aria-hidden="true"
    width={22}
    height={14}
    viewBox="0 0 22 14"
    className="shrink-0"
  >
    <line
      x1={1}
      y1={7}
      x2={21}
      y2={7}
      stroke={stroke}
      strokeWidth={2.5}
      strokeDasharray={dashed ? "5 3" : undefined}
    />
  </svg>
);

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

    // The selected file is sorted first only so it survives the cut. Lay the
    // stations out in an order that ignores selection, or the map would
    // reshuffle on every click.
    const selectedSlice = sorted
      .slice(0, maxVisibleNodes)
      .sort((a, b) => {
        if (a.inCycle !== b.inCycle) return a.inCycle ? -1 : 1;
        if (b.total_degree !== a.total_degree) return b.total_degree - a.total_degree;
        return a.id.localeCompare(b.id);
      })
      .map((n) => ({ ...n }));
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
      <div className="flex h-full flex-col bg-white" aria-busy="true">
        <div className="flex items-center gap-4 border-b border-rule px-4 py-3">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-5 w-48" />
          <div className="skeleton ml-auto h-8 w-52" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <p role="status" className="text-sm text-sub">
            Reading imports
          </p>
          <div className="skeleton h-4 w-72 max-w-full" />
          <div className="skeleton h-4 w-56 max-w-full" />
          <div className="skeleton h-4 w-64 max-w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full bg-white p-4">
        <p role="alert" className="note note-error max-w-2xl">
          The import map could not be loaded{error ? ` (${error})` : ""}. Try
          again. If it keeps failing, check that the SpectraCode API is running.
        </p>
        <button type="button" onClick={loadGraph} className="btn btn-sm mt-3">
          Try again
        </button>
      </div>
    );
  }

  const cycleCount = data.circular_dependencies.length;
  const hasNodes = allEnrichedNodes.length > 0;
  const hasImports = data.edges.length > 0;

  const presentCategories = CATEGORY_ORDER.filter((c) =>
    canvasNodes.some((n) => n.category === c)
  );

  // Draw the active station's lines last so they sit on top of faded ones.
  const edgeRank = (e: { source: string; target: string }) =>
    e.source === activeNodeId || e.target === activeNodeId ? 1 : 0;
  const orderedEdges = activeNodeId
    ? [...canvasEdges].sort((a, b) => edgeRank(a) - edgeRank(b))
    : canvasEdges;

  const listQuery = searchQuery.trim().toLowerCase();
  const connectedRows =
    subView === "matrix"
      ? allEnrichedNodes
          .filter((n) => n.kind === "internal_file")
          .filter(
            (n) =>
              !listQuery ||
              n.id.toLowerCase().includes(listQuery) ||
              n.label.toLowerCase().includes(listQuery)
          )
          .sort((a, b) => b.total_degree - a.total_degree)
          .slice(0, 60)
      : [];

  const showOnMap = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSubView("canvas");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="border-b border-rule bg-white px-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1">
          <div role="group" aria-label="View" className="flex gap-4">
            {(
              [
                { id: "canvas", label: "Map" },
                { id: "matrix", label: "Lists" },
              ] as const
            ).map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setSubView(view.id)}
                aria-pressed={subView === view.id}
                className="tab h-9"
              >
                {view.label}
              </button>
            ))}
          </div>

          <p className="min-w-0 flex-1 basis-64 text-sm text-sub tabular-nums">
            {count(data.internal_files_count, "file", "files")},{" "}
            {count(data.edges.length, "import", "imports")},{" "}
            {count(
              data.external_packages.length,
              "external package",
              "external packages"
            )}
            ,{" "}
            {cycleCount === 0
              ? "no circular imports"
              : count(cycleCount, "circular import", "circular imports")}
            .
            {topHubNode && (
              <span className="hidden xl:inline">
                {" "}
                Most connected:{" "}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(topHubNode.id)}
                  className="cursor-pointer font-mono text-[0.8125rem] font-semibold text-ink underline transition-colors duration-150 hover:text-line-blue"
                >
                  {topHubNode.label}
                </button>
              </span>
            )}
          </p>

          <div className="relative w-48 shrink-0 sm:w-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sub"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name"
              aria-label="Filter files and packages by name"
              className="field field-sm pl-8 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear the filter"
                title="Clear the filter"
                className="btn-icon absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {subView === "canvas" ? (
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
            <div role="group" aria-label="Show on the map" className="flex gap-4">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "internal", label: "Files" },
                  { id: "external", label: "Packages" },
                  { id: "cycles", label: "Circular" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  aria-pressed={filterMode === tab.id}
                  title={
                    tab.id === "cycles"
                      ? `${count(cycleNodeSet.size, "file is", "files are")} part of a circular import`
                      : undefined
                  }
                  className="tab h-9"
                >
                  {tab.label}
                  {tab.id === "cycles" && (
                    <span className="font-normal tabular-nums text-sub">
                      {cycleNodeSet.size}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-1">
              <select
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
                aria-label="Layout"
                className="field field-sm w-auto cursor-pointer"
              >
                <option value="force">Cluster layout</option>
                <option value="radial">Ring layout</option>
              </select>

              <select
                value={maxVisibleNodes}
                onChange={(e) => setMaxVisibleNodes(Number(e.target.value))}
                aria-label="How many stations to show"
                className="field field-sm w-auto cursor-pointer"
              >
                <option value={50}>Up to 50 stations</option>
                <option value={85}>Up to 85 stations</option>
                <option value={140}>Up to 140 stations</option>
                <option value={250}>Up to 250 stations</option>
              </select>

              <div role="group" aria-label="Zoom" className="flex items-center">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) => Math.max(0.35, Number((z * 0.8).toFixed(2))))
                  }
                  aria-label="Zoom out"
                  title="Zoom out"
                  className="btn-icon"
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="w-11 text-center text-[0.8125rem] text-sub tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) => Math.min(3.5, Number((z * 1.2).toFixed(2))))
                  }
                  aria-label="Zoom in"
                  title="Zoom in"
                  className="btn-icon"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={resetViewport}
                  aria-label="Reset zoom and position"
                  title="Reset zoom and position"
                  className="btn-icon"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-1" />
        )}
      </div>

      {subView === "canvas" ? (
        <div className="relative flex flex-1 overflow-hidden">
          {/* The map */}
          <div className="relative flex-1 overflow-hidden bg-white">
            {!hasNodes ? (
              <p className="max-w-[62ch] p-4 text-sm text-sub">
                No import relationships were found. SpectraCode reads imports in
                Python, TypeScript and JavaScript files.
              </p>
            ) : canvasNodes.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-ink-2">
                  No file or package matches this filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterMode("all");
                  }}
                  className="btn btn-sm mt-3"
                >
                  Clear the filter
                </button>
              </div>
            ) : (
              <>
                <p
                  className={cn(
                    "pointer-events-none absolute left-3 top-2 z-10 max-w-[calc(100%-1.5rem)] bg-white px-1 text-sub tabular-nums",
                    hasImports ? "text-xs" : "text-sm"
                  )}
                >
                  {hasImports ? (
                    <>
                      Showing {count(canvasNodes.length, "station", "stations")}{" "}
                      and {count(canvasEdges.length, "import", "imports")}. Drag
                      to move, scroll to zoom
                      {onSelectFile ? ", double-click a file to open it" : ""}.
                    </>
                  ) : (
                    <>
                      No import relationships were found. SpectraCode reads imports
                      in Python, TypeScript and JavaScript files.
                    </>
                  )}
                </p>

                {/* Legend */}
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex gap-5 rounded border border-rule bg-white p-3 text-xs text-ink-2">
                  <ul className="space-y-1">
                    {presentCategories.map((c) => (
                      <li key={c} className="flex items-center gap-1.5">
                        <StationSwatch
                          stroke={CATEGORY_STYLE[c].stroke}
                          fill={c === "external" ? SUNK : PAPER}
                        />
                        {CATEGORY_STYLE[c].label}
                      </li>
                    ))}
                    <li className="flex items-center gap-1.5">
                      <StationSwatch stroke={INK} fill={SIGNAL} />
                      Selected
                    </li>
                  </ul>
                  <ul className="space-y-1">
                    <li className="flex items-center gap-1.5">
                      <LineSwatch stroke={IMPORTS} />
                      Imports
                    </li>
                    <li className="flex items-center gap-1.5">
                      <LineSwatch stroke={IMPORTED_BY} />
                      Imported by
                    </li>
                    <li className="flex items-center gap-1.5">
                      <LineSwatch stroke={CIRCULAR} dashed />
                      Circular import
                    </li>
                  </ul>
                </div>

                <svg
                  ref={svgRef}
                  role="img"
                  aria-label="Map of which files import which"
                  viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                  className={cn(
                    "h-full w-full select-none",
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  )}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <defs>
                    <style>{FLOW_CSS}</style>
                    {ARROWS.map((arrow) => (
                      <marker
                        key={arrow.id}
                        id={arrow.id}
                        viewBox="0 -5 10 10"
                        refX="9"
                        refY="0"
                        markerUnits="userSpaceOnUse"
                        markerWidth={arrow.size}
                        markerHeight={arrow.size}
                        orient="auto"
                      >
                        <path d="M0,-4L10,0L0,4Z" fill={arrow.color} />
                      </marker>
                    ))}
                  </defs>

                  <g
                    transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                    style={{ transformOrigin: "center center" }}
                  >
                    {orderedEdges.map((edge) => {
                      const src = nodeMap.get(edge.source);
                      const tgt = nodeMap.get(edge.target);
                      if (!src || !tgt) return null;

                      const isOutgoingFromActive = activeNodeId === edge.source;
                      const isIncomingToActive = activeNodeId === edge.target;
                      const isHighlighted =
                        isOutgoingFromActive || isIncomingToActive;

                      const dx = tgt.x - src.x;
                      const dy = tgt.y - src.y;
                      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                      const startX = src.x + (dx / dist) * src.radius;
                      const startY = src.y + (dy / dist) * src.radius;
                      const endX = tgt.x - (dx / dist) * (tgt.radius + 4);
                      const endY = tgt.y - (dy / dist) * (tgt.radius + 4);

                      const midX = (startX + endX) / 2 - (dy / dist) * 16;
                      const midY = (startY + endY) / 2 + (dx / dist) * 16;

                      let stroke: string = EDGE;
                      let marker = "url(#dep-arrow-default)";
                      let strokeWidth = 1.5;

                      if (edge.isCycle) {
                        stroke = CIRCULAR;
                        marker = "url(#dep-arrow-circular)";
                      }
                      if (isOutgoingFromActive) {
                        stroke = IMPORTS;
                        marker = "url(#dep-arrow-imports)";
                        strokeWidth = 2.5;
                      } else if (isIncomingToActive) {
                        stroke = IMPORTED_BY;
                        marker = "url(#dep-arrow-imported-by)";
                        strokeWidth = 2.5;
                      } else if (activeNodeId) {
                        stroke = EDGE_FADED;
                        marker = "url(#dep-arrow-faded)";
                      }

                      const d = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;

                      // Flow runs only on the selected station's own lines.
                      const flows =
                        isHighlighted &&
                        !edge.isCycle &&
                        selectedNodeId !== null &&
                        (edge.source === selectedNodeId ||
                          edge.target === selectedNodeId);

                      return (
                        <g key={`${edge.source}->${edge.target}`}>
                          <path
                            d={d}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            strokeDasharray={edge.isCycle ? "6 4" : undefined}
                            markerEnd={marker}
                          />
                          {flows && (
                            <path
                              d={d}
                              fill="none"
                              stroke={PAPER}
                              strokeWidth={1}
                              strokeDasharray="4 8"
                              className="dep-flow"
                            />
                          )}
                        </g>
                      );
                    })}

                    {canvasNodes.map((node) => {
                      const kindStyle = CATEGORY_STYLE[node.category];
                      const isSelected = selectedNodeId === node.id;
                      const isHovered = hoveredNodeId === node.id;
                      const isNeighbor =
                        activeNeighborhood.incoming.has(node.id) ||
                        activeNeighborhood.outgoing.has(node.id);
                      const isDimmed =
                        Boolean(activeNodeId) &&
                        activeNodeId !== node.id &&
                        !isNeighbor &&
                        !isSelected;

                      const fill = isSelected
                        ? SIGNAL
                        : isHovered
                        ? SIGNAL_SOFT
                        : node.category === "external"
                        ? isDimmed
                          ? WASH
                          : SUNK
                        : PAPER;
                      const stroke = isSelected
                        ? INK
                        : isDimmed
                        ? STATION_DIM
                        : node.inCycle
                        ? CIRCULAR
                        : kindStyle.stroke;

                      // Labels sit to the right, or to the left near the right edge.
                      const labelLeft = node.x > CANVAS_WIDTH - 150;

                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className="cursor-pointer"
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
                          <title>
                            {node.kind === "external_package"
                              ? node.label
                              : node.id}
                          </title>
                          <circle
                            r={node.radius}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={3}
                            style={{ transition: "fill 150ms, stroke 150ms" }}
                          />
                          <text
                            x={labelLeft ? -(node.radius + 6) : node.radius + 6}
                            y={0}
                            dominantBaseline="central"
                            textAnchor={labelLeft ? "end" : "start"}
                            fill={isDimmed ? LABEL_DIM : INK}
                            fontSize={12}
                            fontWeight={600}
                            stroke={PAPER}
                            strokeWidth={3}
                            strokeLinejoin="round"
                            className="pointer-events-none"
                            style={{
                              fontFamily: LABEL_FONT,
                              paintOrder: "stroke",
                            }}
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
              </>
            )}
          </div>

          {/* Details for the selected station */}
          {selectedNodeDetails && (
            <aside
              aria-label="Selected file"
              className="w-80 shrink-0 overflow-y-auto border-l border-rule bg-wash p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-all font-mono text-sm font-bold text-ink">
                    {selectedNodeDetails.node.kind === "external_package"
                      ? selectedNodeDetails.node.label
                      : selectedNodeDetails.node.id}
                  </h4>
                  <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-sub">
                    <StationSwatch
                      stroke={
                        selectedNodeDetails.node.inCycle
                          ? CIRCULAR
                          : CATEGORY_STYLE[selectedNodeDetails.node.category]
                              .stroke
                      }
                      fill={
                        selectedNodeDetails.node.category === "external"
                          ? SUNK
                          : PAPER
                      }
                    />
                    {CATEGORY_STYLE[selectedNodeDetails.node.category].label}
                    {selectedNodeDetails.node.inCycle
                      ? ", part of a circular import"
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="Close details"
                  title="Close details"
                  className="btn-icon -mr-1.5 -mt-1.5 shrink-0 hover:bg-sunk"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-3 text-[0.8125rem] text-sub tabular-nums">
                {count(
                  selectedNodeDetails.node.total_degree,
                  "import link",
                  "import links"
                )}
                , counting both directions. Degree centrality{" "}
                {(selectedNodeDetails.node.centrality * 100).toFixed(1)}%: its
                links divided by the number of other files and packages.
              </p>

              {selectedNodeDetails.node.kind === "internal_file" &&
                onSelectFile && (
                  <button
                    type="button"
                    onClick={() => onSelectFile(selectedNodeDetails.node.id)}
                    className="btn btn-sm mt-3"
                  >
                    Open in code
                  </button>
                )}

              <section className="mt-5">
                <h5 className="flex items-center gap-2 text-sm font-bold text-ink tabular-nums">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-line-blue"
                  />
                  Imports ({selectedNodeDetails.outgoingTargets.length})
                </h5>
                {selectedNodeDetails.outgoingTargets.length === 0 ? (
                  <p className="mt-1 text-[0.8125rem] text-sub">
                    No imports found.
                  </p>
                ) : (
                  <ul className="-mx-2 mt-1 max-h-56 overflow-y-auto">
                    {selectedNodeDetails.outgoingTargets.map((tgt) => (
                      <li key={tgt}>
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(tgt)}
                          className="block w-full cursor-pointer break-all rounded px-2 py-1 text-left font-mono text-[0.8125rem] leading-5 text-ink-2 transition-colors duration-150 hover:bg-sunk focus-visible:-outline-offset-2 active:bg-rule"
                        >
                          {tgt.startsWith("pkg:") ? (
                            <>
                              {tgt.slice(4)}{" "}
                              <span className="font-sans text-xs text-sub">
                                package
                              </span>
                            </>
                          ) : (
                            tgt
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-5">
                <h5 className="flex items-center gap-2 text-sm font-bold text-ink tabular-nums">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-line-red"
                  />
                  Imported by ({selectedNodeDetails.incomingSources.length})
                </h5>
                {selectedNodeDetails.incomingSources.length === 0 ? (
                  <p className="mt-1 text-[0.8125rem] text-sub">
                    No file in this repository imports it.
                  </p>
                ) : (
                  <ul className="-mx-2 mt-1 max-h-56 overflow-y-auto">
                    {selectedNodeDetails.incomingSources.map((src) => (
                      <li key={src}>
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(src)}
                          className="block w-full cursor-pointer break-all rounded px-2 py-1 text-left font-mono text-[0.8125rem] leading-5 text-ink-2 transition-colors duration-150 hover:bg-sunk focus-visible:-outline-offset-2 active:bg-rule"
                        >
                          {src}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          )}
        </div>
      ) : (
        /* Lists: circular imports, external packages, most connected files */
        <div className="flex-1 space-y-7 overflow-y-auto bg-white p-4">
          <section aria-label="Circular imports">
            {cycleCount === 0 ? (
              <p className="text-sm text-sub">No circular imports.</p>
            ) : (
              <details className="note note-warn">
                <summary className="cursor-pointer font-semibold tabular-nums">
                  {count(cycleCount, "circular import", "circular imports")} found
                </summary>
                <ol className="mt-2 space-y-1">
                  {data.circular_dependencies.map((cycle, idx) => (
                    <li
                      key={idx}
                      className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[0.8125rem] text-ink"
                    >
                      {cycle.map((modPath) => (
                        <React.Fragment key={`${idx}-${modPath}`}>
                          <button
                            type="button"
                            onClick={() => showOnMap(modPath)}
                            className="cursor-pointer break-all py-1 text-left font-semibold hover:underline"
                          >
                            {modPath}
                          </button>
                          <span aria-hidden="true">→</span>
                        </React.Fragment>
                      ))}
                      <span className="break-all py-1">{cycle[0]}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold text-ink tabular-nums">
              External packages ({data.external_packages.length})
            </h3>
            {data.external_packages.length === 0 ? (
              <p className="mt-1 text-sm text-sub">No external packages found.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {data.external_packages.map((pkg) => (
                  <li key={pkg}>
                    <button
                      type="button"
                      onClick={() => showOnMap(`pkg:${pkg}`)}
                      title={`Show ${pkg} on the map`}
                      className="tag h-7 cursor-pointer px-2 font-mono transition-colors duration-150 hover:border-ink hover:bg-wash active:bg-sunk"
                    >
                      {pkg}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold text-ink">Most connected files</h3>
            <p className="mt-0.5 text-[0.8125rem] text-sub">
              Up to 60 files, ordered by how many import links they have. Select
              one to find it on the map.
            </p>
            {connectedRows.length === 0 ? (
              <p className="mt-3 text-sm text-sub">
                {listQuery ? "No file matches this filter." : "No files to list."}
              </p>
            ) : (
              <table className="board mt-3">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col" className="num whitespace-nowrap !font-sans">
                      Imports
                    </th>
                    <th scope="col" className="num whitespace-nowrap !font-sans">
                      Imported by
                    </th>
                    {onSelectFile && (
                      <th scope="col" className="!pr-0">
                        <span className="sr-only">Open in code</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {connectedRows.map((node) => (
                    <tr
                      key={node.id}
                      onClick={() => showOnMap(node.id)}
                      className="cursor-pointer"
                    >
                      <td className="w-full max-w-0 !py-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              showOnMap(node.id);
                            }}
                            className="min-w-0 cursor-pointer truncate text-left font-mono text-[0.8125rem] font-semibold text-ink hover:underline"
                          >
                            {node.label}
                          </button>
                          {node.inCycle && (
                            <span className="tag shrink-0">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-line-orange"
                              />
                              Circular
                            </span>
                          )}
                        </div>
                        <span className="block truncate font-mono text-xs text-sub">
                          {node.id}
                        </span>
                      </td>
                      <td className="num !py-1.5 text-sm">{node.out_degree}</td>
                      <td className="num !py-1.5 text-sm">{node.in_degree}</td>
                      {onSelectFile && (
                        <td className="!py-1 !pr-0 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectFile(node.id);
                            }}
                            aria-label={`Open ${node.id} in code`}
                            title="Open in code"
                            className="btn-icon hover:bg-sunk"
                          >
                            <FileCode2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
