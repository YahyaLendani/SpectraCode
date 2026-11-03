"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitBranch,
  Search,
  BarChart3,
  LayoutGrid,
  Cpu,
  ChevronRight,
  FolderGit2,
  Terminal,
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
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#0b0f17]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand & Context Breadcrumb */}
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="group flex items-center gap-2.5 font-bold tracking-tight text-slate-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-500/30 bg-blue-600/15 text-blue-400 transition-colors group-hover:border-blue-400/50 group-hover:bg-blue-600/25">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-100">
                Repo<span className="text-blue-400">Lens</span>
              </span>
              <span className="hidden sm:inline-flex items-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400 tabular-nums">
                v2.0
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-slate-800 pl-5">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                pathname === "/"
                  ? "bg-slate-800/90 text-slate-100"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-blue-400" />
              <span>Repositories</span>
            </Link>

            <Link
              href="/evaluation"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                pathname?.startsWith("/evaluation")
                  ? "bg-slate-800/90 text-slate-100"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5 text-teal-400" />
              <span>Benchmarks</span>
            </Link>
          </nav>

          {/* Active Repository Switcher */}
          {repositories.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 border-l border-slate-800 pl-4">
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              <FolderGit2 className="h-3.5 w-3.5 text-blue-400" />
              <select
                value={currentRepo?.id || ""}
                onChange={(e) => {
                  const r = repositories.find((x) => x.id === e.target.value);
                  if (r && onSelectRepo) onSelectRepo(r);
                }}
                aria-label="Select repository"
                className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-200 outline-none transition-colors hover:border-slate-700 focus:border-blue-500"
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
              className="group flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
            >
              <Search className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Hybrid RRF Search...</span>
              <kbd className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Engine Telemetry Pill */}
          <div className="hidden xl:flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <Cpu className="h-3 w-3 text-emerald-400" />
            <span className="font-mono text-[10px]">AST + RRF Ready</span>
          </div>

          <Link
            href="/evaluation"
            className="flex md:hidden items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
            <span>Benchmarks</span>
          </Link>

          <Link
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
