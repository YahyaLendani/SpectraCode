"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Search,
  ArrowRight,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { api, Repository } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { RepoImportModal } from "@/components/RepoImportModal";
import { DeleteRepoModal } from "@/components/DeleteRepoModal";
import {
  IndexingLine,
  IndexingLineHeader,
  indexingLabel,
  Roundel,
  Route,
} from "@/components/LineMap";
import { LINE_COLORS } from "@/lib/utils";

const INDEXING_STATES = ["pending", "cloning", "parsing_ast", "embedding"];

/*
 * The example answer on this page is real: these are spans in the bundled
 * FastAPI sample (backend SampleRepositoryFactory), at the lines the index
 * reports for them.
 */
const EXAMPLE_STOPS = [
  { n: 1, filePath: "src/api/routes.py", startLine: 9, endLine: 16, color: LINE_COLORS[0] },
  { n: 2, filePath: "src/auth/jwt_manager.py", startLine: 10, endLine: 32, color: LINE_COLORS[1] },
  { n: 3, filePath: "src/config.py", startLine: 3, endLine: 9, color: LINE_COLORS[2] },
];

/* Figures from docs/EVALUATION_REPORT.md. */
const MEASURED = [
  { label: "Right code in the top 5 results", value: "100%" },
  { label: "Citations that point at the right lines", value: "76.7%" },
  { label: "Declines when the code has no answer", value: "100%" },
];

const HOW_IT_WORKS = [
  {
    name: "Parse",
    text: "Each file is split along function, method and class boundaries, so a span is always a whole unit with exact line numbers.",
  },
  {
    name: "Search",
    text: "A meaning-based search and an identifier-aware keyword search each rank the spans. The two rankings are merged.",
  },
  {
    name: "Follow",
    text: "Functions and types that the top spans refer to are looked up one hop away and added as context.",
  },
  {
    name: "Answer",
    text: "The model writes its answer and cites spans by file and line range.",
  },
  {
    name: "Check",
    text: "Every citation is compared with the retrieved code. Lines out of range are clamped, unknown files are rejected, and unsupported questions get no answer.",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "indexing">("all");
  const [importingSample, setImportingSample] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<Repository | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadRepos = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const list = await api.listRepositories();
      setRepositories(
        list.filter((r) => !pendingDeleteIdsRef.current.has(r.id))
      );
      setLoadFailed(false);
    } catch (err) {
      console.error(err);
      setLoadFailed(true);
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

  // Press "/" to focus the repository filter input, or "Escape" to close the delete modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && repoToDelete && !deletingId) {
        setRepoToDelete(null);
        setDeleteError(null);
        return;
      }
      if (
        e.key === "/" &&
        !isImportOpen &&
        !repoToDelete &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImportOpen, repoToDelete, deletingId]);

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

  const handleConfirmDelete = async () => {
    if (!repoToDelete || deletingId) return;
    const target = repoToDelete;
    const snapshot = repositories;

    // Optimistic local state update
    pendingDeleteIdsRef.current.add(target.id);
    setDeletingId(target.id);
    setDeleteError(null);
    setRepositories((prev) => prev.filter((r) => r.id !== target.id));

    try {
      await api.deleteRepository(target.id);
      setRepoToDelete(null);
    } catch (err: any) {
      console.error(err);
      // Rollback optimistic removal on failure
      setRepositories(snapshot);
      setDeleteError(err?.message || "Could not delete the workspace.");
    } finally {
      pendingDeleteIdsRef.current.delete(target.id);
      setDeletingId(null);
    }
  };

  const totals = useMemo(() => {
    const ready = repositories.filter((r) => r.status === "ready").length;
    const indexing = repositories.filter((r) => INDEXING_STATES.includes(r.status)).length;
    const files = repositories.reduce((acc, r) => acc + (r.total_files || 0), 0);
    const spans = repositories.reduce((acc, r) => acc + (r.total_chunks || 0), 0);
    return { all: repositories.length, ready, indexing, files, spans };
  }, [repositories]);

  const sampleRepo = useMemo(
    () => repositories.find((r) => r.clone_url === "sample:fastapi" && r.status === "ready"),
    [repositories]
  );

  const filteredRepositories = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return repositories.filter((r) => {
      if (statusFilter === "ready" && r.status !== "ready") return false;
      if (statusFilter === "indexing" && !INDEXING_STATES.includes(r.status)) return false;
      if (!q) return true;
      return (
        r.github_owner.toLowerCase().includes(q) ||
        r.github_name.toLowerCase().includes(q) ||
        r.clone_url.toLowerCase().includes(q) ||
        r.default_branch.toLowerCase().includes(q)
      );
    });
  }, [repositories, searchFilter, statusFilter]);

  const sourceLabel = (repo: Repository) =>
    repo.clone_url === "sample:fastapi"
      ? "Bundled sample"
      : repo.clone_url.replace(/^https?:\/\//, "").replace(/\.git$/, "");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar repositories={repositories} />

      <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 sm:px-8">
        {/* What it is, and one checked answer as proof */}
        <section className="grid gap-x-16 gap-y-12 pb-14 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_26.5rem]">
          <div>
            <h1 className="max-w-[18ch] text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.025em] sm:text-[3.25rem]">
              Ask a codebase anything. Check every answer.
            </h1>
            <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-ink-2">
              SpectraCode indexes a repository and answers questions about it. Each
              answer cites the exact file and lines it came from, and every
              citation is checked against the source before you see it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="btn btn-primary h-11 px-5"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Import a repository
              </button>
              {sampleRepo ? (
                <Link href={`/repos/${sampleRepo.id}`} className="btn h-11 px-5">
                  Open the FastAPI sample
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickSampleImport}
                  disabled={importingSample}
                  className="btn h-11 px-5"
                >
                  {importingSample ? "Loading the sample" : "Load the FastAPI sample"}
                </button>
              )}
            </div>
          </div>

          <aside
            aria-label="Example of a checked answer"
            className="border-t-[3px] border-ink pt-4 lg:border-l-[3px] lg:border-t-0 lg:pl-8 lg:pt-0"
          >
            <p className="text-sm text-sub">An answer from the bundled FastAPI sample</p>
            <h2 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-[-0.01em]">
              Where is the access token verified?
            </h2>
            <p className="mt-3 leading-relaxed text-ink-2">
              The scheduling routes call{" "}
              <code className="font-semibold text-ink">get_current_user_claims</code>
              <Roundel n={1} color={LINE_COLORS[0]} className="mx-1 align-[-3px]" />
              which passes the token to{" "}
              <code className="font-semibold text-ink">TokenManager.verify_token</code>
              <Roundel n={2} color={LINE_COLORS[1]} className="mx-1 align-[-3px]" />
              The signing key and algorithm come from{" "}
              <span className="whitespace-nowrap">
                <code className="font-semibold text-ink">AppSettings</code>
                <Roundel n={3} color={LINE_COLORS[2]} className="ml-1 align-[-3px]" />
              </span>
            </p>

            <Route
              stops={EXAMPLE_STOPS}
              className="mt-6"
              note={<span className="font-semibold text-line-green">checked</span>}
            />

            <dl className="mt-6 border-t border-rule">
              {MEASURED.map((m) => (
                <div
                  key={m.label}
                  className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-sm"
                >
                  <dt className="text-ink-2">{m.label}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-ink">{m.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[0.8125rem] text-sub">
              Measured on the built-in benchmark.{" "}
              <Link href="/evaluation" className="font-semibold text-ink underline hover:text-line-blue">
                Run it yourself
              </Link>
            </p>
          </aside>
        </section>

        {/* Workspaces */}
        <section aria-labelledby="workspaces-heading" className="pb-16">
          <div className="flex flex-col gap-4 pb-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="workspaces-heading" className="text-2xl font-extrabold tracking-[-0.01em]">
                Workspaces
              </h2>
              {repositories.length > 0 && (
                <p className="mt-0.5 text-sm text-sub tabular-nums">
                  {totals.all} {totals.all === 1 ? "repository" : "repositories"},{" "}
                  {totals.files.toLocaleString()} files, {totals.spans.toLocaleString()} code spans indexed
                </p>
              )}
            </div>

            {repositories.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div role="group" aria-label="Filter by status" className="flex gap-4">
                  {(
                    [
                      { id: "all", label: "All", count: totals.all },
                      { id: "ready", label: "Ready", count: totals.ready },
                      { id: "indexing", label: "Indexing", count: totals.indexing },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      aria-pressed={statusFilter === tab.id}
                      className="tab h-9"
                    >
                      {tab.label}
                      <span className="font-normal tabular-nums text-sub">{tab.count}</span>
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sub"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Filter by name or branch"
                    aria-label="Filter workspaces"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="field field-sm h-9 w-64 pl-8 pr-9"
                  />
                  {!searchFilter && (
                    <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</kbd>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => loadRepos(true)}
                  title="Refresh"
                  aria-label="Refresh workspace statuses"
                  className="btn-icon h-9 w-9"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {loading && repositories.length === 0 ? (
            <div className="border-t-[3px] border-ink" aria-busy="true" aria-label="Loading workspaces">
              {[0, 1, 2].map((n) => (
                <div key={n} className="flex items-center gap-6 border-b border-rule py-4">
                  <div className="skeleton h-5 w-64" />
                  <div className="skeleton hidden h-4 w-16 sm:block" />
                  <div className="skeleton ml-auto h-4 w-44" />
                </div>
              ))}
            </div>
          ) : loadFailed && repositories.length === 0 ? (
            <div className="border-t-[3px] border-ink pt-6">
              <p className="note note-error max-w-2xl">
                The SpectraCode API did not respond, so workspaces could not be loaded. Start
                the backend on port 8000, then refresh.
              </p>
              <button type="button" onClick={() => loadRepos()} className="btn mt-4">
                Try again
              </button>
            </div>
          ) : repositories.length === 0 ? (
            <div className="border-t-[3px] border-ink pt-6">
              <h3 className="text-lg font-bold">No repositories yet</h3>
              <p className="mt-1 max-w-[62ch] text-ink-2">
                Import any public GitHub repository by its URL. Indexing takes four
                steps: clone, parse, embed, ready. To try a question straight away, load
                the small FastAPI sample that ships with SpectraCode.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setIsImportOpen(true)} className="btn btn-primary">
                  Import a repository
                </button>
                <button
                  type="button"
                  onClick={handleQuickSampleImport}
                  disabled={importingSample}
                  className="btn"
                >
                  {importingSample ? "Loading the sample" : "Load the FastAPI sample"}
                </button>
              </div>
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="border-t-[3px] border-ink pt-6">
              <p className="text-ink-2">No workspace matches this filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchFilter("");
                  setStatusFilter("all");
                }}
                className="btn btn-sm mt-3"
              >
                Clear the filter
              </button>
            </div>
          ) : (
            <>
              {/* Wide screens: departure board */}
              <table className="board hidden md:table">
                <thead>
                  <tr>
                    <th scope="col">Repository</th>
                    <th scope="col">Branch</th>
                    <th scope="col" className="num !font-sans">Files</th>
                    <th scope="col" className="num !font-sans">Spans</th>
                    <th scope="col" className="pl-6">
                      <span className="sr-only">Indexing progress</span>
                      <IndexingLineHeader />
                    </th>
                    <th scope="col" className="!pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRepositories.map((repo) => (
                    <tr
                      key={repo.id}
                      onClick={() => router.push(`/repos/${repo.id}`)}
                      className="group cursor-pointer"
                    >
                      <td>
                        <Link
                          href={`/repos/${repo.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-bold text-ink group-hover:underline"
                        >
                          {repo.github_owner}/{repo.github_name}
                        </Link>
                        <span className="block max-w-[28rem] truncate font-mono text-xs text-sub">
                          {sourceLabel(repo)}
                        </span>
                        {repo.error_message && (
                          <span className="mt-1 block max-w-[28rem] text-[0.8125rem] text-line-red">
                            {repo.error_message}
                          </span>
                        )}
                      </td>
                      <td className="font-mono text-sm">
                        {repo.default_branch}
                        {repo.last_indexed_commit_sha && (
                          <span className="block text-xs text-sub">
                            {repo.last_indexed_commit_sha.slice(0, 7)}
                          </span>
                        )}
                      </td>
                      <td className="num text-sm">{repo.total_files.toLocaleString()}</td>
                      <td className="num text-sm">{repo.total_chunks.toLocaleString()}</td>
                      <td className="pl-6">
                        <IndexingLine status={repo.status} />
                        {repo.status === "failed" && (
                          <span className="mt-1 block text-xs font-semibold text-line-red">Failed</span>
                        )}
                      </td>
                      <td className="!pr-0 text-right">
                        <div className="inline-flex items-center justify-end gap-3">
                          <Link
                            href={`/evaluation?repo=${repo.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-semibold text-sub underline hover:text-ink"
                          >
                            Benchmark
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteError(null);
                              setRepoToDelete(repo);
                            }}
                            title={`Delete ${repo.github_owner}/${repo.github_name}`}
                            aria-label={`Delete ${repo.github_owner}/${repo.github_name}`}
                            className="btn-icon h-8 w-8 text-sub hover:border-line-red/40 hover:bg-line-red-soft hover:text-line-red"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Narrow screens: one stop per row */}
              <ul className="border-t-[3px] border-ink md:hidden">
                {filteredRepositories.map((repo) => (
                  <li key={repo.id} className="border-b border-rule py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/repos/${repo.id}`} className="min-w-0 flex-1 block">
                        <span className="block font-bold text-ink">
                          {repo.github_owner}/{repo.github_name}
                        </span>
                        <span className="block truncate font-mono text-xs text-sub">
                          {repo.default_branch} · {repo.total_files.toLocaleString()} files ·{" "}
                          {repo.total_chunks.toLocaleString()} spans
                        </span>
                        <span className="mt-2.5 flex items-center gap-3">
                          <IndexingLine status={repo.status} />
                          <span
                            className={`text-[0.8125rem] font-semibold ${
                              repo.status === "failed" ? "text-line-red" : "text-ink-2"
                            }`}
                          >
                            {indexingLabel(repo.status)}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setRepoToDelete(repo);
                        }}
                        title={`Delete ${repo.github_owner}/${repo.github_name}`}
                        aria-label={`Delete ${repo.github_owner}/${repo.github_name}`}
                        className="btn-icon h-8 w-8 shrink-0 text-sub hover:border-line-red/40 hover:bg-line-red-soft hover:text-line-red"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {repo.error_message && (
                      <p className="mt-1.5 text-[0.8125rem] text-line-red">{repo.error_message}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* How an answer gets checked: the pipeline as a five-stop line */}
        <section aria-labelledby="how-heading" className="border-t-[3px] border-ink pb-20 pt-10">
          <h2 id="how-heading" className="text-2xl font-extrabold tracking-[-0.01em]">
            How an answer gets checked
          </h2>
          <ol className="relative mt-8 grid gap-y-7 lg:grid-cols-5 lg:gap-x-8">
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-[11px] top-3 w-1.5 rounded-full bg-ink lg:bottom-auto lg:left-3 lg:right-[calc(20%-1.75rem)] lg:top-[9px] lg:h-1.5 lg:w-auto"
            />
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.name} className="relative pl-10 lg:pl-0">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-0 block h-6 w-6 rounded-full border-4 border-ink lg:static ${
                    i === HOW_IT_WORKS.length - 1 ? "bg-signal" : "bg-white"
                  }`}
                />
                <h3 className="text-lg font-bold leading-6 lg:mt-3">{step.name}</h3>
                <p className="mt-1 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-4 text-sm text-sub">
            <span>Reads Python, TypeScript, TSX and JavaScript.</span>
            <span>Search embeddings are computed on your machine.</span>
            <Link href="/evaluation" className="ml-auto inline-flex items-center gap-1 font-semibold text-ink underline hover:text-line-blue">
              See the benchmarks
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        </section>
      </main>

      <RepoImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={() => loadRepos(true)}
      />

      <DeleteRepoModal
        isOpen={Boolean(repoToDelete)}
        repository={repoToDelete}
        isDeleting={Boolean(deletingId)}
        error={deleteError}
        onClose={() => {
          if (!deletingId) {
            setRepoToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
