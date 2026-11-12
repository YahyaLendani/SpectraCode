"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, EvaluationReport, EvaluationSample, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { cn } from "@/lib/utils";

type Span = { file_path: string; start_line: number; end_line: number };

/*
 * Same rule the backend evaluator uses for citation precision: the two
 * spans are in the same file and share at least one line.
 */
const normPath = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");

function spansOverlap(a: Span, b: Span): boolean {
  const pa = normPath(a.file_path);
  const pb = normPath(b.file_path);
  if (!(pa === pb || pa.endsWith(pb) || pb.endsWith(pa))) return false;
  return Math.min(a.end_line, b.end_line) - Math.max(a.start_line, b.start_line) + 1 > 0;
}

const spanText = (s: Span) => `${s.file_path}:${s.start_line}-${s.end_line}`;
const wholePct = (v: number) => `${(v * 100).toFixed(0)}%`;

/** Bar drawn to scale from 0 to full score, with the target as a red tick. */
function ScoreBar({ value, target, className }: { value: number; target: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div aria-hidden="true" className={cn("relative h-2 w-full bg-sunk", className)}>
      <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      <span
        className="absolute -bottom-1 -top-1 w-0.5 bg-line-red"
        style={{ left: `calc(${target * 100}% - 1px)` }}
      />
    </div>
  );
}

function Dot({ tone }: { tone: "green" | "red" | "orange" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        tone === "green" && "bg-line-green",
        tone === "red" && "bg-line-red",
        tone === "orange" && "bg-line-orange"
      )}
    />
  );
}

/** What the search column says for one question. */
function foundStatus(sample: EvaluationSample): { tone: "green" | "red" | "orange"; text: string } {
  if (sample.ground_truth_spans.length === 0) {
    return sample.recall_at_k >= 1
      ? { tone: "green", text: "Declined, as expected" }
      : { tone: "red", text: "Answered, should have declined" };
  }
  if (sample.recall_at_k >= 1) return { tone: "green", text: "Yes" };
  if (sample.recall_at_k > 0) return { tone: "orange", text: `Partly, ${wholePct(sample.recall_at_k)}` };
  return { tone: "red", text: "No" };
}

function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="border-t-[3px] border-ink" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex items-center gap-6 border-b border-rule py-4">
          <div className="w-64 max-w-[45%] shrink-0">
            <div className="skeleton h-5 w-full" />
            <div className="skeleton mt-2 h-3 w-2/3" />
          </div>
          <div className="skeleton ml-auto h-5 w-16 md:ml-0" />
          <div className="skeleton hidden h-2 flex-1 md:block" />
        </div>
      ))}
    </div>
  );
}

export default function EvaluationDashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Display only: lets the page tell "still loading" from "nothing there".
  const [reposState, setReposState] = useState<"loading" | "ready" | "failed">("loading");
  const [reportLoading, setReportLoading] = useState(false);

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
        setReposState("ready");
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
        setReposState("failed");
      });
  }, []);

  const loadLatestEvaluation = async (repoId: string) => {
    try {
      setError(null);
      setReportLoading(true);
      const runs = await api.listEvaluations(repoId);
      if (runs.length > 0) {
        setReport(runs[0]);
      } else {
        setReport(null);
      }
    } catch (err) {
      console.error(err);
      setReport(null);
    } finally {
      setReportLoading(false);
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

  /* Targets are the ones published in docs/EVALUATION_REPORT.md, section 2. */
  const metrics = report
    ? [
        {
          name: "Right code found",
          realName: "Recall@5",
          explain: "Share of the expected code spans that appear in the top 5 search results.",
          value: report.mean_recall_at_k,
          target: 0.85,
          decimal: false,
        },
        {
          name: "How high the right code ranks",
          realName: "MRR@5, scored from 0 to 1",
          explain:
            "1 means the first result was a right one, 0.5 the second, 0 none in the top 5. Averaged over the questions.",
          value: report.mean_mrr,
          target: 0.75,
          decimal: true,
        },
        {
          name: "Citations that point at the right code",
          realName: "Citation precision",
          explain: "Share of the answer's citations that overlap an expected span.",
          value: report.mean_citation_precision,
          target: 0.7,
          decimal: false,
        },
        {
          name: "Expected code that got cited",
          realName: "Citation recall",
          explain: "Share of the expected spans that the answer cites.",
          value: report.mean_citation_recall,
          target: 0.8,
          decimal: false,
        },
        {
          name: "Citation precision and recall combined",
          realName: "Citation F1",
          explain: "One figure for the two rows above. It is high only when both are.",
          value: report.mean_citation_f1,
          target: 0.8,
          decimal: false,
        },
        {
          name: "Citations backed by retrieved code",
          realName: "Faithfulness",
          explain: "Share of citations that lie inside the code the search retrieved for that question.",
          value: report.mean_faithfulness,
          target: 0.95,
          decimal: false,
        },
      ]
    : [];

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId);
  const isSampleRepo = Boolean(
    selectedRepo &&
      (selectedRepo.clone_url === "sample:fastapi" ||
        selectedRepo.clone_url.toLowerCase().includes("sample"))
  );
  const expectedSuiteLabel = selectedRepo
    ? isSampleRepo
      ? "SpectraCode Curated FastAPI Suite v1"
      : `SpectraCode Tailored AST Suite v1 (${selectedRepo.github_name})`
    : "Tailored Benchmark Suite";

  const reportRepo = report
    ? repositories.find((r) => r.id === report.repository_id) ?? selectedRepo
    : undefined;
  const busy = running || reportLoading;
  const samples = report?.sample_results ?? [];

  const runButton = (
    <button
      type="button"
      onClick={handleRunBenchmark}
      disabled={running || !selectedRepoId}
      className="btn btn-primary"
    >
      {running && (
        <span aria-hidden="true" className="station-now block h-2.5 w-2.5 border border-ink bg-signal" />
      )}
      {running ? "Running" : "Run tailored benchmark"}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar repositories={repositories} />

      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 pb-20 sm:px-8">
        <header className="pb-8 pt-10 sm:pt-14">
          <h1 className="text-[2.5rem] font-extrabold leading-none tracking-[-0.025em]">Benchmarks</h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-2">
            This page asks a repository a benchmark suite tailored to its indexed
            codebase, then scores whether the search found the right code and
            whether each citation points at the right lines.
          </p>
        </header>

        {reposState === "loading" ? (
          <TableSkeleton label="Loading repositories" />
        ) : reposState === "failed" ? (
          <div className="border-t-[3px] border-ink pt-6">
            <p className="note note-error max-w-2xl">
              The SpectraCode API did not respond, so repositories could not be loaded.
              Start the backend on port 8000, then reload this page.
            </p>
          </div>
        ) : repositories.length === 0 ? (
          <div className="border-t-[3px] border-ink pt-6">
            <h2 className="text-2xl font-extrabold tracking-[-0.01em]">
              No repository is ready to benchmark
            </h2>
            <p className="mt-1 max-w-[62ch] text-ink-2">
              A benchmark runs against a repository that has been imported and
              indexed. None has been imported yet.
            </p>
            <Link href="/" className="btn btn-primary mt-5">
              Import a repository
            </Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <section aria-label="Run a benchmark" className="border-t-[3px] border-ink pb-10 pt-4">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                <div className="w-full sm:w-80">
                  <label htmlFor="benchmark-repo" className="mb-1 block text-sm font-semibold">
                    Repository
                  </label>
                  <select
                    id="benchmark-repo"
                    value={selectedRepoId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedRepoId(nextId);
                      setReport(null);
                      loadLatestEvaluation(nextId);
                    }}
                    className="field cursor-pointer"
                  >
                    {repositories.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.github_owner}/{r.github_name}
                        {r.status === "ready" ? "" : " (not ready)"}
                      </option>
                    ))}
                  </select>
                </div>

                {runButton}

                {selectedRepoId && (
                  <Link href={`/repos/${selectedRepoId}`} className="btn">
                    Open workspace
                  </Link>
                )}

                {running && (
                  <p role="status" className="basis-full text-sm text-sub sm:basis-auto sm:self-center">
                    Running the tailored benchmark. Scores appear below when it finishes.
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="note note-error mt-4 max-w-2xl">
                  The benchmark did not finish ({error.replace(/\.$/, "")}). Make sure the
                  SpectraCode backend is running on port 8000 and this repository has
                  finished indexing, then run it again.
                </p>
              )}

              {selectedRepo && selectedRepo.status !== "ready" && (
                <p className="note note-warn mt-4 max-w-2xl">
                  This repository has not finished indexing, so a run now would search
                  an incomplete index.{" "}
                  <Link href="/" className="font-semibold underline">
                    Check its progress
                  </Link>
                </p>
              )}
            </section>

            {busy ? (
              <section aria-labelledby="scores-heading">
                <h2 id="scores-heading" className="pb-3 text-2xl font-extrabold tracking-[-0.01em]">
                  Scores
                </h2>
                <TableSkeleton label={running ? "Running the benchmark" : "Loading the latest run"} />
              </section>
            ) : !report ? (
              <section className="border-t-[3px] border-ink pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag h-6 px-2 font-mono text-xs">
                    {expectedSuiteLabel}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.01em]">
                  {selectedRepo
                    ? `Run the tailored benchmark for ${selectedRepo.github_owner}/${selectedRepo.github_name}`
                    : "No benchmark has been run for this workspace"}
                </h2>
                <p className="mt-2 max-w-[62ch] text-ink-2">
                  {isSampleRepo ? (
                    <>
                      No benchmark run is saved for{" "}
                      <span className="font-semibold text-ink">
                        {selectedRepo?.github_owner}/{selectedRepo?.github_name}
                      </span>{" "}
                      yet. Start a run to evaluate the curated FastAPI suite against
                      its expected code spans and abstention check.
                    </>
                  ) : (
                    <>
                      No benchmark run is saved for{" "}
                      <span className="font-semibold text-ink">
                        {selectedRepo
                          ? `${selectedRepo.github_owner}/${selectedRepo.github_name}`
                          : "this workspace"}
                      </span>{" "}
                      yet. Run the tailored benchmark to synthesize symbol-lookup
                      questions directly from this workspace&apos;s indexed AST classes
                      and functions—plus an out-of-scope abstention check—and score
                      retrieval recall, citation accuracy, and faithfulness.
                    </>
                  )}{" "}
                  No API key is required: answers come from Gemini when{" "}
                  <code className="text-[0.875rem] text-ink">GEMINI_API_KEY</code> is set
                  on the backend, and from the built-in grounded answer writer otherwise.
                </p>
                <div className="mt-5">{runButton}</div>
              </section>
            ) : (
              <>
                {/* Scores */}
                <section aria-labelledby="scores-heading" className="pb-14">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 id="scores-heading" className="text-2xl font-extrabold tracking-[-0.01em]">
                        Scores
                      </h2>
                      {report.benchmark_name && (
                        <span className="tag h-6 border-ink bg-signal-soft px-2.5 font-mono text-xs font-semibold text-ink">
                          {report.benchmark_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <table className="board mt-1">
                    <caption className="caption-top pb-3 text-left text-sm text-sub">
                      {reportRepo && (
                        <>
                          <span className="font-semibold text-ink">
                            {reportRepo.github_owner}/{reportRepo.github_name}
                          </span>
                          {" · "}
                        </>
                      )}
                      commit <span className="font-mono">{report.commit_sha.slice(0, 7)}</span>, run{" "}
                      <span className="tabular-nums">{new Date(report.created_at).toLocaleString()}</span>
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        <th scope="col" className="num !font-sans">Score</th>
                        <th scope="col" className="hidden !pr-0 pl-4 md:table-cell md:w-[38%]">
                          <span className="flex items-center justify-between gap-3">
                            <span>0</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden="true" className="block h-3 w-0.5 bg-line-red" />
                              Target
                            </span>
                            <span>Full score</span>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => {
                        const passes = m.value >= m.target;
                        const score = m.decimal ? m.value.toFixed(3) : `${(m.value * 100).toFixed(1)}%`;
                        const target = m.decimal ? m.target.toFixed(3) : wholePct(m.target);
                        return (
                          <tr key={m.realName}>
                            <th scope="row" className="!border-rule !py-3 !text-base !font-normal !text-ink">
                              <span className="block font-bold">{m.name}</span>
                              <span className="block text-xs text-sub">{m.realName}</span>
                              <span className="mt-0.5 block max-w-[56ch] text-sm text-ink-2">{m.explain}</span>
                              <ScoreBar value={m.value} target={m.target} className="mt-3 md:hidden" />
                            </th>
                            <td className={cn("num whitespace-nowrap", passes ? "text-line-green" : "text-line-red")}>
                              <span className="block text-lg font-semibold">{score}</span>
                              <span className="block font-sans text-xs font-semibold">
                                {passes ? "meets target" : "below target"} of {target}
                              </span>
                            </td>
                            <td className="hidden !pr-0 pl-4 md:table-cell">
                              <ScoreBar value={m.value} target={m.target} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 max-w-[80ch] text-[0.8125rem] text-sub">
                    An expected span counts as found or cited when at least 40% of its
                    lines are covered. Targets are the ones in the project&apos;s
                    evaluation report.
                  </p>
                </section>

                {/* Per-question results */}
                <section aria-labelledby="questions-heading">
                  <h2 id="questions-heading" className="pb-3 text-2xl font-extrabold tracking-[-0.01em]">
                    Results by question
                  </h2>
                  {samples.length === 0 ? (
                    <p className="max-w-[62ch] border-t-[3px] border-ink pt-4 text-ink-2">
                      This saved run was loaded without its per-question results. Run
                      the benchmark again to see them.
                    </p>
                  ) : (
                    <>
                      <table className="board">
                        <thead>
                          <tr>
                            <th scope="col">Question</th>
                            <th scope="col">Found in top results</th>
                            <th scope="col" className="num hidden !font-sans sm:table-cell">Citation precision</th>
                            <th scope="col" className="num hidden !font-sans sm:table-cell">Citation recall</th>
                            <th scope="col" className="num hidden !pr-0 !font-sans sm:table-cell">Faithfulness</th>
                          </tr>
                        </thead>
                        <tbody>
                          {samples.map((sample, idx) => {
                            const found = foundStatus(sample);
                            return (
                              <tr key={sample.query_id || idx}>
                                <td className="align-top">
                                  <details>
                                    <summary className="cursor-pointer font-semibold text-ink hover:underline">
                                      {sample.query}
                                    </summary>
                                    <div className="pb-2 pt-3">
                                      <dl className="mb-4 grid grid-cols-3 gap-3 text-sm sm:hidden">
                                        {[
                                          ["Citation precision", sample.citation_precision],
                                          ["Citation recall", sample.citation_recall],
                                          ["Faithfulness", sample.faithfulness],
                                        ].map(([label, v]) => (
                                          <div key={label as string}>
                                            <dt className="text-xs text-sub">{label}</dt>
                                            <dd className="font-mono tabular-nums">{wholePct(v as number)}</dd>
                                          </div>
                                        ))}
                                      </dl>

                                      <h3 className="text-sm font-semibold text-sub">Generated answer</h3>
                                      <p className="mt-1 max-w-[70ch] whitespace-pre-wrap text-base leading-relaxed text-ink-2">
                                        {sample.generated_answer}
                                      </p>

                                      <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
                                        <div>
                                          <h3 className="text-sm font-semibold text-sub">Expected spans</h3>
                                          {sample.ground_truth_spans.length > 0 ? (
                                            <ul className="mt-1.5 space-y-1.5">
                                              {sample.ground_truth_spans.map((gt, i) => (
                                                <li key={i} className="break-all font-mono text-[0.8125rem] tabular-nums text-ink">
                                                  {spanText(gt)}
                                                </li>
                                              ))}
                                            </ul>
                                          ) : (
                                            <p className="mt-1.5 text-sm text-ink-2">
                                              None. The repository has no code for this
                                              question, so the right response is to decline.
                                            </p>
                                          )}
                                        </div>
                                        <div>
                                          <h3 className="text-sm font-semibold text-sub">Cited spans</h3>
                                          {sample.emitted_citations.length > 0 ? (
                                            <ul className="mt-1.5 space-y-1.5">
                                              {sample.emitted_citations.map((c, i) => {
                                                const matches = sample.ground_truth_spans.some((gt) =>
                                                  spansOverlap(c, gt)
                                                );
                                                return (
                                                  <li key={i} className="flex items-center gap-2">
                                                    <span
                                                      aria-hidden="true"
                                                      className={cn(
                                                        "block h-5 w-5 shrink-0 rounded-full",
                                                        matches ? "bg-line-green" : "bg-line-red"
                                                      )}
                                                    />
                                                    <span className="break-all font-mono text-[0.8125rem] tabular-nums text-ink">
                                                      {spanText(c)}
                                                    </span>
                                                    <span
                                                      className={cn(
                                                        "whitespace-nowrap text-xs font-semibold",
                                                        matches ? "text-line-green" : "text-line-red"
                                                      )}
                                                    >
                                                      {matches ? "matches" : "no match"}
                                                    </span>
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          ) : (
                                            <p className="mt-1.5 text-sm text-ink-2">
                                              None. The answer cites no code.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <p className="mt-4 text-xs text-sub">
                                        Question id <span className="font-mono">{sample.query_id}</span>
                                      </p>
                                    </div>
                                  </details>
                                </td>
                                <td className="whitespace-nowrap align-top text-sm">
                                  <span className="inline-flex items-center gap-2">
                                    <Dot tone={found.tone} />
                                    {found.text}
                                  </span>
                                </td>
                                <td className="num hidden align-top text-sm sm:table-cell">
                                  {wholePct(sample.citation_precision)}
                                </td>
                                <td className="num hidden align-top text-sm sm:table-cell">
                                  {wholePct(sample.citation_recall)}
                                </td>
                                <td className="num hidden !pr-0 align-top text-sm sm:table-cell">
                                  {wholePct(sample.faithfulness)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="mt-3 max-w-[80ch] text-[0.8125rem] text-sub">
                        Select a question to read its answer and compare the cited spans
                        with the expected ones. A question the repository cannot answer
                        scores 100% when SpectraCode declines and 0% when it answers anyway.
                      </p>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
