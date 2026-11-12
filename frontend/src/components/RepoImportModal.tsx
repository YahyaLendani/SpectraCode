"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, Repository } from "@/lib/api";
import { cn } from "@/lib/utils";
import { INDEXING_STOPS, indexingLabel, indexingStep } from "@/components/LineMap";

interface RepoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (repo: Repository) => void;
}

const QUICK_PRESETS = [
  { label: "pallets/click", url: "https://github.com/pallets/click" },
  { label: "encode/httpx", url: "https://github.com/encode/httpx" },
  { label: "tiangolo/typer", url: "https://github.com/tiangolo/typer" },
];

const EMPTY_URL_MESSAGE =
  "Enter a repository first, for example pallets/click, or load the FastAPI sample.";

const STAGE_HEADING: Record<string, string> = {
  cloning: "Fetching the repository",
  parsing_ast: "Reading the code",
  embedding: "Preparing the code for search",
  ready: "Ready",
};

/* -------------------------------------------------------------------------
 * The import drawn as a line with four stops. Local to this dialog: the
 * shared IndexingLine is the compact table version of the same idea.
 * ---------------------------------------------------------------------- */

const STOP_X = ["12.5%", "37.5%", "62.5%", "87.5%"];

interface ImportLineProps {
  /** Stop being worked on; 4 means every stop is done. */
  step: number;
  /** Stop the import had reached when it failed, or null. */
  failedAt: number | null;
  label: string;
}

const ImportLine: React.FC<ImportLineProps> = ({ step, failedAt, label }) => {
  const greenTo = failedAt ?? Math.min(step, 3);
  const stateOf = (i: number): "done" | "now" | "failed" | "ahead" => {
    if (failedAt !== null) {
      return i < failedAt ? "done" : i === failedAt ? "failed" : "ahead";
    }
    return i < step ? "done" : i === step ? "now" : "ahead";
  };

  return (
    <div>
      <svg
        role="img"
        aria-label={label}
        width="100%"
        height={24}
        className="block overflow-visible"
      >
        <line x1={STOP_X[0]} y1={12} x2={STOP_X[3]} y2={12} stroke="#C9CDD1" strokeWidth={6} />
        {greenTo > 0 && (
          <line x1={STOP_X[0]} y1={12} x2={STOP_X[greenTo]} y2={12} stroke="#007A41" strokeWidth={6} />
        )}
        {INDEXING_STOPS.map((stop, i) => {
          const state = stateOf(i);
          return (
            <svg key={stop} x={STOP_X[i]} y={12} width={1} height={1} overflow="visible">
              {state === "done" && (
                <>
                  <circle r={12} fill="#007A41" />
                  <path
                    d="M-5 0.5 L-1.5 4 L5.5 -3.5"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {state === "now" && (
                <>
                  {/* White backing so the line does not show through the pulse. */}
                  <circle r={12} fill="#FFFFFF" />
                  <circle
                    r={10.5}
                    fill="#FFD400"
                    stroke="#15171A"
                    strokeWidth={3}
                    className="station-now"
                  />
                </>
              )}
              {state === "failed" && (
                <>
                  <circle r={12} fill="#E2231A" />
                  <path
                    d="M-4 -4 L4 4 M4 -4 L-4 4"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </>
              )}
              {state === "ahead" && (
                <circle r={10.5} fill="#FFFFFF" stroke="#C9CDD1" strokeWidth={3} />
              )}
            </svg>
          );
        })}
      </svg>
      <ol aria-hidden="true" className="mt-2 grid grid-cols-4 text-center text-sm font-bold">
        {INDEXING_STOPS.map((stop, i) => (
          <li key={stop} className={stateOf(i) === "ahead" ? "text-sub" : "text-ink"}>
            {stop}
          </li>
        ))}
      </ol>
    </div>
  );
};

const count = (n: number, total: number, one: string, many: string) =>
  `${n.toLocaleString()} of ${total.toLocaleString()} ${total === 1 ? one : many}`;

export const RepoImportModal: React.FC<RepoImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{
    stage: string;
    pct: number;
    current_file?: string;
    files_processed?: number;
    total_files?: number;
    chunks_count?: number;
    total_chunks?: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  // The dialog stays mounted, so clear it before closing or the next open
  // would still show the finished import.
  const resetForm = () => {
    setLoading(false);
    setImportProgress(null);
    setError(null);
    setUrl("");
  };

  const handleImport = async (targetUrl?: string) => {
    const importUrl = (targetUrl ?? url).trim();
    if (!importUrl) {
      setError(EMPTY_URL_MESSAGE);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setImportProgress({ stage: "cloning", pct: 15, current_file: "Initiating clone..." });

      const repo = await api.importRepository(importUrl);
      if (repo.status === "ready") {
        setImportProgress({ stage: "ready", pct: 100, current_file: "Index ready" });
        setTimeout(() => {
          onImportSuccess(repo);
          resetForm();
          onClose();
        }, 600);
        return;
      }

      // Connect SSE stream for real-time progress
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
      const es = new EventSource(`${apiBase}/repositories/${repo.id}/progress-stream`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setImportProgress(data);
          if (data.stage === "ready") {
            es.close();
            setTimeout(() => {
              onImportSuccess({ ...repo, status: "ready" });
              resetForm();
              onClose();
            }, 700);
          } else if (data.stage === "failed") {
            es.close();
            setError(data.error || "The server gave no reason.");
            setLoading(false);
          }
        } catch {
          // ignore parsing error
        }
      };

      // The progress stream dropped. That says nothing about the import
      // itself, so ask the server before reporting anything.
      es.onerror = async () => {
        es.close();
        try {
          const latest = await api.getRepository(repo.id);
          if (latest.status === "failed") {
            setError(
              "Indexing failed on the server. Check the backend log, then try again."
            );
            setLoading(false);
            return;
          }
          // Still indexing or already ready: the workspace list keeps
          // polling and shows where it has got to.
          onImportSuccess(latest);
          resetForm();
          onClose();
        } catch {
          setError(
            "Lost the connection to the server, so the import's progress is unknown. Check that the backend is running, then look for the repository in the workspace list."
          );
          setLoading(false);
        }
      };
    } catch (err: any) {
      setError(err.message || "The import could not start.");
      setLoading(false);
    }
  };

  // Which view, and which stop, the streamed stage puts us at.
  const stage = importProgress?.stage ?? "";
  const failed = !loading && stage === "failed";
  const ready = stage === "ready";
  const showProgress = loading || failed;
  const step = indexingStep(stage as Repository["status"]);

  const filesTotal = importProgress?.total_files ?? 0;
  const filesDone = importProgress?.files_processed ?? 0;
  const spansTotal = importProgress?.total_chunks ?? 0;
  const spansDone = importProgress?.chunks_count ?? 0;

  // A failed event carries no stage of its own. The counts it leaves behind
  // say how far the import had got.
  const failedAt = failed ? (spansTotal > 0 || spansDone > 0 ? 2 : filesTotal > 0 || filesDone > 0 ? 1 : 0) : null;

  const filesFact =
    filesTotal > 0 ? count(Math.min(filesDone, filesTotal), filesTotal, "file", "files") : null;
  const spansFact =
    spansTotal > 0
      ? spansDone < spansTotal
        ? count(spansDone, spansTotal, "code span", "code spans")
        : `${spansTotal.toLocaleString()} ${spansTotal === 1 ? "code span" : "code spans"}`
      : spansDone > 0
      ? `${spansDone.toLocaleString()} ${spansDone === 1 ? "code span" : "code spans"}`
      : null;

  // The server sends status sentences in current_file outside the parse stage;
  // only a real path is shown.
  const currentFile =
    stage === "parsing_ast" && importProgress?.current_file && !importProgress.current_file.endsWith("...")
      ? importProgress.current_file
      : null;
  const slash = currentFile ? currentFile.lastIndexOf("/") : -1;

  const heading = failed ? "The import stopped" : STAGE_HEADING[stage] ?? "Queued";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="repo-import-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded border-2 border-ink bg-white shadow-overlay"
      >
        <div className="flex h-12 shrink-0 items-center justify-between bg-signal px-5">
          <h2 id="repo-import-title" className="text-lg font-bold text-ink">
            Import a repository
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="btn-icon -mr-2 text-ink hover:bg-signal-deep active:bg-signal-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {showProgress ? (
          <div className="overflow-y-auto p-5">
            <div aria-live="polite">
              <h3 className="text-lg font-bold text-ink">{heading}</h3>
            </div>

            <div className="mt-4">
              <ImportLine
                step={step}
                failedAt={failedAt}
                label={failed ? "Indexing failed" : indexingLabel(stage as Repository["status"])}
              />
            </div>

            {!failed && importProgress && (
              <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span className="font-mono text-2xl font-extrabold tabular-nums text-ink">
                  {Math.round(importProgress.pct ?? 0)}%
                </span>
                {filesFact && <span className="text-sm tabular-nums text-ink-2">{filesFact}</span>}
                {spansFact && <span className="text-sm tabular-nums text-ink-2">{spansFact}</span>}
                {currentFile && (
                  <span
                    className="flex min-w-0 flex-1 basis-40 font-mono text-sm text-sub"
                    title={currentFile}
                  >
                    <span className="sr-only">Current file: </span>
                    <span className="truncate">{currentFile.slice(0, slash + 1)}</span>
                    <span className="max-w-full shrink-0 truncate">{currentFile.slice(slash + 1)}</span>
                  </span>
                )}
              </div>
            )}

            {failed && (
              <>
                <div role="alert" className="note note-error mt-5">
                  <p className="font-semibold">The server stopped indexing this repository.</p>
                  {error && (
                    <p className="mt-1 max-h-32 overflow-y-auto break-words font-mono text-[0.8125rem]">
                      {error}
                    </p>
                  )}
                  <p className="mt-1">
                    Check that the repository exists and is public, then try again.
                  </p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setImportProgress(null);
                    }}
                    className="btn btn-primary"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}

            {ready && (
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={onClose} className="btn btn-primary">
                  Done
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto p-5">
            <label htmlFor="repo-import-url" className="mb-1.5 block text-sm font-semibold text-ink">
              GitHub repository
            </label>
            <input
              id="repo-import-url"
              type="text"
              placeholder="owner/name or https://github.com/owner/name"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !loading) {
                  e.preventDefault();
                  handleImport();
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={cn("repo-import-help", error && "repo-import-error")}
              className="field font-mono"
            />
            <p id="repo-import-help" className="mt-1.5 text-sm text-sub">
              Public repositories only. Python, TypeScript, TSX and JavaScript files are indexed.
            </p>

            {error && (
              <p id="repo-import-error" role="alert" className="note note-error mt-3 break-words">
                {error}
                {error !== EMPTY_URL_MESSAGE &&
                  " Check the address and that the repository is public, then try again."}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-1 text-sm text-sub">
              <span>Examples:</span>
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setUrl(preset.url)}
                  className="inline-flex h-8 cursor-pointer items-center rounded px-1.5 font-mono text-sm text-ink underline decoration-rule-strong transition-colors duration-150 hover:bg-wash hover:decoration-ink active:bg-sunk"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => handleImport("sample:fastapi")}
                disabled={loading}
                title="A small FastAPI service with sign-in tokens, a job scheduler and user roles."
                className="btn"
              >
                Load the FastAPI sample
              </button>
              <button
                type="button"
                onClick={() => handleImport()}
                disabled={loading || !url.trim()}
                className="btn btn-primary"
              >
                Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
