"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderGit2,
  Plus,
  ArrowUpRight,
  BarChart3,
  Clock,
  AlertCircle,
  Search,
  GitBranch,
  GitCommit,
  RefreshCw,
  Zap,
  Terminal,
} from "lucide-react";
import { api, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { RepoImportModal } from "@/components/RepoImportModal";
import dynamic from "next/dynamic";

const RemotionPipelinePlayer = dynamic(
  () =>
    import("@/components/animations/RemotionPipelinePlayer").then(
      (mod) => mod.RemotionPipelinePlayer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-80 rounded-2xl border border-white/[0.08] bg-[#070a12] flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <div className="h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />
          <span>Loading 60fps Remotion Pipeline...</span>
        </div>
      </div>
    ),
  }
);

export default function DashboardPage() {
  const router = useRouter();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "indexing">("all");
  const [importingSample, setImportingSample] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadRepos = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const list = await api.listRepositories();
      setRepositories(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRepos();
    const interval = setInterval(() => loadRepos(true), 4500);
    return () => clearInterval(interval);
  }, []);

  // Press "/" to focus the repository filter input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !isImportOpen &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImportOpen]);

  const handleQuickSampleImport = async () => {
    try {
      setImportingSample(true);
      await api.importRepository("sample:fastapi");
      await loadRepos(true);
    } catch (err) {
      console.error(err);
    } finally {
      setImportingSample(false);
    }
  };

  const telemetry = useMemo(() => {
    const totalRepos = repositories.length;
    const readyRepos = repositories.filter((r) => r.status === "ready").length;
    const indexingRepos = repositories.filter((r) =>
      ["pending", "cloning", "parsing_ast", "embedding"].includes(r.status)
    ).length;
    const totalFiles = repositories.reduce((acc, r) => acc + (r.total_files || 0), 0);
    const totalChunks = repositories.reduce((acc, r) => acc + (r.total_chunks || 0), 0);
    return { totalRepos, readyRepos, indexingRepos, totalFiles, totalChunks };
  }, [repositories]);

  const filteredRepositories = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return repositories.filter((r) => {
      if (statusFilter === "ready" && r.status !== "ready") return false;
      if (
        statusFilter === "indexing" &&
        !["pending", "cloning", "parsing_ast", "embedding"].includes(r.status)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.github_owner.toLowerCase().includes(q) ||
        r.github_name.toLowerCase().includes(q) ||
        r.clone_url.toLowerCase().includes(q) ||
        r.default_branch.toLowerCase().includes(q)
      );
    });
  }, [repositories, searchFilter, statusFilter]);

  const getStatusBadge = (status: Repository["status"]) => {
    switch (status) {
      case "ready":
        return (
          <span className="badge-status border border-white/[0.08] bg-[#16161a] text-zinc-300 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            READY
          </span>
        );
      case "parsing_ast":
      case "embedding":
      case "cloning":
        return (
          <span className="badge-status border border-white/[0.08] bg-[#16161a] text-zinc-300 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {status === "cloning"
              ? "CLONING"
              : status === "parsing_ast"
              ? "PARSING AST"
              : "EMBEDDING"}
          </span>
        );
      case "failed":
        return (
          <span className="badge-status border border-white/[0.08] bg-[#16161a] text-zinc-300 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="badge-status border border-white/[0.08] bg-[#16161a] text-zinc-400 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            QUEUED
          </span>
        );
    }
  };

  const getStageProgress = (status: Repository["status"]) => {
    switch (status) {
      case "ready":
        return 100;
      case "embedding":
        return 78;
      case "parsing_ast":
        return 50;
      case "cloning":
        return 25;
      case "failed":
        return 100;
      default:
        return 12;
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans">
      <Navbar repositories={repositories} />

      {/* Top Workbench Header & Telemetry Ledger */}
      <section className="relative border-b border-white/[0.07] bg-engineering-grid">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-7 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                <span>WORKBENCH</span>
                <span>/</span>
                <span className="text-zinc-400">AST · HYBRID RRF · SPAN VERIFICATION</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100 font-mono">
                Codebase Intelligence &amp; Citation Index
              </h1>
              <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                Syntax-preserving Tree-sitter AST indexing with 384-d ONNX + BM25 Reciprocal Rank Fusion and deterministic [file:start-end] verification.
              </p>
            </div>

            {/* Primary Workbench Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setIsImportOpen(true)}
                aria-label="Import a Git repository"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded bg-zinc-100 hover:bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-colors shadow-sm focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Import Repository</span>
              </button>

              <button
                onClick={handleQuickSampleImport}
                disabled={importingSample}
                aria-label="Load the pre-indexed FastAPI CloudFlow sample repository"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#111113] hover:bg-[#16161a] hover:border-white/[0.16] px-3 py-2 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <Terminal className="h-3.5 w-3.5 text-zinc-400" />
                <span>
                  {importingSample ? "Indexing..." : "Load FastAPI Sample"}
                </span>
              </button>

              <Link
                href="/evaluation"
                aria-label="Open quantitative benchmark metrics"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#111113] hover:border-white/[0.16] hover:text-white px-3 py-2 text-xs font-medium text-zinc-300 transition-colors focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <BarChart3 className="h-3.5 w-3.5 text-zinc-400" />
                <span>Benchmarks</span>
              </Link>
            </div>
          </div>

          {/* Horizontal Telemetry Ledger */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] rounded border border-white/[0.07] bg-[#0c0c0e] tabular-nums">
            <div className="px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Indexed Workspaces
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-zinc-100">
                  {telemetry.readyRepos}
                </span>
                <span className="text-xs text-zinc-500">
                  / {telemetry.totalRepos} ready
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Parsed Source Files
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-zinc-100">
                  {telemetry.totalFiles.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-500">files</span>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                AST Syntax Chunks
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-zinc-100">
                  {telemetry.totalChunks.toLocaleString()}
                </span>
                <span className="text-xs text-zinc-500">spans</span>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Vector &amp; Lexical Fusion
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 font-mono">
                <span className="text-xs font-semibold text-zinc-200">
                  bge-small-en-v1.5
                </span>
                <span className="rounded border border-white/[0.08] bg-[#16161a] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                  384-d ONNX
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-7 space-y-8">
        {/* Remotion 60fps Pipeline Player Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-mono">
                Engine Architecture &amp; Pipeline
              </h2>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-mono text-zinc-500">
              60fps Remotion Engine · Frame-Accurate Pipeline
            </span>
          </div>
          <div className="rounded border border-white/[0.07] bg-[#0c0c0e] p-1 shadow-sm">
            <RemotionPipelinePlayer />
          </div>
        </section>

        {/* Repositories Workspace Directory */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-100 font-mono">
                Workspaces
              </h2>
              <span className="rounded border border-white/[0.08] bg-[#111113] px-1.5 py-0.2 font-mono text-xs text-zinc-400 tabular-nums">
                {filteredRepositories.length}
              </span>
            </div>

            {/* Filter & Status Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Filter workspaces... (press /)"
                  aria-label="Filter repositories"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-48 sm:w-60 rounded border border-white/[0.08] bg-[#111113] py-1 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none transition-colors"
                />
                {!searchFilter && (
                  <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/[0.08] bg-[#16161a] px-1 font-mono text-[10px] text-zinc-500">
                    /
                  </kbd>
                )}
              </div>

              <div className="flex items-center rounded border border-white/[0.08] bg-[#111113] p-0.5 text-xs">
                {(
                  [
                    { id: "all", label: "All", count: telemetry.totalRepos },
                    { id: "ready", label: "Ready", count: telemetry.readyRepos },
                    { id: "indexing", label: "Indexing", count: telemetry.indexingRepos },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    aria-label={`Show ${tab.label} repositories (${tab.count})`}
                    className={`cursor-pointer flex items-center gap-1.5 rounded px-2.5 py-0.5 font-medium transition-colors ${
                      statusFilter === tab.id
                        ? "bg-[#16161a] border border-white/[0.08] text-zinc-100 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => loadRepos(true)}
                title="Refresh repository statuses"
                aria-label="Refresh repository statuses"
                className="cursor-pointer flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#111113] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200 transition-colors focus-visible:ring-1 focus-visible:ring-white/40"
              >
                <RefreshCw
                  className={`h-3 w-3 ${
                    refreshing ? "animate-spin text-zinc-200" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {loading && repositories.length === 0 ? (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-40 rounded border border-white/[0.07] bg-[#111113] p-4 animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="h-4 w-3/5 rounded bg-white/[0.06]" />
                    <div className="h-3 w-2/5 rounded bg-white/[0.04]" />
                  </div>
                  <div className="h-7 w-full rounded bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="rounded border border-dashed border-white/[0.1] bg-[#0c0c0e] p-10 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded border border-white/[0.08] bg-[#111113] text-zinc-400">
                <FolderGit2 className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-semibold text-zinc-200 font-mono">
                {repositories.length === 0
                  ? "No repositories indexed yet"
                  : "No workspaces match your filter"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto leading-relaxed">
                {repositories.length === 0
                  ? "Import any public GitHub repository or load the FastAPI CloudFlow sample to inspect AST symbols and line-cited answers."
                  : "Try clearing your search filter or switching the status tab."}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="cursor-pointer rounded bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white transition-colors shadow-sm"
                >
                  Import Repository
                </button>
                {repositories.length === 0 && (
                  <button
                    onClick={handleQuickSampleImport}
                    className="cursor-pointer rounded border border-white/[0.08] bg-[#111113] px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#16161a] transition-colors"
                  >
                    Load FastAPI Sample
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRepositories.map((repo) => {
                const isIndexing = [
                  "pending",
                  "cloning",
                  "parsing_ast",
                  "embedding",
                ].includes(repo.status);
                const progress = getStageProgress(repo.status);
                const avgChunksPerFile =
                  repo.total_files > 0
                    ? (repo.total_chunks / repo.total_files).toFixed(1)
                    : "0.0";

                return (
                  <div
                    key={repo.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open workspace for ${repo.github_owner}/${repo.github_name}`}
                    onClick={() => router.push(`/repos/${repo.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/repos/${repo.id}`);
                      }
                    }}
                    className="surface-card-interactive group cursor-pointer flex flex-col justify-between rounded p-4 border border-white/[0.07] bg-[#111113] hover:border-white/[0.16] focus-visible:ring-1 focus-visible:ring-white/40"
                  >
                    <div className="space-y-3">
                      {/* Header: Owner/Name + Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                            <span className="font-mono text-xs font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
                              {repo.github_owner}/{repo.github_name}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-zinc-500 truncate">
                            {repo.clone_url}
                          </p>
                        </div>
                        {getStatusBadge(repo.status)}
                      </div>

                      {/* Git Branch & Commit Metadata */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                        <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#0c0c0e] px-1.5 py-0.2 text-zinc-300">
                          <GitBranch className="h-2.5 w-2.5 text-zinc-500" />
                          {repo.default_branch}
                        </span>
                        {repo.last_indexed_commit_sha && (
                          <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#0c0c0e] px-1.5 py-0.2 text-zinc-400 tabular-nums">
                            <GitCommit className="h-2.5 w-2.5 text-zinc-600" />
                            {repo.last_indexed_commit_sha.slice(0, 8)}
                          </span>
                        )}
                      </div>

                      {/* Active Indexing Progress Bar */}
                      {(isIndexing || repo.status === "failed") && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400">
                            <span>Stage: {repo.status}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded bg-[#09090b]">
                            <div
                              className={`h-full rounded transition-all duration-300 ${
                                repo.status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-zinc-200"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {repo.error_message && (
                        <div className="rounded border border-rose-500/30 bg-rose-950/20 p-2 text-[11px] text-rose-300 line-clamp-2">
                          {repo.error_message}
                        </div>
                      )}
                    </div>

                    {/* Clean Tabular Footer & Workspace Link */}
                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                        <span>
                          <strong className="font-semibold text-zinc-200">
                            {repo.total_files}
                          </strong>{" "}
                          files
                        </span>
                        <span className="text-zinc-700">·</span>
                        <span>
                          <strong className="font-semibold text-zinc-200">
                            {repo.total_chunks}
                          </strong>{" "}
                          spans
                        </span>
                        <span className="hidden sm:inline text-zinc-700">·</span>
                        <span className="hidden sm:inline text-zinc-500">
                          {avgChunksPerFile}/f
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={`/evaluation?repo=${repo.id}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Run Evaluation Benchmarks"
                          aria-label={`Run benchmarks for ${repo.github_name}`}
                          className="cursor-pointer flex h-6 w-6 items-center justify-center rounded border border-white/[0.08] bg-[#0c0c0e] text-zinc-400 hover:border-white/[0.18] hover:text-white transition-colors"
                        >
                          <BarChart3 className="h-3 w-3" />
                        </Link>
                        <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#16161a] group-hover:border-white/[0.2] group-hover:bg-zinc-100 group-hover:text-zinc-950 px-2 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors">
                          <span>Inspect</span>
                          <ArrowUpRight className="h-2.5 w-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Architectural Pipeline Specification Ledger */}
        <section className="rounded border border-white/[0.07] bg-[#0c0c0e] divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 shadow-sm">
          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-zinc-200">
                Tree-sitter AST Chunker
              </span>
              <span className="text-zinc-500 tabular-nums">01</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Extracts classes, functions, methods, and docstrings with exact 1-based line intervals and scope headers.
            </p>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-zinc-200">
                Hybrid RRF Retrieval
              </span>
              <span className="text-zinc-500 tabular-nums">02</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Dynamic Reciprocal Rank Fusion combining dense ONNX vectors with camelCase and snake_case lexical matching.
            </p>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-zinc-200">
                Grounded Citation Gate
              </span>
              <span className="text-zinc-500 tabular-nums">03</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Validates every <code className="font-mono text-zinc-300">[file:L-L]</code> citation against retrieved AST spans and abstains on unverified claims.
            </p>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-zinc-200">
                Quantitative Benchmarks
              </span>
              <span className="text-zinc-500 tabular-nums">04</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Reproducible benchmark suite measuring Recall@K, MRR, Citation Precision/Recall/F1, and Faithfulness.
            </p>
          </div>
        </section>
      </main>

      <RepoImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={() => loadRepos(true)}
      />
    </div>
  );
}
