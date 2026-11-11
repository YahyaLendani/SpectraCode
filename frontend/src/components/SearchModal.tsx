"use client";

import React, { useState, useEffect } from "react";
import { Search, Loader2, X } from "lucide-react";
import { api, SearchResultItem } from "@/lib/api";
import { cn, getSymbolBadgeStyle } from "@/lib/utils";

interface SearchModalProps {
  isOpen: boolean;
  repoId: string;
  onClose: () => void;
  onSelectResult: (filePath: string, startLine: number, endLine: number) => void;
}

const SUGGESTED_IDENTIFIERS = [
  "verify_jwt_token",
  "TokenExpiredError",
  "DistributedScheduler",
  "schedule_job",
  "UserRole",
];

/** First lines of a span, keeping the indentation of the first one. */
function previewOf(code: string): string {
  return code.replace(/^\s*\n/, "").trimEnd().split("\n").slice(0, 3).join("\n");
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  repoId,
  onClose,
  onSelectResult,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Display only: lets a failed request say so instead of reading as "no match".
  const [searchFailed, setSearchFailed] = useState(false);

  // Debounced live hybrid search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    setSearchFailed(false);
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.searchRepository(repoId, trimmed, 8);
        if (!isCancelled) {
          setResults(res.results);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error(err);
        if (!isCancelled) setSearchFailed(true);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }, 180);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, repoId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown" && results.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === "ArrowUp" && results.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === "Enter" && results.length > 0) {
        const active = results[selectedIndex];
        if (active) {
          e.preventDefault();
          onSelectResult(active.file_path, active.start_line, active.end_line);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, results, selectedIndex, onSelectResult]);

  if (!isOpen) return null;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (results.length > 0 && results[selectedIndex]) {
      const r = results[selectedIndex];
      onSelectResult(r.file_path, r.start_line, r.end_line);
      onClose();
    }
  };

  const trimmedQuery = query.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded border-2 border-ink bg-white shadow-overlay"
      >
        <div className="flex h-12 shrink-0 items-center justify-between bg-signal px-5">
          <h2 id="search-modal-title" className="text-lg font-bold text-ink">
            Search code
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-icon -mr-2 text-ink hover:bg-signal-deep active:bg-signal-deep"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleManualSubmit} className="shrink-0 px-5 pb-3 pt-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-sub"
              aria-hidden="true"
            />
            <input
              type="text"
              autoFocus
              aria-label="Search code"
              placeholder="Search by meaning or by name, e.g. verify token"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field h-12 pl-11 pr-11 text-base"
            />
            {loading && results.length > 0 && (
              <Loader2
                className="pointer-events-none absolute right-3.5 top-1/2 -mt-2.5 h-5 w-5 animate-spin text-sub"
                aria-label="Searching"
              />
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sub">
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd>
              to move
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd">Enter</kbd>
              to open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd">Esc</kbd>
              to close
            </span>
          </p>
        </form>

        <div className="min-h-0 overflow-y-auto border-t border-rule">
          {searchFailed && (
            <div className={cn("p-5", results.length > 0 && "border-b border-rule")}>
              <p role="alert" className="note note-error">
                The search could not run. Check that the server is reachable, then type again to
                retry.
              </p>
            </div>
          )}

          {results.length > 0 ? (
            <ul>
              {results.map((r, idx) => {
                const isSelected = idx === selectedIndex;
                const slash = r.file_path.lastIndexOf("/");
                return (
                  <li key={r.chunk_id} className="border-b border-rule last:border-b-0">
                    <button
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onFocus={() => setSelectedIndex(idx)}
                      onClick={() => {
                        onSelectResult(r.file_path, r.start_line, r.end_line);
                        onClose();
                      }}
                      aria-current={isSelected ? "true" : undefined}
                      title={`Meaning ${r.dense_score.toFixed(2)}, keyword ${r.sparse_score.toFixed(2)}, combined ${r.rrf_score.toFixed(3)}`}
                      className={cn(
                        "block w-full cursor-pointer px-5 py-3 text-left transition-colors duration-150 hover:bg-wash active:bg-sunk focus-visible:-outline-offset-2",
                        isSelected && "bg-signal-soft hover:bg-signal-soft"
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-1 w-1 shrink-0",
                            isSelected && "bg-signal ring-1 ring-ink"
                          )}
                        />
                        {r.symbol_name && (
                          <span className="min-w-0 truncate font-mono text-sm font-bold text-ink">
                            {r.symbol_name}
                          </span>
                        )}
                        {r.symbol_name && r.symbol_kind && (
                          <span className={cn("tag shrink-0", getSymbolBadgeStyle(r.symbol_kind))}>
                            {r.symbol_kind}
                          </span>
                        )}
                        <span
                          className={cn(
                            "flex min-w-0 font-mono text-sm tabular-nums text-sub",
                            r.symbol_name && "sm:ml-auto"
                          )}
                        >
                          <span className="truncate">{r.file_path.slice(0, slash + 1)}</span>
                          <span className="shrink-0">
                            {r.file_path.slice(slash + 1)}:{r.start_line}-{r.end_line}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums text-sub",
                            !r.symbol_name && "ml-auto"
                          )}
                        >
                          match {r.final_score.toFixed(2)}
                        </span>
                      </span>
                      <code className="mt-2 block overflow-hidden whitespace-pre bg-wash p-2 font-mono text-[0.8125rem] leading-5 text-ink-2 [tab-size:4]">
                        {previewOf(r.raw_code)}
                      </code>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : loading ? (
            <ul aria-busy="true">
              <li className="sr-only">Searching</li>
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  aria-hidden="true"
                  className="border-b border-rule px-5 py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="skeleton h-4 w-40" />
                    <div className="skeleton h-4 w-48" />
                  </div>
                  <div className="skeleton mt-2 h-[4.75rem]" />
                </li>
              ))}
            </ul>
          ) : searchFailed ? null : trimmedQuery ? (
            <p className="p-5 text-sm text-sub">
              Nothing matched &ldquo;{trimmedQuery}&rdquo;. Try a function name, or describe what
              the code does.
            </p>
          ) : (
            <div className="p-5">
              <p className="text-sm text-sub">
                Type a function or class name, or describe what the code does in your own words.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-sub">
                <span>Try</span>
                {SUGGESTED_IDENTIFIERS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setQuery(token)}
                    aria-label={`Search for ${token}`}
                    className="inline-flex h-8 cursor-pointer items-center rounded px-1.5 font-mono text-sm text-ink underline decoration-rule-strong transition-colors duration-150 hover:bg-wash hover:decoration-ink active:bg-sunk"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
