"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitBranch,
  Search,
  Sparkles,
  BarChart3,
  LayoutGrid,
  Cpu,
  ChevronRight,
  FolderGit2,
} from "lucide-react";
import { Repository } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();

  useEffect(() => {
    if (!onOpenSearch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenSearch]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#060911]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand & Context Breadcrumb */}
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="group flex items-center gap-2.5 font-bold tracking-tight text-white"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 shadow-md shadow-indigo-500/25 ring-1 ring-white/15 transition-transform duration-200 group-hover:scale-105">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-white">
                Repo<span className="text-indigo-400">Lens</span>
              </span>
              <span className="hidden sm:inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                v2.0
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-white/[0.08] pl-5">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                pathname === "/"
                  ? "bg-white/[0.07] text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-indigo-400" />
              <span>Repositories</span>
            </Link>

            <Link
              href="/evaluation"
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                pathname?.startsWith("/evaluation")
                  ? "bg-white/[0.07] text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Benchmarks</span>
            </Link>
          </nav>

          {/* Active Repository Switcher */}
          {repositories.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 border-l border-white/[0.08] pl-4">
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              <FolderGit2 className="h-3.5 w-3.5 text-indigo-400" />
              <select
                value={currentRepo?.id || ""}
                onChange={(e) => {
                  const r = repositories.find((x) => x.id === e.target.value);
                  if (r && onSelectRepo) onSelectRepo(r);
                }}
                aria-label="Select repository"
                className="rounded-lg border border-white/[0.08] bg-slate-900/90 px-2.5 py-1 font-mono text-xs text-slate-200 outline-none transition-colors hover:border-indigo-500/40 focus:border-indigo-500"
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

        {/* Right: Search Command Pill, Status Beacon & Actions */}
        <div className="flex items-center gap-2.5">
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="group flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-slate-900/80 px-3 py-1.5 text-xs text-slate-400 shadow-inner transition-all hover:border-indigo-500/40 hover:bg-slate-900 hover:text-slate-200"
            >
              <Search className="h-3.5 w-3.5 text-indigo-400 transition-transform group-hover:scale-110" />
              <span className="hidden sm:inline">Hybrid RRF Search...</span>
              <kbd className="rounded border border-white/10 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Engine Telemetry Pill */}
          <div className="hidden xl:flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <Cpu className="h-3 w-3 text-emerald-400" />
            <span className="font-mono text-[10px]">AST + RRF Ready</span>
          </div>

          <Link
            href="/evaluation"
            className="flex md:hidden items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500/40 hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
            <span>Benchmarks</span>
          </Link>

          <Link
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-900/60 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:border-white/15 hover:text-white transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
