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
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { api, FileDetail, Repository, TreeNode } from "@/lib/api";
import { FileExplorer } from "@/components/FileExplorer";
import { CodeViewer } from "@/components/CodeViewer";
import { ChatInterface } from "@/components/ChatInterface";
import { SearchModal } from "@/components/SearchModal";
import { DependencyGraph } from "@/components/DependencyGraph";

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
    <div className="flex h-screen flex-col overflow-hidden bg-[#060911] text-slate-100">
      {/* Executive Workspace Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090e1a] px-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-indigo-500/40 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Workspaces</span>
          </Link>

          <div className="h-4 w-[1px] bg-white/[0.08]" />

          <div className="flex items-center gap-2 min-w-0">
            <FolderGit2 className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="font-mono text-xs font-bold text-white truncate">
              {repo ? `${repo.github_owner}/${repo.github_name}` : "Loading..."}
            </span>
            {repo && (
              <div className="hidden md:flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  <GitBranch className="h-2.5 w-2.5 text-indigo-400" />
                  {repo.default_branch}
                </span>
                <span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                  {repo.total_files} files • {repo.total_chunks} AST chunks
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#060911] p-0.5 text-xs font-medium">
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition-all ${
              activeTab === "code"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Code &amp; Citations</span>
          </button>
          <button
            onClick={() => setActiveTab("dependencies")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition-all ${
              activeTab === "dependencies"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitFork className="h-3.5 w-3.5" />
            <span>Dependency Graph</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-900/90 px-3 py-1 text-xs text-slate-300 hover:border-indigo-500/40 hover:text-white transition-colors"
          >
            <Search className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Hybrid Search...</span>
            <kbd className="rounded border border-white/10 bg-slate-950 px-1.5 py-0.2 font-mono text-[10px] text-slate-400">
              ⌘K
            </kbd>
          </button>

          <Link
            href="/evaluation"
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-white transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Benchmarks</span>
          </Link>
        </div>
      </header>

      {/* 3-Pane Intelligence Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: File Explorer */}
        <div className="w-64 border-r border-white/[0.07] shrink-0">
          <FileExplorer
            tree={tree}
            selectedFilePath={selectedFile?.file_path || null}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Center Pane: Code Viewer or Dependency Graph */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "code" ? (
            <CodeViewer
              file={selectedFile}
              highlightRange={highlightRange}
              onSelectSymbol={(startLine, endLine) =>
                setHighlightRange([startLine, endLine ?? startLine + 12])
              }
            />
          ) : (
            <DependencyGraph
              repoId={repoId}
              onSelectFile={(filePath) => handleCitationClick(filePath, 1, 1)}
            />
          )}
        </div>

        {/* Right Pane: Grounded AI Copilot */}
        <div className="w-[430px] shrink-0">
          <ChatInterface
            repoId={repoId}
            onCitationClick={handleCitationClick}
          />
        </div>
      </div>

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
