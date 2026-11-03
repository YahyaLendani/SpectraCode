"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Play,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Target,
  Terminal,
  AlertCircle,
  ArrowUpRight,
  FileCode2,
} from "lucide-react";
import { api, EvaluationReport, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function EvaluationDashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const requestedRepo = params?.get("repo");

    api
      .listRepositories()
      .then((repos) => {
        setRepositories(repos);
        if (repos.length > 0) {
          const match =
            requestedRepo && repos.find((r) => r.id === requestedRepo);
          const initialId = match ? match.id : repos[0].id;
          setSelectedRepoId(initialId);
          loadLatestEvaluation(initialId);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  const loadLatestEvaluation = async (repoId: string) => {
    try {
      setError(null);
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
      setError(null);
      const res = await api.runEvaluation(selectedRepoId);
      setReport(res);
    } catch (err: any) {
      setError(err.message || "Benchmark execution failed.");
    } finally {
      setRunning(false);
    }
  };

  const kpiMetrics = [
    {
      group: "Retrieval",
      label: "Recall@5",
      value: report ? `${(report.mean_recall_at_k * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_recall_at_k * 100 : 0,
      desc: "Ground-truth span coverage",
    },
    {
      group: "Retrieval",
      label: "MRR@5",
      value: report ? report.mean_mrr.toFixed(3) : "—",
      pct: report ? report.mean_mrr * 100 : 0,
      desc: "Mean reciprocal rank",
    },
    {
      group: "Grounding",
      label: "Citation Precision",
      value: report
        ? `${(report.mean_citation_precision * 100).toFixed(1)}%`
        : "—",
      pct: report ? report.mean_citation_precision * 100 : 0,
      desc: "Citations intersecting GT",
    },
    {
      group: "Grounding",
      label: "Citation Recall",
      value: report
        ? `${(report.mean_citation_recall * 100).toFixed(1)}%`
        : "—",
      pct: report ? report.mean_citation_recall * 100 : 0,
      desc: "GT intervals cited",
    },
    {
      group: "Grounding",
      label: "Citation F1",
      value: report ? `${(report.mean_citation_f1 * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_citation_f1 * 100 : 0,
      desc: "Harmonic grounding mean",
    },
    {
      group: "Integrity",
      label: "Faithfulness",
      value: report ? `${(report.mean_faithfulness * 100).toFixed(1)}%` : "—",
      pct: report ? report.mean_faithfulness * 100 : 0,
      desc: "Code context entailment",
    },
  ];

  return (
    <div className="min-h-screen bg-[#090b10] text-zinc-100 flex flex-col">
      <Navbar repositories={repositories} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/[0.07] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/"
                className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Workspaces
              </Link>
              <span className="text-zinc-700">/</span>
              <span className="font-mono text-xs text-blue-400">
                Quantitative Evaluation Suite
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50 flex items-center gap-2.5">
              <BarChart3 className="h-6 w-6 text-blue-400" />
              <span>Retrieval &amp; Citation Grounding Benchmarks</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Automated evaluation measuring Recall@K, MRR, line-interval Citation Precision/Recall/F1, and Faithfulness.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedRepoId}
              onChange={(e) => {
                setSelectedRepoId(e.target.value);
                loadLatestEvaluation(e.target.value);
              }}
              aria-label="Select repository for evaluation"
              className="rounded-lg border border-white/[0.09] bg-[#0d1017] px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-blue-500 transition-colors"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.github_owner}/{r.github_name}
                </option>
              ))}
            </select>

            {selectedRepoId && (
              <Link
                href={`/repos/${selectedRepoId}`}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#11151f] hover:border-white/[0.16] px-3 py-2 text-xs font-medium text-zinc-200 transition-colors"
              >
                <span>Open Workspace</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
              </Link>
            )}

            <button
              onClick={handleRunBenchmark}
              disabled={running || !selectedRepoId}
              className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
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

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Cohesive 6-Metric Quantitative Ledger */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] rounded-xl border border-white/[0.07] bg-[#0d1017] tabular-nums">
          {kpiMetrics.map((kpi) => {
            const isHigh = kpi.pct >= 80;
            return (
              <div
                key={kpi.label}
                className="p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-400">
                      {kpi.label}
                    </span>
                    <span className="font-mono text-[9px] uppercase text-zinc-600">
                      {kpi.group}
                    </span>
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-100">
                    {kpi.value}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#090b10]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        !report
                          ? "bg-zinc-800"
                          : isHigh
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, kpi.pct))}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 block">
                    {kpi.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Benchmark Verification Ledger */}
        <div className="rounded-xl border border-white/[0.07] bg-[#0d1017] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#11151f] px-5 py-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-blue-400" />
              <span>Benchmark Test Queries &amp; Ground-Truth Span Verification</span>
            </h2>
            {report && (
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                Commit: {report.commit_sha} · Evaluated{" "}
                {new Date(report.created_at).toLocaleString()}
              </span>
            )}
          </div>

          {report && report.sample_results && report.sample_results.length > 0 ? (
            <div className="divide-y divide-white/[0.07]">
              {report.sample_results.map((sample, idx) => (
                <div
                  key={sample.query_id || idx}
                  className="p-5 space-y-4 hover:bg-white/[0.01] transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-300">
                          <Target className="h-3 w-3" /> {sample.query_id}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-100 pt-0.5">
                        {sample.query}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] shrink-0 tabular-nums">
                      <span className="rounded border border-white/[0.08] bg-[#090b10] px-2.5 py-0.5 text-zinc-300">
                        Recall:{" "}
                        <strong className="text-zinc-100">
                          {(sample.recall_at_k * 100).toFixed(0)}%
                        </strong>
                      </span>
                      <span className="rounded border border-white/[0.08] bg-[#090b10] px-2.5 py-0.5 text-zinc-300">
                        Cit P:{" "}
                        <strong className="text-emerald-400">
                          {(sample.citation_precision * 100).toFixed(0)}%
                        </strong>
                      </span>
                      <span className="rounded border border-white/[0.08] bg-[#090b10] px-2.5 py-0.5 text-zinc-300">
                        Cit F1:{" "}
                        <strong className="text-blue-400">
                          {(sample.citation_f1 * 100).toFixed(0)}%
                        </strong>
                      </span>
                      <span className="rounded border border-white/[0.08] bg-[#090b10] px-2.5 py-0.5 text-zinc-300">
                        Faith:{" "}
                        <strong className="text-zinc-100">
                          {(sample.faithfulness * 100).toFixed(0)}%
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/[0.07] bg-[#090b10] p-3 font-mono text-[11px] space-y-1.5 tabular-nums">
                      <span className="text-zinc-400 font-semibold block text-[10px] uppercase tracking-wider">
                        Ground-Truth Target Spans
                      </span>
                      {sample.ground_truth_spans.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {sample.ground_truth_spans.map((gt, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#11151f] px-2 py-0.5 text-zinc-200"
                            >
                              <FileCode2 className="h-3 w-3 text-blue-400" />
                              <span>
                                {gt.file_path}:{gt.start_line}-{gt.end_line}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-amber-300/90 italic">
                          None (Out-of-scope abstention test case)
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-white/[0.07] bg-[#090b10] p-3 font-mono text-[11px] space-y-1.5 tabular-nums">
                      <span className="text-zinc-400 font-semibold block text-[10px] uppercase tracking-wider">
                        Verified Citations Emitted by RepoLens
                      </span>
                      {sample.emitted_citations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {sample.emitted_citations.map((c, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                              <span>
                                {c.file_path}:{c.start_line}-{c.end_line}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-zinc-400 italic">
                          No citations emitted (Grounding gate safely abstained)
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-[#090b10]/60 p-3 text-xs text-zinc-300">
                    <span className="font-mono text-[10px] uppercase font-semibold text-zinc-500 block mb-1">
                      Generated Grounded Answer
                    </span>
                    <p className="line-clamp-3 whitespace-pre-wrap font-sans leading-relaxed text-zinc-300">
                      {sample.generated_answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-zinc-400">
              Click{" "}
              <span className="font-semibold text-zinc-200">
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
