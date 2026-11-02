"use client";

import React, { useEffect, useState } from "react";
import { GitFork, Package, ShieldCheck, AlertCircle, ArrowUpRight, Network } from "lucide-react";
import { api, DependencyGraph as DependencyGraphData } from "@/lib/api";

interface DependencyGraphProps {
  repoId: string;
  onSelectFile?: (filePath: string) => void;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  repoId,
  onSelectFile,
}) => {
  const [data, setData] = useState<DependencyGraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api
      .getDependencies(repoId)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [repoId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-xs text-slate-500">
        Analyzing import relationships and constructing dependency graph...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Failed to load dependency graph.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-950">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
            <Network className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Internal Modules
            </span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data.internal_files_count}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Parsed source code files in repository
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-cyan-400 mb-1">
            <Package className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              External Packages
            </span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data.external_packages.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Third-party package imports detected
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Circular Cycles
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {data.circular_dependencies.length === 0 ? "0 Cycles" : `${data.circular_dependencies.length} Detected`}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {data.circular_dependencies.length === 0
              ? "Clean acyclic dependency structure"
              : "Potential module coupling cycles"}
          </p>
        </div>
      </div>

      {/* External Packages List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-cyan-400" /> Third-Party Dependencies
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.external_packages.map((pkg) => (
            <span
              key={pkg}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-mono text-cyan-300"
            >
              {pkg}
            </span>
          ))}
        </div>
      </div>

      {/* Module Coupling Matrix */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
          <GitFork className="h-4 w-4 text-indigo-400" /> Module Import Dependencies ({data.edges.length} edges)
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.nodes
            .filter((n) => n.kind === "internal_file")
            .map((node) => (
              <div
                key={node.id}
                onClick={() => onSelectFile && onSelectFile(node.id)}
                className="group flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/70 p-3 hover:border-indigo-500/50 cursor-pointer transition-all"
              >
                <div>
                  <div className="font-mono text-xs font-medium text-slate-200 group-hover:text-indigo-300">
                    {node.label}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                    {node.id}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="rounded bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 text-indigo-300" title="Incoming imports (popularity)">
                    In: {node.in_degree}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400" title="Outgoing imports (fan-out)">
                    Out: {node.out_degree}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
