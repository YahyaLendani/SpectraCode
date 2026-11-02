"use client";

import React, { useState, useEffect } from "react";
import { Search, X, Hash, Code, Loader2, ArrowRight } from "lucide-react";
import { api, SearchResultItem } from "@/lib/api";

interface SearchModalProps {
  isOpen: boolean;
  repoId: string;
  onClose: () => void;
  onSelectResult: (filePath: string, startLine: number, endLine: number) => void;
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Toggle or open
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setLoading(true);
      const res = await api.searchRepository(repoId, query.trim(), 8);
      setResults(res.results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm p-4 pt-16">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex items-center border-b border-slate-800 px-4 py-3 bg-slate-950">
          <Search className="h-4 w-4 text-indigo-400 mr-2.5 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search code, functions, classes, or concepts (Hybrid RRF search)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-indigo-400 mr-2" />}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </form>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {results.length > 0 ? (
            results.map((r) => (
              <div
                key={r.chunk_id}
                onClick={() => {
                  onSelectResult(r.file_path, r.start_line, r.end_line);
                  onClose();
                }}
                className="group cursor-pointer rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-indigo-500/50 hover:bg-slate-800/40 transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-indigo-300">
                      {r.file_path}:{r.start_line}-{r.end_line}
                    </span>
                    {r.symbol_name && (
                      <span className="rounded bg-indigo-950/80 border border-indigo-800 px-1.5 py-0.2 text-[10px] font-mono text-indigo-300">
                        {r.symbol_kind || "symbol"}: {r.symbol_name}
                      </span>
                    )}
                  </div>

                  {/* Retrieval Scores Pill */}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-slate-400" title="Dense Vector Similarity">
                      Dense: {(r.dense_score * 100).toFixed(0)}%
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400" title="Sparse Lexical Overlap">
                      Sparse: {(r.sparse_score * 100).toFixed(0)}%
                    </span>
                    <span className="rounded bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 text-emerald-300 font-bold">
                      RRF: {(r.final_score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Code Snippet Preview */}
                <pre className="rounded bg-slate-900/90 p-2 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-24">
                  {r.raw_code.trim()}
                </pre>
              </div>
            ))
          ) : query && !loading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching code chunks found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              Type an identifier (e.g. <code className="text-indigo-400">TokenManager</code>, <code className="text-indigo-400">schedule_job</code>) or concept to test hybrid RRF search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
