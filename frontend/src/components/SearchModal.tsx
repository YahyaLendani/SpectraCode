"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  Loader2,
  FileCode2,
  Sparkles,
  CornerDownLeft,
} from "lucide-react";
import { api, SearchResultItem } from "@/lib/api";
import { cn } from "@/lib/utils";

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

  // Debounced live hybrid search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
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
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }, 200);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-md p-4 pt-16"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b101e] shadow-2xl"
      >
        {/* Top Command Input Bar */}
        <form
          onSubmit={handleManualSubmit}
          className="flex items-center border-b border-white/[0.08] bg-[#060911] px-4 py-3.5"
        >
          <Search className="h-4 w-4 text-indigo-400 mr-3 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search AST symbols, identifiers, or natural language concepts (Hybrid RRF)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent font-mono text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400 mr-2" />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:text-white"
          >
            ESC
          </button>
        </form>

        {/* Results Feed */}
        <div className="max-h-[62vh] overflow-y-auto p-3 space-y-2">
          {results.length > 0 ? (
            results.map((r, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={r.chunk_id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onSelectResult(r.file_path, r.start_line, r.end_line);
                    onClose();
                  }}
                  className={cn(
                    "group cursor-pointer rounded-xl border p-3 transition-all",
                    isSelected
                      ? "border-indigo-500/60 bg-indigo-950/25 shadow-md"
                      : "border-white/[0.07] bg-slate-950/60 hover:border-indigo-500/40"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="font-mono text-xs font-bold text-white">
                        {r.file_path}
                        <span className="text-indigo-300">
                          :{r.start_line}-{r.end_line}
                        </span>
                      </span>
                      {r.symbol_name && (
                        <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                          {r.symbol_kind || "symbol"}: {r.symbol_name}
                        </span>
                      )}
                    </div>

                    {/* RRF Score Decomposition */}
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span
                        className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-400"
                        title="Dense ONNX Vector Cosine Similarity"
                      >
                        Dense {(r.dense_score * 100).toFixed(0)}%
                      </span>
                      <span
                        className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-400"
                        title="Sparse Lexical + Identifier Fuzzy Score"
                      >
                        Lex {(r.sparse_score * 100).toFixed(0)}%
                      </span>
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-300">
                        RRF {(r.final_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Code Preview */}
                  <pre className="rounded-lg border border-white/[0.05] bg-[#060911] p-2.5 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-24">
                    {r.raw_code.trim()}
                  </pre>
                </div>
              );
            })
          ) : query.trim() && !loading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching AST code chunks found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="p-6 text-center space-y-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Instant Hybrid Reciprocal Rank Fusion Search</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Combines 384-d dense embeddings with camelCase &amp; snake_case token expansion
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {SUGGESTED_IDENTIFIERS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setQuery(token)}
                    className="rounded-lg border border-white/[0.08] bg-slate-900/90 px-2.5 py-1 font-mono text-[11px] text-indigo-300 hover:border-indigo-500/50 hover:bg-indigo-950/40 transition-colors"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Keyboard Hints */}
        <div className="flex items-center justify-between border-t border-white/[0.07] bg-[#060911] px-4 py-2 text-[10px] text-slate-500 font-mono">
          <span>↑↓ Navigate results</span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> Jump to exact file &amp; lines
          </span>
        </div>
      </div>
    </div>
  );
};
