"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderGit2,
  Plus,
  ArrowRight,
  Code2,
  Layers,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
} from "lucide-react";
import { api, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { RepoImportModal } from "@/components/RepoImportModal";

export default function DashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const loadRepos = async () => {
    try {
      setLoading(true);
      const list = await api.listRepositories();
      setRepositories(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
    const interval = setInterval(loadRepos, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: Repository["status"]) => {
    switch (status) {
      case "ready":
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Ready
          </span>
        );
      case "parsing_ast":
      case "embedding":
      case "cloning":
        return (
          <span className="flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20 animate-pulse">
            <Clock className="h-3 w-3" /> Indexing ({status})
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/20">
            <AlertCircle className="h-3 w-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-semibold text-slate-400 border border-slate-500/20">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-8 sm:p-10 shadow-2xl">
          <div className="absolute right-0 top-0 -mt-12 -mr-12 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" /> Next-Generation Developer Intelligence
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Understand Any Codebase with <span className="text-indigo-400">Grounded Citations</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Import public GitHub repositories, perform hybrid vector &amp; lexical search, explore AST symbols with Tree-sitter, and chat with AI that cites exact source code line numbers.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02]"
              >
                <Plus className="h-4 w-4" /> Import Repository
              </button>

              <Link
                href="/evaluation"
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all"
              >
                <BarChart3 className="h-4 w-4 text-indigo-400" /> View Benchmarks
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 text-indigo-400 mb-1.5 font-semibold text-xs">
              <Code2 className="h-4 w-4" /> Tree-sitter Parsing
            </div>
            <p className="text-xs text-slate-400">
              Syntax-aware boundary chunking preserving function scopes &amp; 1-based line intervals.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 text-cyan-400 mb-1.5 font-semibold text-xs">
              <Search className="h-4 w-4" /> Hybrid RRF Search
            </div>
            <p className="text-xs text-slate-400">
              Reciprocal Rank Fusion blending dense embeddings with identifier lexical expansion.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1.5 font-semibold text-xs">
              <FileText className="h-4 w-4" /> Grounded Line Citations
            </div>
            <p className="text-xs text-slate-400">
              Deterministic verification gate for <code className="text-indigo-300">[file:L-L]</code> citations with one-click code jump.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 text-purple-400 mb-1.5 font-semibold text-xs">
              <BarChart3 className="h-4 w-4" /> Rigorous Evaluation
            </div>
            <p className="text-xs text-slate-400">
              Automated benchmarks measuring Recall@K, MRR, Citation Precision, and Faithfulness.
            </p>
          </div>
        </div>

        {/* Repositories Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Indexed Repositories</h2>
              <p className="text-xs text-slate-400">Select a codebase to launch the intelligence workspace</p>
            </div>
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-indigo-500 hover:text-white transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add New
            </button>
          </div>

          {loading && repositories.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 border border-slate-800/60 rounded-xl bg-slate-900/20">
              Loading indexed codebases...
            </div>
          ) : repositories.length === 0 ? (
            <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30">
              <FolderGit2 className="mx-auto h-10 w-10 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No repositories indexed yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Import any public GitHub repository or load the 1-click sample to immediately start exploring.
              </p>
              <button
                onClick={() => setIsImportOpen(true)}
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                Import Repository Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 hover:bg-slate-900 transition-all shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-mono text-sm font-bold text-white truncate">
                        {repo.github_owner}/{repo.github_name}
                      </div>
                      {getStatusBadge(repo.status)}
                    </div>

                    <p className="text-xs text-slate-400 font-mono truncate mb-4">
                      {repo.clone_url}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                      <div>
                        <span className="font-semibold text-slate-200">{repo.total_files}</span> files
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200">{repo.total_chunks}</span> chunks
                      </div>
                      <div>
                        Branch: <span className="font-mono text-slate-300">{repo.default_branch}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-2">
                    <Link
                      href={`/repos/${repo.id}`}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 hover:text-white px-3 py-2 text-xs font-semibold text-slate-200 transition-colors"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <RepoImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={() => loadRepos()}
      />
    </div>
  );
}

