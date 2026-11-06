"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  GitBranch,
  Search,
  BarChart3,
  LayoutGrid,
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
  const router = useRouter();

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
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#06080d]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand & Primary Navigation */}
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="group flex items-center gap-2.5 text-zinc-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-400 transition-colors group-hover:border-blue-400/50 group-hover:bg-blue-500/20">
              <Terminal className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-zinc-100 font-mono">
                Repo<span className="text-blue-400">Lens</span>
              </span>
              <span className="hidden sm:inline-flex items-center rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400 tabular-nums">
                v2.0
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-white/[0.08] pl-5">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
                pathname === "/"
                  ? "bg-white/[0.09] text-zinc-100 font-semibold"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              )}
            >
              <LayoutGrid
                className={cn(
                  "h-3.5 w-3.5",
                  pathname === "/" ? "text-blue-400" : "text-slate-400"
                )}
              />
              <span>Workspaces</span>
            </Link>

            <Link
              href="/evaluation"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
                pathname?.startsWith("/evaluation")
                  ? "bg-white/[0.09] text-zinc-100 font-semibold"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              )}
            >
              <BarChart3
                className={cn(
                  "h-3.5 w-3.5",
                  pathname?.startsWith("/evaluation")
                    ? "text-blue-400"
                    : "text-slate-400"
                )}
              />
              <span>Benchmarks</span>
            </Link>
          </nav>

          {/* Quick Workspace Jump Selector */}
          {repositories.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 border-l border-white/[0.08] pl-4">
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
              <FolderGit2 className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={currentRepo?.id || ""}
                onChange={(e) => {
                  const r = repositories.find((x) => x.id === e.target.value);
                  if (!r) return;
                  if (onSelectRepo) {
                    onSelectRepo(r);
                  } else {
                    router.push(`/repos/${r.id}`);
                  }
                }}
                aria-label="Jump to repository workspace"
                className="cursor-pointer rounded-md border border-white/[0.1] bg-[#0a0e17] px-2.5 py-1 font-mono text-xs text-slate-200 outline-none transition-colors hover:border-white/[0.2] focus:border-blue-500"
              >
                {!currentRepo && (
                  <option value="" disabled>
                    Jump to workspace...
                  </option>
                )}
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.github_owner}/{r.github_name} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Search Command Pill, Engine Status & External Links */}
        <div className="flex items-center gap-2.5">
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              aria-label="Open search dialog (Ctrl+K or Cmd+K)"
              className="group flex cursor-pointer items-center gap-2.5 rounded-md border border-white/[0.1] bg-[#0a0e17] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/[0.2] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Search className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Search symbols &amp; code...</span>
              <kbd className="rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Subtle Engine Status Indicator */}
          <div className="hidden xl:flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#0a0e17] px-2.5 py-1 text-[11px] text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] font-medium tracking-tight text-slate-200">
              AST · RRF · ONNX
            </span>
          </div>

          <Link
            href="/evaluation"
            aria-label="Navigate to benchmarks"
            className="flex md:hidden cursor-pointer items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0a0e17] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-white/[0.2] hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
            <span>Benchmarks</span>
          </Link>

          <Link
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="View source repository on GitHub"
            className="hidden sm:flex cursor-pointer items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0a0e17] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-white/[0.2] hover:text-white transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5 text-slate-400" />
            <span>GitHub</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
