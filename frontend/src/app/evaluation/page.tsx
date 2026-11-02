"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  FileCode,
  ShieldCheck,
  TrendingUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import { api, EvaluationReport, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function EvaluationDashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listRepositories().then((repos) => {
      setRepositories(repos);
      if (repos.length > 0) {
        setSelectedRepoId(repos[0].id);
        loadLatestEvaluation(repos[0].id);
      }
      setLoading(false);
    });
  }, []);

  const loadLatestEvaluation = async (repoId: string) => {
    try {
      const runs = await api.listEvaluations(repoId);
      if (runs.length > 0) {
        setReport(runs[0]);
      } else {
        setReport(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunBenchmark = async () => {
    if (!selectedRepoId || running) return;

    try {
      setRunning(true);
      const res = await api.runEvaluation(selectedRepoId);
      setReport(res);
    } catch (err: any) {
      alert(`Benchmark execution failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-xs font-semibold text-indigo-400">Evaluation Suite</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-indigo-400" />
              Retrieval &amp; Grounding Benchmarks
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Quantitative measurements for Recall@K, MRR, Citation Precision, and Grounded Faithfulness.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedRepoId}
              onChange={(e) => {
                setSelectedRepoId(e.target.value);
                loadLatestEvaluation(e.target.value);
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.github_owner}/{r.github_name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRunBenchmark}
              disabled={running || !selectedRepoId}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Evaluating Benchmark...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  <span>Run Benchmark</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Metrics */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Recall@5
            </span>
            <div className="text-2xl font-black text-indigo-400">
              {report ? `${(report.mean_recall_at_k * 100).toFixed(1)}%` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Ground-truth span coverage</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              MRR@5
            </span>
            <div className="text-2xl font-black text-cyan-400">
              {report ? report.mean_mrr.toFixed(3) : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Mean reciprocal rank</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Citation Precision
            </span>
            <div className="text-2xl font-black text-emerald-400">
              {report ? `${(report.mean_citation_precision * 100).toFixed(1)}%` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Citations intersecting GT</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Citation Recall
            </span>
            <div className="text-2xl font-black text-emerald-300">
              {report ? `${(report.mean_citation_recall * 100).toFixed(1)}%` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">GT intervals cited</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Citation F1
            </span>
            <div className="text-2xl font-black text-purple-400">
              {report ? `${(report.mean_citation_f1 * 100).toFixed(1)}%` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Harmonic mean</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Faithfulness
            </span>
            <div className="text-2xl font-black text-amber-400">
              {report ? `${(report.mean_faithfulness * 100).toFixed(1)}%` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Code context entailment</span>
          </div>
        </div>

        {/* Detailed Benchmark Samples Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" /> Curated Benchmark Test Queries &amp; Ground Truth
            </h2>
            {report && (
              <span className="text-xs text-slate-400 font-mono">
                Evaluated: {new Date(report.created_at).toLocaleString()}
              </span>
            )}
          </div>

          {report && report.sample_results && report.sample_results.length > 0 ? (
            <div className="space-y-4">
              {report.sample_results.map((sample, idx) => (
                <div
                  key={sample.query_id || idx}
                  className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        {sample.query_id}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-200">
                        {sample.query}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                      <span className="rounded bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 text-indigo-300">
                        Recall: {(sample.recall_at_k * 100).toFixed(0)}%
                      </span>
                      <span className="rounded bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-emerald-300">
                        Cit P: {(sample.citation_precision * 100).toFixed(0)}%
                      </span>
                      <span className="rounded bg-amber-950/80 border border-amber-800 px-2 py-0.5 text-amber-300">
                        Faith: {(sample.faithfulness * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Ground truth vs Citations */}
                    <div className="rounded bg-slate-900 p-2.5 font-mono text-[11px] space-y-1">
                      <span className="text-slate-500 font-bold block">Ground-Truth Target Spans:</span>
                      {sample.ground_truth_spans.length > 0 ? (
                        sample.ground_truth_spans.map((gt, i) => (
                          <div key={i} className="text-slate-300">
                            • {gt.file_path} (L{gt.start_line}-L{gt.end_line})
                          </div>
                        ))
                      ) : (
                        <div className="text-amber-400 italic">None (Out-of-scope query for negative test)</div>
                      )}
                    </div>

                    <div className="rounded bg-slate-900 p-2.5 font-mono text-[11px] space-y-1">
                      <span className="text-slate-500 font-bold block">Emitted Citations by RepoLens:</span>
                      {sample.emitted_citations.length > 0 ? (
                        sample.emitted_citations.map((c, i) => (
                          <div key={i} className="text-indigo-300">
                            ✓ {c.file_path} (L{c.start_line}-L{c.end_line})
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 italic">No citations (Engine safely abstained)</div>
                      )}
                    </div>
                  </div>

                  {/* Generated Answer Preview */}
                  <div className="rounded border border-slate-800/80 bg-slate-900/60 p-3 text-xs text-slate-300">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Generated Answer Preview:
                    </span>
                    <p className="line-clamp-3 whitespace-pre-wrap">{sample.generated_answer}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
              Click <span className="font-semibold text-indigo-400">&ldquo;Run Benchmark&rdquo;</span> above to evaluate Recall@K and citation correctness across this codebase.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
