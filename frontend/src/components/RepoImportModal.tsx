"use client";

import React, { useState } from "react";
import { FolderGit2, Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { api, Repository } from "@/lib/api";

interface RepoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (repo: Repository) => void;
}

export const RepoImportModal: React.FC<RepoImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async (targetUrl?: string) => {
    const importUrl = targetUrl || url.trim();
    if (!importUrl) {
      setError("Please enter a GitHub repository URL or select the sample.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const repo = await api.importRepository(importUrl);
      onImportSuccess(repo);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import repository");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FolderGit2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Import Repository</h2>
            <p className="text-xs text-slate-400">
              Index public GitHub codebases with Tree-sitter AST parsing
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1-Click Sample Button */}
        <div className="mb-5 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Instant Demo Repository
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-900/60 px-2 py-0.5 rounded">
              Ready to Test
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3">
            FastAPI CloudFlow microservice with JWT auth, token expiration, distributed scheduler with retry backoff, and user models.
          </p>
          <button
            onClick={() => handleImport("sample:fastapi")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load Sample Repository"}
          </button>
        </div>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase font-semibold">
            Or custom GitHub URL
          </span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        {/* Custom URL Input */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              GitHub Repository URL
            </label>
            <input
              type="text"
              placeholder="e.g. https://github.com/fastapi/fastapi or fastapi/fastapi"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            onClick={() => handleImport()}
            disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50 border border-slate-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Ingesting Repository...</span>
              </>
            ) : (
              "Import and Index Codebase"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
