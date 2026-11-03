"use client";

import React, { useEffect, useState } from "react";
import {
  FolderGit2,
  Loader2,
  X,
  AlertCircle,
  GitBranch,
  Code2,
  Cpu,
  CheckCircle2,
  Zap,
  Terminal,
} from "lucide-react";
import { api, Repository } from "@/lib/api";

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

export const RepoImportModal: React.FC<RepoImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleImport = async (targetUrl?: string) => {
    const importUrl = (targetUrl ?? url).trim();
    if (!importUrl) {
      setError("Please enter a GitHub repository URL or select the instant sample.");
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-800 bg-[#0f1623] p-6 shadow-modal"
      >
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Close modal"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <FolderGit2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-100">
              Import &amp; Index Codebase
            </h2>
            <p className="text-xs text-slate-400">
              Parse AST symbols with Tree-sitter and build hybrid RRF vector + lexical indices
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1-Click Instant Sample Card */}
        <div className="mb-5 rounded-lg border border-blue-500/30 bg-[#111827] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-blue-400" />
              Instant Benchmark Repository (sample:fastapi)
            </span>
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Zero-Wait Demo
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mb-3">
            Pre-configured FastAPI CloudFlow microservice featuring JWT authentication, token expiration handling, distributed job scheduler with exponential backoff, and RBAC models.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-3.5 font-mono text-[10px]">
            <span className="rounded border border-slate-800 bg-[#0b0f17] px-2 py-0.5 text-slate-300">
              src/auth/jwt_handler.py
            </span>
            <span className="rounded border border-slate-800 bg-[#0b0f17] px-2 py-0.5 text-slate-300">
              src/services/scheduler.py
            </span>
            <span className="rounded border border-slate-800 bg-[#0b0f17] px-2 py-0.5 text-slate-300">
              src/models/user.py
            </span>
          </div>

          <button
            onClick={() => handleImport("sample:fastapi")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Indexing Sample Codebase...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-amber-300" />
                <span>Load Instant Sample Repository</span>
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-[#0f1623] px-3 text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider shrink-0">
            Or Public GitHub URL
          </span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        {/* Custom GitHub URL Input */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              GitHub Repository URL or <code className="font-mono text-blue-300">owner/repo</code>
            </label>
            <input
              type="text"
              placeholder="https://github.com/fastapi/fastapi or pallets/click"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !loading) {
                  e.preventDefault();
                  handleImport();
                }
              }}
              className="w-full rounded-lg border border-slate-800 bg-[#0b0f17] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium mr-1">
              Quick fill:
            </span>
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setUrl(preset.url)}
                className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-slate-700 hover:text-blue-300 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Pipeline Architecture Stepper */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {[
              { icon: GitBranch, label: "1. Git Clone" },
              { icon: Code2, label: "2. AST Parse" },
              { icon: Cpu, label: "3. ONNX Embed" },
              { icon: CheckCircle2, label: "4. RRF Ready" },
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-medium ${
                    loading
                      ? "border-blue-500/30 bg-blue-950/30 text-blue-300 animate-pulse"
                      : "border-slate-800 bg-[#0b0f17] text-slate-400"
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => handleImport()}
            disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-blue-600 hover:border-blue-500 text-white px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                <span>Ingesting &amp; Indexing Repository...</span>
              </>
            ) : (
              "Import & Index GitHub Repository"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
