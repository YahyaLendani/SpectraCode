"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Code2,
  GitFork,
  Search,
  ArrowLeft,
  BarChart3,
  FolderGit2,
  GitBranch,
  PanelLeft,
  PanelRight,
  GitCommit,
} from "lucide-react";
import Link from "next/link";
import { api, FileDetail, Repository, TreeNode } from "@/lib/api";
import { FileExplorer } from "@/components/FileExplorer";
import { CodeViewer } from "@/components/CodeViewer";
import { ChatInterface } from "@/components/ChatInterface";
import { SearchModal } from "@/components/SearchModal";
import { DependencyGraph } from "@/components/DependencyGraph";
import { cn } from "@/lib/utils";

export default function RepositoryWorkspacePage() {
  const params = useParams();
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

  // Global Cmd+K / Ctrl+K shortcut for Hybrid Search Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const handleSelectFile = async (fileId: string) => {
    try {
      const detail = await api.getFileContent(repoId, fileId);
      setSelectedFile(detail);
      setHighlightRange(null);
      setActiveTab("code");
    } catch (err) {
      console.error(err);
    }
  };

  // Triggered when clicking a citation pill in ChatInterface or result in SearchModal
  const handleCitationClick = async (
    filePath: string,
    startLine: number,
    endLine: number
  ) => {
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090b10] text-zinc-100">
      {/* Workspace Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#090b10] px-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0d1017] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-white/[0.16] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Workspaces</span>
          </Link>

          <div className="h-4 w-[1px] bg-white/[0.08]" />

          <div className="flex items-center gap-2 min-w-0">
            <FolderGit2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="font-mono text-xs font-semibold text-zinc-100 truncate">
              {repo ? `${repo.github_owner}/${repo.github_name}` : "Loading..."}
            </span>
            {repo && (
              <div className="hidden lg:flex items-center gap-1.5 tabular-nums">
                <span className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-[#0d1017] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  <GitBranch className="h-2.5 w-2.5 text-zinc-500" />
                  {repo.default_branch}
                </span>
                <span className="rounded border border-white/[0.07] bg-[#0d1017] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                  {repo.total_files} files · {repo.total_chunks} AST chunks
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#0d1017] p-0.5 text-xs font-medium">
          <button
            onClick={() => setActiveTab("code")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors",
              activeTab === "code"
                ? "bg-white/[0.1] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Code2
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "code" ? "text-blue-400" : "text-zinc-500"
              )}
            />
            <span>Code &amp; Citations</span>
          </button>
          <button
            onClick={() => setActiveTab("dependencies")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors",
              activeTab === "dependencies"
                ? "bg-white/[0.1] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <GitFork
              className={cn(
                "h-3.5 w-3.5",
                activeTab === "dependencies" ? "text-blue-400" : "text-zinc-500"
              )}
            />
            <span>Dependency Graph</span>
          </button>
        </div>

        {/* Right Actions & Pane Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#0d1017] px-2.5 py-1 text-xs text-zinc-300 hover:border-white/[0.16] hover:text-white transition-colors"
          >
            <Search className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden md:inline">Hybrid Search...</span>
            <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
              ⌘K
            </kbd>
          </button>

          <div className="hidden sm:flex items-center rounded-md border border-white/[0.08] bg-[#0d1017] p-0.5">
            <button
              onClick={() => setShowExplorer((prev) => !prev)}
              title="Toggle File Explorer"
              className={cn(
                "rounded p-1 transition-colors",
                showExplorer
                  ? "bg-white/[0.08] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowCopilot((prev) => !prev)}
              title="Toggle Grounded Copilot"
              className={cn(
                "rounded p-1 transition-colors",
                showCopilot
                  ? "bg-white/[0.08] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <Link
            href={`/evaluation?repo=${repoId}`}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0d1017] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-white/[0.16] hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden xl:inline">Benchmarks</span>
          </Link>
        </div>
      </header>

      {/* 3-Pane Intelligence Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: File Explorer */}
        {showExplorer && (
          <div className="w-60 border-r border-white/[0.07] shrink-0">
            <FileExplorer
              tree={tree}
              selectedFilePath={selectedFile?.file_path || null}
              onSelectFile={handleSelectFile}
            />
          </div>
        )}

        {/* Center Pane: Code Viewer or Dependency Graph */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "code" ? (
            <CodeViewer
              file={selectedFile}
              highlightRange={highlightRange}
              onSelectSymbol={(startLine, endLine) =>
                setHighlightRange([startLine, endLine ?? startLine + 12])
              }
              onClearHighlight={() => setHighlightRange(null)}
            />
          ) : (
            <DependencyGraph
              repoId={repoId}
              onSelectFile={(filePath) => handleCitationClick(filePath, 1, 1)}
            />
          )}
        </div>

        {/* Right Pane: Grounded AI Copilot */}
        {showCopilot && (
          <div className="w-[410px] shrink-0">
            <ChatInterface
              repoId={repoId}
              onCitationClick={handleCitationClick}
            />
          </div>
        )}
      </div>

      {/* Precision IDE Bottom Status Bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#090b10] px-3 font-mono text-[10.5px] text-zinc-500 select-none tabular-nums">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{repo?.status?.toUpperCase() || "READY"}</span>
          </span>
          {repo?.last_indexed_commit_sha && (
            <span className="hidden sm:flex items-center gap-1 text-zinc-500">
              <GitCommit className="h-2.5 w-2.5" />
              {repo.last_indexed_commit_sha.slice(0, 8)}
            </span>
          )}
          {selectedFile && (
            <span className="truncate text-zinc-400">
              {selectedFile.file_path}
              {highlightRange
                ? ` : L${highlightRange[0]}–L${highlightRange[1]}`
                : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {selectedFile?.symbols && (
            <span className="hidden md:inline text-zinc-500">
              {selectedFile.symbols.length} AST symbols
            </span>
          )}
          <span className="hidden sm:inline text-zinc-500">
            Tree-sitter · Hybrid RRF · Strict Citations
          </span>
        </div>
      </footer>

      {/* Global Hybrid Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        repoId={repoId}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleCitationClick}
      />
    </div>
  );
}
