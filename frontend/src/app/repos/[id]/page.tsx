"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Search,
  PanelLeft,
  PanelRight,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { api, FileDetail, Repository, TreeNode } from "@/lib/api";
import { FileExplorer } from "@/components/FileExplorer";
import { CodeViewer } from "@/components/CodeViewer";
import { ChatInterface } from "@/components/ChatInterface";
import { SearchModal } from "@/components/SearchModal";
import { DependencyGraph } from "@/components/DependencyGraph";
import { BrandMark } from "@/components/Navbar";
import { indexingLabel } from "@/components/LineMap";
import { DeleteRepoModal } from "@/components/DeleteRepoModal";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "code", label: "Code", shortLabel: "Code" },
  { id: "dependencies", label: "Dependency graph", shortLabel: "Graph" },
] as const;

const SKELETON_WIDTHS = [
  "w-2/5",
  "w-3/5",
  "w-1/2",
  "w-1/3",
  "w-3/4",
  "w-1/2",
  "w-2/3",
  "w-1/4",
  "w-3/5",
  "w-2/5",
];

const PANE_TOGGLE =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border-2 text-ink transition-colors duration-150";
const PANE_TOGGLE_ON = "border-ink bg-white hover:bg-wash active:bg-sunk";
const PANE_TOGGLE_OFF =
  "border-transparent hover:border-ink/30 hover:bg-signal-deep active:bg-signal-deep";

function countLabel(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Placeholder for the centre pane while the file list is on its way. */
function CodeSkeleton() {
  return (
    <div className="h-full bg-white" aria-busy="true" aria-label="Loading the code">
      <div className="flex h-11 items-center border-b border-rule px-4">
        <div className="skeleton h-4 w-56" />
      </div>
      <div className="space-y-2.5 px-4 py-4">
        {SKELETON_WIDTHS.map((w, i) => (
          <div key={i} className={cn("skeleton h-3.5", w)} />
        ))}
      </div>
    </div>
  );
}

export default function RepositoryWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<Repository | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [highlightRange, setHighlightRange] = useState<[number, number] | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"code" | "dependencies">("code");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showCopilot, setShowCopilot] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // On a narrow screen start with the file list closed; it opens over the code.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setShowExplorer(false);
  }, []);

  // Global Cmd+K / Ctrl+K shortcut for the search dialog, Escape for delete modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDeleteModalOpen && !isDeleting) {
        setIsDeleteModalOpen(false);
        setDeleteError(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeleteModalOpen, isDeleting]);

  // Load repository metadata and file tree in parallel
  useEffect(() => {
    if (!repoId) return;

    let isMounted = true;
    Promise.all([api.getRepository(repoId), api.getRepositoryTree(repoId)])
      .then(([r, t]) => {
        if (!isMounted) return;
        setRepo(r);
        setTree(t);

        if (t.children && t.children.length > 0) {
          const firstFile = findFirstFile(t);
          if (firstFile && firstFile.id) {
            api.getFileContent(repoId, firstFile.id).then((f) => {
              if (isMounted) setSelectedFile(f);
            });
          }
        }
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      isMounted = false;
    };
  }, [repoId]);

  const findFirstFile = (node: TreeNode): TreeNode | null => {
    if (node.type === "file") return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findFirstFile(child);
        if (found) return found;
      }
    }
    return null;
  };

  // Precompute O(1) lookup map from normalized file_path -> TreeNode
  const fileNodeIndex = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (node: TreeNode | null) => {
      if (!node) return;
      if (node.type === "file" && node.path) {
        const norm = node.path.replace(/\\/g, "/").toLowerCase();
        map.set(norm, node);
        const baseName = norm.split("/").pop();
        if (baseName && !map.has(baseName)) {
          map.set(baseName, node);
        }
      }
      if (node.children) {
        for (const child of node.children) walk(child);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  // On a narrow screen the side panes cover the code, so step them aside
  // when the reader asks to see a file or a cited span.
  const revealCode = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) setShowExplorer(false);
    if (window.matchMedia("(max-width: 639px)").matches) setShowCopilot(false);
  };

  const handleSelectFile = async (fileId: string) => {
    revealCode();
    try {
      const detail = await api.getFileContent(repoId, fileId);
      setSelectedFile(detail);
      setHighlightRange(null);
      setActiveTab("code");
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!repoId || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteRepository(repoId);
      setRepo(null);
      setIsDeleteModalOpen(false);
      router.push("/");
    } catch (err: any) {
      console.error(err);
      setDeleteError(err?.message || "Could not delete the workspace.");
      setIsDeleting(false);
    }
  };

  // Triggered when clicking a citation in ChatInterface or a result in SearchModal
  const handleCitationClick = async (
    filePath: string,
    startLine: number,
    endLine: number
  ) => {
    revealCode();
    const normTarget = filePath.replace(/\\/g, "/").toLowerCase();

    if (
      !selectedFile ||
      selectedFile.file_path.replace(/\\/g, "/").toLowerCase() !== normTarget
    ) {
      let targetNode =
        fileNodeIndex.get(normTarget) ||
        fileNodeIndex.get(normTarget.split("/").pop() || "");

      if (!targetNode) {
        for (const [k, v] of Array.from(fileNodeIndex.entries())) {
          if (k.endsWith(normTarget) || normTarget.endsWith(k)) {
            targetNode = v;
            break;
          }
        }
      }

      if (targetNode && targetNode.id) {
        try {
          const detail = await api.getFileContent(repoId, targetNode.id);
          setSelectedFile(detail);
        } catch (err) {
          console.error(err);
        }
      }
    }
    setHighlightRange([startLine, endLine]);
    setActiveTab("code");
  };

  const statusDot = !repo
    ? "bg-rule-strong"
    : repo.status === "ready"
    ? "bg-line-green"
    : repo.status === "failed"
    ? "bg-line-red"
    : "bg-signal ring-1 ring-ink";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white font-sans text-ink">
      {/* Top band */}
      <header className="flex h-14 shrink-0 items-stretch gap-3 bg-signal px-3 text-ink sm:gap-4 sm:px-4">
        {/* The metadata wraps onto a clipped second row when it does not fit. */}
        <div className="-ml-1 flex h-14 min-w-0 flex-1 flex-wrap content-start gap-x-3 overflow-hidden pl-1">
          <div className="flex h-14 min-w-0 max-w-full items-center gap-3">
            <Link
              href="/"
              aria-label="All workspaces"
              title="All workspaces"
              className="flex shrink-0 items-center rounded-full"
            >
              <BrandMark />
            </Link>
            <h1 className="hidden min-w-0 translate-y-px truncate text-lg font-bold sm:block">
              {repo
                ? `${repo.github_owner}/${repo.github_name}`
                : "Loading workspace"}
            </h1>
          </div>
          {repo && (
            <p className="hidden h-14 translate-y-px items-center whitespace-nowrap text-sm tabular-nums lg:flex">
              {repo.default_branch} · {countLabel(repo.total_files, "file", "files")} ·{" "}
              {countLabel(repo.total_chunks, "code span", "code spans")}
            </p>
          )}
        </div>

        {/* View switcher */}
        <div role="group" aria-label="View" className="flex shrink-0 items-stretch">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveTab(view.id)}
              aria-pressed={activeTab === view.id}
              className={cn(
                "flex cursor-pointer items-center border-y-4 border-transparent px-2.5 text-[0.9375rem] font-bold transition-colors duration-150 focus-visible:outline-offset-[-4px] active:bg-signal-deep sm:px-3.5",
                activeTab === view.id ? "border-b-ink" : "hover:border-b-ink/30"
              )}
            >
              <span className="translate-y-px sm:hidden">{view.shortLabel}</span>
              <span className="hidden translate-y-px sm:inline">{view.label}</span>
            </button>
          ))}
        </div>

        {/* Search, pane toggles, benchmark, delete */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Search code"
            className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded border-2 border-ink bg-white px-2.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-wash active:bg-sunk"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Search code</span>
            <kbd className="kbd hidden md:inline-flex">Ctrl K</kbd>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowExplorer((prev) => !prev)}
              title="Show or hide the file list"
              aria-label="Show or hide the file list"
              aria-pressed={showExplorer}
              className={cn(PANE_TOGGLE, showExplorer ? PANE_TOGGLE_ON : PANE_TOGGLE_OFF)}
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowCopilot((prev) => !prev)}
              title="Show or hide the ask panel"
              aria-label="Show or hide the ask panel"
              aria-pressed={showCopilot}
              className={cn(PANE_TOGGLE, showCopilot ? PANE_TOGGLE_ON : PANE_TOGGLE_OFF)}
            >
              <PanelRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <Link
            href={`/evaluation?repo=${repoId}`}
            className="hidden shrink-0 px-1 text-sm font-bold hover:underline sm:inline"
          >
            Benchmark
          </Link>

          <button
            type="button"
            disabled={!repo}
            onClick={() => {
              setDeleteError(null);
              setIsDeleteModalOpen(true);
            }}
            title="Delete workspace"
            aria-label="Delete workspace"
            className={cn(
              PANE_TOGGLE,
              "border-transparent hover:border-line-red hover:bg-line-red-soft hover:text-line-red active:bg-line-red active:text-white disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Three panes */}
      {/* Below lg the side panes slide over the code instead of squeezing it. */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* File list */}
        {showExplorer && (
          <div className="absolute inset-y-0 left-0 z-20 w-[min(18rem,85vw)] border-r border-rule bg-wash shadow-overlay lg:static lg:z-auto lg:w-60 lg:shrink-0 lg:shadow-none">
            <FileExplorer
              tree={tree}
              selectedFilePath={selectedFile?.file_path || null}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {/* Code or dependency graph */}
        <div className="flex-1 overflow-hidden bg-white">
          {activeTab === "code" ? (
            !tree ? (
              <CodeSkeleton />
            ) : (
              <CodeViewer
                file={selectedFile}
                highlightRange={highlightRange}
                onSelectSymbol={(startLine, endLine) =>
                  setHighlightRange([startLine, endLine ?? startLine + 12])
                }
                onClearHighlight={() => setHighlightRange(null)}
              />
            )
          ) : (
            <DependencyGraph
              repoId={repoId}
              onSelectFile={(filePath) => handleCitationClick(filePath, 1, 1)}
            />
          )}
        </div>

        {/* Ask panel (ChatInterface draws its own left hairline) */}
        {showCopilot && (
          <div className="absolute inset-y-0 right-0 z-10 w-full bg-white sm:w-[410px] sm:shadow-overlay lg:static lg:z-auto lg:shrink-0 lg:shadow-none">
            <ChatInterface
              repoId={repoId}
              onCitationClick={handleCitationClick}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-rule bg-wash px-3 text-xs text-sub">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex shrink-0 items-center gap-1.5 font-semibold text-ink">
            <span
              aria-hidden="true"
              className={cn("h-2 w-2 rounded-full", statusDot)}
            />
            {repo ? indexingLabel(repo.status) : "Loading"}
          </span>
          {repo?.last_indexed_commit_sha && (
            <span className="hidden shrink-0 sm:inline">
              commit{" "}
              <span className="font-mono">
                {repo.last_indexed_commit_sha.slice(0, 8)}
              </span>
            </span>
          )}
          {selectedFile && (
            <span className="truncate font-mono tabular-nums">
              {selectedFile.file_path}
              {highlightRange
                ? highlightRange[0] === highlightRange[1]
                  ? `:${highlightRange[0]}`
                  : `:${highlightRange[0]}–${highlightRange[1]}`
                : ""}
            </span>
          )}
        </div>

        {selectedFile?.symbols && (
          <span className="hidden shrink-0 tabular-nums md:inline">
            {countLabel(selectedFile.symbols.length, "symbol", "symbols")} in
            this file
          </span>
        )}
      </footer>

      {/* Search dialog */}
      <SearchModal
        isOpen={isSearchOpen}
        repoId={repoId}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleCitationClick}
      />

      <DeleteRepoModal
        isOpen={isDeleteModalOpen && Boolean(repo)}
        repository={repo}
        isDeleting={isDeleting}
        error={deleteError}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteWorkspace}
        returnToDashboardNote={true}
      />
    </div>
  );
}
