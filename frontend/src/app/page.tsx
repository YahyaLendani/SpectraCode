"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderGit2,
  Plus,
  ArrowRight,
  Code2,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  GitBranch,
  GitCommit,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Layers,
  Zap,
  Terminal,
} from "lucide-react";
import { api, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { RepoImportModal } from "@/components/RepoImportModal";

export default function DashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "indexing">("all");
  const [importingSample, setImportingSample] = useState(false);

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
    const totalFiles = repositories.reduce((acc, r) => acc + (r.total_files || 0), 0);
    const totalChunks = repositories.reduce((acc, r) => acc + (r.total_chunks || 0), 0);
    return { totalRepos, readyRepos, totalFiles, totalChunks };
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Ready
          </span>
        );
      case "parsing_ast":
      case "embedding":
      case "cloning":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300 animate-pulse">
            <Clock className="h-3 w-3 text-indigo-400" />
            {status === "cloning"
              ? "Cloning Git"
              : status === "parsing_ast"
              ? "Parsing AST"
              : "Embedding"}
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
            <AlertCircle className="h-3 w-3 text-rose-400" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/25 bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
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
        return 10;
    }
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col relative selection:bg-indigo-500/30">
      {/* Subtle Ambient Background */}
      <div className="pointer-events-none fixed inset-0 bg-grid-pattern opacity-60" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] hero-spotlight" />

      <Navbar repositories={repositories} />

      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
        {/* Executive Hero Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900/90 via-[#0b1120]/95 to-[#070b14] p-7 sm:p-10 shadow-2xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-5">

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
                Comprehend Any Codebase with{" "}
                <span className="text-indigo-400 font-extrabold">
                  Line-Verified Citations
                </span>
              </h1>

              <p className="max-w-2xl text-sm sm:text-base text-slate-300/90 leading-relaxed">
                RepoLens parses repositories into syntax-preserving AST chunks, fuses dense ONNX vector embeddings with identifier-aware lexical search via Reciprocal Rank Fusion, and enforces deterministic{" "}
                <code className="rounded border border-indigo-500/30 bg-indigo-950/60 px-1.5 py-0.5 font-mono text-xs text-indigo-200">
                  [file:start-end]
                </code>{" "}
                source grounding.
              </p>

              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span>Tree-Sitter AST • Hybrid RRF Retrieval • Grounded Citation Gate</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 ring-1 ring-white/15 transition-all hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Import GitHub Repository</span>
                </button>

                <button
                  onClick={handleQuickSampleImport}
                  disabled={importingSample}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-indigo-500/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 transition-all disabled:opacity-50"
                >
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span>{importingSample ? "Indexing Sample..." : "Load Instant Demo Repo"}</span>
                </button>

                <Link
                  href="/evaluation"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900/70 hover:border-cyan-500/40 hover:text-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-300 transition-all"
                >
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  <span>Benchmark Suite</span>
                </Link>
              </div>
            </div>

            {/* Right: Live Engine Telemetry Card */}
            <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-slate-950/80 p-5 backdrop-blur-md shadow-inner space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                    Index Telemetry
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.06] bg-slate-900/60 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Indexed Repos
                  </span>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-white">
                    {telemetry.readyRepos}
                    <span className="text-xs font-normal text-slate-500">
                      /{telemetry.totalRepos}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-slate-900/60 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Source Files
                  </span>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-indigo-400">
                    {telemetry.totalFiles.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-slate-900/60 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    AST Chunks
                  </span>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-cyan-400">
                    {telemetry.totalChunks.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-slate-900/60 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Vector Space
                  </span>
                  <div className="mt-1 font-mono text-sm font-bold text-emerald-400">
                    384-d ONNX
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 block truncate">
                    bge-small-en-v1.5
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Pillar Architecture Strip */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card rounded-xl p-4 transition-colors hover:border-indigo-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  <Code2 className="h-4 w-4" />
                </div>
                <span>Tree-sitter AST Parser</span>
              </div>
              <span className="font-mono text-[10px] text-slate-600 font-bold">01</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Extracts classes, functions, methods, and docstrings with exact 1-based line intervals and scope headers.
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 transition-colors hover:border-cyan-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Search className="h-4 w-4" />
                </div>
                <span>Hybrid RRF Retrieval</span>
              </div>
              <span className="font-mono text-[10px] text-slate-600 font-bold">02</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dynamic alpha Reciprocal Rank Fusion combining dense semantic vectors with camelCase/snake_case lexical matching.
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 transition-colors hover:border-emerald-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <span>Grounded Citation Gate</span>
              </div>
              <span className="font-mono text-[10px] text-slate-600 font-bold">03</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Validates every <code className="font-mono text-indigo-300">[file:L-L]</code> citation against retrieved AST spans and abstains on unverified claims.
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 transition-colors hover:border-purple-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span>Automated Evaluation</span>
              </div>
              <span className="font-mono text-[10px] text-slate-600 font-bold">04</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reproducible benchmark suite quantifying Recall@K, MRR, Citation Precision/Recall/F1, and Faithfulness.
            </p>
          </div>
        </section>

        {/* Repositories Workspace Directory */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <FolderGit2 className="h-5 w-5 text-indigo-400" />
                <span>Indexed Codebase Workspaces</span>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-slate-300">
                  {filteredRepositories.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Launch an interactive 3-pane workspace with AST explorer, dependency graph, and grounded AI chat
              </p>
            </div>

            {/* Filter & Action Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter repositories..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-48 sm:w-56 rounded-lg border border-white/[0.08] bg-slate-900/90 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center rounded-lg border border-white/[0.08] bg-slate-900/80 p-0.5 text-xs">
                {(["all", "ready", "indexing"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                      statusFilter === tab
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <button
                onClick={() => loadRepos(true)}
                title="Refresh repository statuses"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-slate-900/80 text-slate-400 hover:border-white/15 hover:text-white transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              </button>

              <button
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Repository</span>
              </button>
            </div>
          </div>

          {loading && repositories.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-56 rounded-xl border border-white/[0.06] bg-slate-900/40 p-5 animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="h-5 w-2/3 rounded bg-slate-800" />
                    <div className="h-3.5 w-1/2 rounded bg-slate-800/70" />
                  </div>
                  <div className="h-9 w-full rounded-lg bg-slate-800" />
                </div>
              ))}
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/30 p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <FolderGit2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">
                {repositories.length === 0
                  ? "No repositories indexed yet"
                  : "No repositories match your filter"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {repositories.length === 0
                  ? "Import any public GitHub repository or load our 1-click FastAPI CloudFlow sample to explore AST chunking, dependency graphs, and line-cited AI chat."
                  : "Try clearing your search query or switching the status filter tab."}
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Import Repository
                </button>
                {repositories.length === 0 && (
                  <button
                    onClick={handleQuickSampleImport}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition-colors"
                  >
                    Load 1-Click Sample
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRepositories.map((repo) => {
                const progress = getStageProgress(repo.status);
                const avgChunksPerFile =
                  repo.total_files > 0
                    ? (repo.total_chunks / repo.total_files).toFixed(1)
                    : "0.0";

                return (
                  <div
                    key={repo.id}
                    className="glass-card-interactive group flex flex-col justify-between rounded-xl p-5"
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="h-4 w-4 text-indigo-400 shrink-0" />
                            <Link
                              href={`/repos/${repo.id}`}
                              className="font-mono text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate"
                            >
                              {repo.github_owner}/{repo.github_name}
                            </Link>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-slate-500 truncate">
                            {repo.clone_url}
                          </p>
                        </div>
                        {getStatusBadge(repo.status)}
                      </div>

                      {/* Git Metadata Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-slate-950/70 px-2 py-0.5 text-slate-300">
                          <GitBranch className="h-3 w-3 text-indigo-400" />
                          {repo.default_branch}
                        </span>
                        {repo.last_indexed_commit_sha && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-slate-950/70 px-2 py-0.5 text-slate-400">
                            <GitCommit className="h-3 w-3 text-cyan-400" />
                            {repo.last_indexed_commit_sha.slice(0, 12)}
                          </span>
                        )}
                      </div>

                      {/* Indexing Progress Bar */}
                      <div className="space-y-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              repo.status === "ready"
                                ? "bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400"
                                : repo.status === "failed"
                                ? "bg-rose-500"
                                : "bg-indigo-500 animate-pulse"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-slate-950/60 p-2.5 text-center">
                        <div>
                          <div className="text-[10px] font-medium uppercase text-slate-500">
                            Files
                          </div>
                          <div className="font-mono text-xs font-bold text-slate-200 mt-0.5">
                            {repo.total_files}
                          </div>
                        </div>
                        <div className="border-x border-white/[0.06]">
                          <div className="text-[10px] font-medium uppercase text-slate-500">
                            AST Chunks
                          </div>
                          <div className="font-mono text-xs font-bold text-indigo-300 mt-0.5">
                            {repo.total_chunks}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-medium uppercase text-slate-500">
                            Density
                          </div>
                          <div className="font-mono text-xs font-bold text-cyan-300 mt-0.5">
                            {avgChunksPerFile}/file
                          </div>
                        </div>
                      </div>

                      {repo.error_message && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-[11px] text-rose-300 line-clamp-2">
                          {repo.error_message}
                        </div>
                      )}
                    </div>

                    {/* Action Footer */}
                    <div className="pt-4 mt-3 flex items-center gap-2">
                      <Link
                        href={`/repos/${repo.id}`}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all"
                      >
                        <span>Open Workspace</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      <Link
                        href="/evaluation"
                        title="Run Evaluation Benchmarks"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-slate-900 hover:border-indigo-500/50 hover:text-indigo-300 text-slate-400 transition-colors"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
