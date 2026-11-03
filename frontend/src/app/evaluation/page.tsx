"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Play,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Target,
  Activity,
} from "lucide-react";
import { api, EvaluationReport, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function EvaluationDashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.listRepositories().then((repos) => {
      setRepositories(repos);
      if (repos.length > 0) {
        setSelectedRepoId(repos[0].id);
        loadLatestEvaluation(repos[0].id);
      }
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

  const kpiCards = [
    {
      label: "Recall@5",
      value: report ? `${(report.mean_recall_at_k * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_recall_at_k * 100 : 0,
      desc: "Ground-truth span coverage",
      color: "text-indigo-400",
      bar: "bg-indigo-500",
    },
    {
      label: "MRR@5",
      value: report ? report.mean_mrr.toFixed(3) : "—",
      pct: report ? report.mean_mrr * 100 : 0,
      desc: "Mean reciprocal rank",
      color: "text-cyan-400",
      bar: "bg-cyan-400",
    },
    {
      label: "Citation Precision",
      value: report
        ? `${(report.mean_citation_precision * 100).toFixed(1)}%`
        : "—",
      pct: report ? report.mean_citation_precision * 100 : 0,
      desc: "Citations intersecting GT",
      color: "text-emerald-400",
      bar: "bg-emerald-400",
    },
    {
      label: "Citation Recall",
      value: report
        ? `${(report.mean_citation_recall * 100).toFixed(1)}%`
        : "—",
      pct: report ? report.mean_citation_recall * 100 : 0,
      desc: "GT intervals cited",
      color: "text-teal-300",
      bar: "bg-teal-400",
    },
    {
      label: "Citation F1",
      value: report ? `${(report.mean_citation_f1 * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_citation_f1 * 100 : 0,
      desc: "Harmonic grounding mean",
      color: "text-purple-400",
      bar: "bg-purple-500",
    },
    {
      label: "Faithfulness",
      value: report ? `${(report.mean_faithfulness * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_faithfulness * 100 : 0,
      desc: "Code context entailment",
      color: "text-amber-400",
      bar: "bg-amber-400",
    },
  ];

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col relative">
      <div className="pointer-events-none fixed inset-0 bg-grid-pattern opacity-50" />
      <Navbar repositories={repositories} />

      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link
                href="/"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Workspaces
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-xs font-semibold text-indigo-400">
                Quantitative Evaluation Suite
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <BarChart3 className="h-7 w-7 text-indigo-400" />
              <span>Retrieval &amp; Citation Grounding Benchmarks</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Automated evaluation measuring Recall@K, MRR, line-interval Citation Precision/Recall/F1, and Faithfulness.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedRepoId}
              onChange={(e) => {
                setSelectedRepoId(e.target.value);
                loadLatestEvaluation(e.target.value);
              }}
              aria-label="Select repository for evaluation"
              className="rounded-xl border border-white/[0.09] bg-slate-900/90 px-3.5 py-2 font-mono text-xs text-slate-200 outline-none focus:border-indigo-500"
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
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Running Suite...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>Run Benchmark Suite</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="glass-card rounded-xl p-4 flex flex-col justify-between space-y-2"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {kpi.label}
                </span>
                <div className={`mt-1 font-mono text-2xl font-extrabold ${kpi.color}`}>
                  {kpi.value}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${kpi.bar}`}
                    style={{ width: `${Math.min(100, Math.max(0, kpi.pct))}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  {kpi.desc}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Benchmark Samples */}
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-4">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>Benchmark Test Queries &amp; Ground-Truth Verification</span>
            </h2>
            {report && (
              <span className="font-mono text-xs text-slate-400">
                Commit: {report.commit_sha} • Evaluated{" "}
                {new Date(report.created_at).toLocaleString()}
              </span>
            )}
          </div>

          {report && report.sample_results && report.sample_results.length > 0 ? (
            <div className="space-y-4">
              {report.sample_results.map((sample, idx) => (
                <div
                  key={sample.query_id || idx}
                  className="rounded-xl border border-white/[0.07] bg-[#060911]/90 p-4 space-y-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                        <Target className="h-3 w-3" /> {sample.query_id}
                      </span>
                      <h3 className="text-sm font-semibold text-white pt-0.5">
                        {sample.query}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] shrink-0">
                      <span className="rounded-lg border border-indigo-500/30 bg-indigo-950/60 px-2.5 py-0.5 text-indigo-300">
                        Recall: {(sample.recall_at_k * 100).toFixed(0)}%
                      </span>
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-0.5 text-emerald-300">
                        Cit P: {(sample.citation_precision * 100).toFixed(0)}%
                      </span>
                      <span className="rounded-lg border border-amber-500/30 bg-amber-950/60 px-2.5 py-0.5 text-amber-300">
                        Faith: {(sample.faithfulness * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/[0.06] bg-slate-900/70 p-3 font-mono text-[11px] space-y-1">
                      <span className="text-slate-400 font-bold block mb-1">
                        Ground-Truth Target Spans:
                      </span>
                      {sample.ground_truth_spans.length > 0 ? (
                        sample.ground_truth_spans.map((gt, i) => (
                          <div key={i} className="text-slate-200 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                            <span>
                              {gt.file_path} (L{gt.start_line}–L{gt.end_line})
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-amber-300 italic">
                          None (Negative out-of-scope query test)
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-white/[0.06] bg-slate-900/70 p-3 font-mono text-[11px] space-y-1">
                      <span className="text-slate-400 font-bold block mb-1">
                        Verified Citations Emitted by RepoLens:
                      </span>
                      {sample.emitted_citations.length > 0 ? (
                        sample.emitted_citations.map((c, i) => (
                          <div
                            key={i}
                            className="text-emerald-300 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span>
                              {c.file_path} (L{c.start_line}–L{c.end_line})
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 italic">
                          No citations emitted (Engine safely abstained)
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-slate-900/40 p-3 text-xs text-slate-300">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Generated Grounded Answer Preview:
                    </span>
                    <p className="line-clamp-3 whitespace-pre-wrap font-sans leading-relaxed">
                      {sample.generated_answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-white/10 rounded-xl bg-slate-950/40">
              Click{" "}
              <span className="font-semibold text-indigo-400">
                &ldquo;Run Benchmark Suite&rdquo;
              </span>{" "}
              above to execute the automated retrieval &amp; citation grounding evaluation on this codebase.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
