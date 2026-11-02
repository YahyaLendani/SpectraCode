"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Code2,
  GitFork,
  Layers,
  Search,
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { api, FileDetail, Repository, TreeNode } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { FileExplorer } from "@/components/FileExplorer";
import { CodeViewer } from "@/components/CodeViewer";
import { ChatInterface } from "@/components/ChatInterface";
import { SearchModal } from "@/components/SearchModal";
import { DependencyGraph } from "@/components/DependencyGraph";

export default function RepositoryWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<Repository | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [highlightRange, setHighlightRange] = useState<[number, number] | null>(null);
  const [activeTab, setActiveTab] = useState<"code" | "dependencies">("code");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load repo info and tree
  useEffect(() => {
    if (!repoId) return;

    let isMounted = true;
    Promise.all([api.getRepository(repoId), api.getRepositoryTree(repoId)])
      .then(([r, t]) => {
        if (!isMounted) return;
        setRepo(r);
        setTree(t);
        setLoading(false);

        // Auto-select first source file if none selected
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
        if (isMounted) setLoading(false);
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

  const handleSelectFile = async (fileId: string, filePath: string) => {
    try {
      const detail = await api.getFileContent(repoId, fileId);
      setSelectedFile(detail);
      setHighlightRange(null);
      setActiveTab("code");
    } catch (err) {
      console.error(err);
    }
  };

  // Called when user clicks a citation in AI chat or Search Modal
  const handleCitationClick = async (filePath: string, startLine: number, endLine: number) => {
    // If the file is not currently open, locate it by path in tree
    if (!selectedFile || selectedFile.file_path !== filePath) {
      const fileNode = findNodeByPath(tree, filePath);
      if (fileNode && fileNode.id) {
        try {
          const detail = await api.getFileContent(repoId, fileNode.id);
          setSelectedFile(detail);
        } catch (err) {
          console.error(err);
        }
      }
    }
    setHighlightRange([startLine, endLine]);
    setActiveTab("code");
  };

  const findNodeByPath = (node: TreeNode | null, path: string): TreeNode | null => {
    if (!node) return null;
    const normTarget = path.replace(/\\/g, "/").toLowerCase();
    if (node.path && (node.path.replace(/\\/g, "/").toLowerCase() === normTarget || node.path.endsWith(path))) {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const f = findNodeByPath(child, path);
        if (f) return f;
      }
    }
    return null;
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090d16] text-slate-100">
      {/* Workspace Header */}
      <header className="flex h-12 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Repos
          </Link>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-white">
              {repo ? `${repo.github_owner}/${repo.github_name}` : "Loading..."}
            </span>
            {repo && (
              <span className="rounded bg-indigo-950/80 border border-indigo-800/80 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                {repo.total_files} files • {repo.total_chunks} chunks
              </span>
            )}
          </div>
        </div>

        {/* Center Tabs */}
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs font-medium">
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
              activeTab === "code"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" /> Code &amp; Citations
          </button>
          <button
            onClick={() => setActiveTab("dependencies")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
              activeTab === "dependencies"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitFork className="h-3.5 w-3.5" /> Dependency Graph
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-slate-700 transition-colors"
          >
            <Search className="h-3.5 w-3.5 text-indigo-400" />
            <span>Search Code...</span>
            <kbd className="rounded bg-slate-800 px-1 py-0.2 text-[10px] text-slate-500">⌘K</kbd>
          </button>

          <Link
            href="/evaluation"
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-indigo-600 hover:text-white transition-colors"
          >
            Benchmark
          </Link>
        </div>
      </header>

      {/* 3-Pane Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: File Explorer (240px) */}
        <div className="w-64 border-r border-slate-800 shrink-0">
          <FileExplorer
            tree={tree}
            selectedFilePath={selectedFile?.file_path || null}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Center Pane: Code Viewer or Dependencies */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "code" ? (
            <CodeViewer
              file={selectedFile}
              highlightRange={highlightRange}
              onSelectSymbol={(startLine) => setHighlightRange([startLine, startLine + 10])}
            />
          ) : (
            <DependencyGraph
              repoId={repoId}
              onSelectFile={(filePath) => handleCitationClick(filePath, 1, 1)}
            />
          )}
        </div>

        {/* Right Pane: AI Chat Assistant (420px) */}
        <div className="w-[420px] shrink-0">
          <ChatInterface repoId={repoId} onCitationClick={handleCitationClick} />
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
