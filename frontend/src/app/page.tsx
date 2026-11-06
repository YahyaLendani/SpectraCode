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
          <span className="badge-status border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        );
      case "parsing_ast":
      case "embedding":
      case "cloning":
        return (
          <span className="badge-status border border-blue-500/30 bg-blue-500/15 text-blue-300">
            <Clock className="h-3 w-3 text-blue-400 animate-spin" />
            {status === "cloning"
              ? "Cloning Git"
              : status === "parsing_ast"
              ? "Parsing AST"
              : "Embedding"}
          </span>
        );
      case "failed":
        return (
          <span className="badge-status border border-rose-500/30 bg-rose-500/10 text-rose-300">
            <AlertCircle className="h-3 w-3 text-rose-400" />
            Failed
          </span>
        );
      default:
        return (
          <span className="badge-status border border-white/[0.1] bg-white/[0.04] text-zinc-300">
            <Clock className="h-3 w-3" />
            Queued
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
    <div className="min-h-screen bg-black text-slate-100 flex flex-col font-sans">
      <Navbar repositories={repositories} />

      {/* Top Workbench Header & Telemetry Ledger */}
      <section className="relative border-b border-white/[0.08] bg-engineering-grid">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-7">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-3xl space-y-3.5">
              <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-blue-300">
                <Terminal className="h-3 w-3 text-blue-400" />
                <span>Tree-Sitter AST · Hybrid RRF Retrieval · Deterministic Span Grounding</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-white leading-[1.15] font-mono">
                Codebase Intelligence with{" "}
                <span className="text-blue-400">Line-Verified Citations</span>
              </h1>

              <p className="text-sm sm:text-[15px] text-slate-300 leading-relaxed max-w-2xl">
                Parse repositories into syntax-preserving AST chunks, fuse 384-d ONNX vector embeddings with identifier-aware BM25 search via Reciprocal Rank Fusion, and verify every{" "}
                <code className="rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-blue-200">
                  [file:start-end]
                </code>{" "}
                citation against exact source intervals.
              </p>
            </div>

            {/* Primary Workbench Actions */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={() => setIsImportOpen(true)}
                aria-label="Import a Git repository"
                className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-4 w-4" />
                <span>Import Repository</span>
              </button>

              <button
                onClick={handleQuickSampleImport}
                disabled={importingSample}
                aria-label="Load the pre-indexed FastAPI CloudFlow sample repository"
                className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-[#0a0e17] hover:bg-[#101624] hover:border-amber-400/50 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {importingSample ? "Indexing Sample..." : "Load FastAPI Sample"}
                </span>
              </button>

              <Link
                href="/evaluation"
                aria-label="Open quantitative benchmark metrics"
                className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#0a0e17] hover:border-white/[0.2] hover:text-white px-3.5 py-2.5 text-xs font-medium text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                <span>Benchmarks</span>
              </Link>
            </div>
          </div>

          {/* Horizontal Telemetry Ledger */}
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] rounded-xl border border-white/[0.08] bg-[#0a0e17]/95 backdrop-blur-sm tabular-nums shadow-lg">
            <div className="px-4 py-3.5">
              <div className="text-[11px] font-medium text-slate-400">
                Indexed Workspaces
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-white">
                  {telemetry.readyRepos}
                </span>
                <span className="text-xs text-slate-400">
                  / {telemetry.totalRepos} ready
                </span>
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] font-medium text-slate-400">
                Parsed Source Files
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-white">
                  {telemetry.totalFiles.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400">files</span>
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] font-medium text-slate-400">
                AST Syntax Chunks
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-xl font-bold text-white">
                  {telemetry.totalChunks.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400">spans</span>
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] font-medium text-slate-400">
                Vector &amp; Lexical Fusion
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 font-mono">
                <span className="text-sm font-semibold text-slate-200">
                  bge-small-en-v1.5
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  384-d ONNX
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Remotion 60fps Pipeline Player Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-radar" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                Live Engine Architecture &amp; Pipeline
              </h2>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400">
              60fps Remotion Engine · Frame-Accurate Pipeline
            </span>
          </div>
          <div className="bento-cell border-white/[0.1] bg-[#0a0e17] p-1.5 shadow-xl">
            <RemotionPipelinePlayer />
          </div>
        </section>

        {/* Repositories Workspace Directory */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold tracking-tight text-white font-mono">
                Codebase Workspaces
              </h2>
              <span className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-slate-300 tabular-nums">
                {filteredRepositories.length}
              </span>
            </div>

            {/* Filter & Status Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Filter repositories... (press /)"
                  aria-label="Filter repositories"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-48 sm:w-64 rounded-lg border border-white/[0.1] bg-[#0a0e17] py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none transition-colors"
                />
                {!searchFilter && (
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/[0.1] bg-white/[0.04] px-1 font-mono text-[10px] text-slate-400">
                    /
                  </kbd>
                )}
              </div>

              <div className="flex items-center rounded-lg border border-white/[0.1] bg-[#0a0e17] p-0.5 text-xs">
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
                    className={`cursor-pointer flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                      statusFilter === tab.id
                        ? "bg-white/[0.12] text-white font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => loadRepos(true)}
                title="Refresh repository statuses"
                aria-label="Refresh repository statuses"
                className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#0a0e17] text-slate-300 hover:border-white/[0.2] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    refreshing ? "animate-spin text-blue-400" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {loading && repositories.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-44 rounded-xl border border-white/[0.08] bg-[#0a0e17]/80 p-5 animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="h-4 w-3/5 rounded bg-white/[0.08]" />
                    <div className="h-3 w-2/5 rounded bg-white/[0.05]" />
                  </div>
                  <div className="h-8 w-full rounded-lg bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="bento-cell border-dashed border-white/[0.12] bg-[#0a0e17]/60 p-12 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-slate-300">
                <FolderGit2 className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white font-mono">
                {repositories.length === 0
                  ? "No repositories indexed yet"
                  : "No repositories match your filter"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                {repositories.length === 0
                  ? "Import any public GitHub repository or load the FastAPI CloudFlow sample to inspect AST symbols, dependency graphs, and line-cited AI answers."
                  : "Try clearing your search filter or switching the status tab."}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2.5">
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
                >
                  Import Repository
                </button>
                {repositories.length === 0 && (
                  <button
                    onClick={handleQuickSampleImport}
                    className="cursor-pointer rounded-lg border border-amber-500/30 bg-[#0a0e17] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#101624] transition-colors"
                  >
                    Load FastAPI Sample
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="surface-card-interactive group cursor-pointer flex flex-col justify-between rounded-xl p-5 focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <div className="space-y-3.5">
                      {/* Header: Owner/Name + Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="h-4 w-4 text-slate-400 group-hover:text-blue-400 transition-colors shrink-0" />
                            <span className="font-mono text-sm font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                              {repo.github_owner}/{repo.github_name}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                            {repo.clone_url}
                          </p>
                        </div>
                        {getStatusBadge(repo.status)}
                      </div>

                      {/* Git Branch & Commit Metadata */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#06080d] px-2 py-0.5 text-slate-300">
                          <GitBranch className="h-3 w-3 text-slate-400" />
                          {repo.default_branch}
                        </span>
                        {repo.last_indexed_commit_sha && (
                          <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-[#06080d] px-2 py-0.5 text-slate-400 tabular-nums">
                            <GitCommit className="h-3 w-3 text-slate-500" />
                            {repo.last_indexed_commit_sha.slice(0, 10)}
                          </span>
                        )}
                      </div>

                      {/* Active Indexing Progress Bar */}
                      {(isIndexing || repo.status === "failed") && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                            <span>Pipeline stage: {repo.status}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#06080d]">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                repo.status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-blue-500 animate-pulse"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {repo.error_message && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-[11px] text-rose-300 line-clamp-2">
                          {repo.error_message}
                        </div>
                      )}
                    </div>

                    {/* Clean Tabular Footer & Workspace Link */}
                    <div className="mt-5 pt-3.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300 tabular-nums">
                        <span>
                          <strong className="font-semibold text-white">
                            {repo.total_files}
                          </strong>{" "}
                          files
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>
                          <strong className="font-semibold text-white">
                            {repo.total_chunks}
                          </strong>{" "}
                          AST chunks
                        </span>
                        <span className="hidden sm:inline text-slate-600">·</span>
                        <span className="hidden sm:inline text-slate-400">
                          {avgChunksPerFile}/file
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={`/evaluation?repo=${repo.id}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Run Evaluation Benchmarks"
                          aria-label={`Run benchmarks for ${repo.github_name}`}
                          className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-[#06080d] text-slate-400 hover:border-white/[0.2] hover:text-white transition-colors"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Link>
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] group-hover:bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-slate-200 group-hover:text-white transition-colors">
                          <span>Inspect</span>
                          <ArrowUpRight className="h-3 w-3" />
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
        <section className="bento-cell border-white/[0.08] bg-[#0a0e17] divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 shadow-md">
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-slate-200">
                Tree-sitter AST Chunker
              </span>
              <span className="text-blue-400 tabular-nums font-semibold">STAGE 01</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Extracts classes, functions, methods, and docstrings with exact 1-based line intervals and scope headers.
            </p>
          </div>

          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-slate-200">
                Hybrid RRF Retrieval
              </span>
              <span className="text-blue-400 tabular-nums font-semibold">STAGE 02</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dynamic Reciprocal Rank Fusion combining dense ONNX vectors with camelCase and snake_case lexical matching.
            </p>
          </div>

          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-slate-200">
                Grounded Citation Gate
              </span>
              <span className="text-blue-400 tabular-nums font-semibold">STAGE 03</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Validates every <code className="font-mono text-blue-300">[file:L-L]</code> citation against retrieved AST spans and abstains on unverified claims.
            </p>
          </div>

          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-semibold text-slate-200">
                Quantitative Benchmarks
              </span>
              <span className="text-blue-400 tabular-nums font-semibold">STAGE 04</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
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
