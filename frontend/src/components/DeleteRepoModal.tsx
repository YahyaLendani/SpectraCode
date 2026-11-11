"use client";

import React, { useEffect } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Repository } from "@/lib/api";

interface DeleteRepoModalProps {
  isOpen: boolean;
  repository: Pick<
    Repository,
    "id" | "github_owner" | "github_name" | "default_branch" | "total_files" | "total_chunks"
  > | null;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
  returnToDashboardNote?: boolean;
}

export const DeleteRepoModal: React.FC<DeleteRepoModalProps> = ({
  isOpen,
  repository,
  isDeleting,
  error,
  onClose,
  onConfirm,
  returnToDashboardNote = false,
}) => {
  // Close on Escape when not deleting
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !repository) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-workspace-title"
        onClick={(e) => e.stopPropagation()}
        className="modal-card relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded border-2 border-ink bg-white shadow-overlay"
      >
        {/* Signal-yellow header consistent with RepoImportModal and SearchModal */}
        <div className="flex h-12 shrink-0 items-center justify-between bg-signal px-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-ink" aria-hidden="true" />
            <h2 id="delete-workspace-title" className="text-lg font-bold text-ink">
              Delete workspace
            </h2>
          </div>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            aria-label="Close"
            className="btn-icon -mr-2 text-ink hover:bg-signal-deep active:bg-signal-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto p-5 text-ink">
          {/* Target workspace summary card */}
          <div className="rounded border border-rule bg-wash px-4 py-3">
            <p className="font-mono text-base font-bold text-ink">
              {repository.github_owner}/{repository.github_name}
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-sub">
              {repository.default_branch} ·{" "}
              {repository.total_files.toLocaleString()}{" "}
              {repository.total_files === 1 ? "file" : "files"} ·{" "}
              {repository.total_chunks.toLocaleString()} code spans
            </p>
          </div>

          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">
            This permanently removes the indexed code spans, AST symbols,
            embeddings, conversations, benchmark history, and the cloned repository directory on disk.
            {returnToDashboardNote && " You will be returned to all workspaces."}
          </p>

          {error && (
            <div role="alert" className="note note-error mt-4 break-words">
              <p className="font-semibold">{error}</p>
            </div>
          )}

          {/* Action buttons matching site design tokens */}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={isDeleting}
              onClick={onClose}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onConfirm}
              className="btn border-line-red bg-line-red text-white hover:border-[#b81710] hover:bg-[#c81e16] active:bg-[#a51810]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {isDeleting ? "Deleting..." : "Delete workspace"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

