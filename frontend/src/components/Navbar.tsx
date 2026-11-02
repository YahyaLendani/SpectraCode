"use client";

import React from "react";
import Link from "next/link";
import { GitBranch, Layers, Search, Sparkles, BarChart3, Database } from "lucide-react";
import { Repository } from "@/lib/api";

interface NavbarProps {
  repositories?: Repository[];
  currentRepo?: Repository | null;
  onSelectRepo?: (repo: Repository) => void;
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  repositories = [],
  currentRepo,
  onSelectRepo,
  onOpenSearch,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-tight">
              Repo<span className="text-indigo-400">Lens</span>
            </span>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
              v1.0
            </span>
          </Link>

          {/* Repo Selector */}
          {repositories.length > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs text-slate-500">Repository:</span>
              <select
                value={currentRepo?.id || ""}
                onChange={(e) => {
                  const r = repositories.find((x) => x.id === e.target.value);
                  if (r && onSelectRepo) onSelectRepo(r);
                }}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
              >
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.github_owner}/{r.github_name} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors"
            >
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Hybrid Search...</span>
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
            </button>
          )}

          <Link
            href="/evaluation"
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-600 hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
            <span>Benchmark Suite</span>
          </Link>

          <Link
            href="https://github.com"
            target="_blank"
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
