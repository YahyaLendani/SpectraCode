"use client";

import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  Search,
  X,
  Files,
} from "lucide-react";
import { TreeNode } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileExplorerProps {
  tree: TreeNode | null;
  selectedFilePath: string | null;
  onSelectFile: (fileId: string, filePath: string) => void;
}

interface TreeItemProps {
  node: TreeNode;
  selectedFilePath: string | null;
  onSelectFile: (fileId: string, filePath: string) => void;
  depth?: number;
  forceOpen?: boolean;
}

function filterTreeNodes(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.type === "file") {
      const matchName = node.name.toLowerCase().includes(lower);
      const matchPath = node.path?.toLowerCase().includes(lower);
      if (matchName || matchPath) {
        result.push(node);
      }
    } else if (node.children) {
      const filteredChildren = filterTreeNodes(node.children, query);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
        result.push({
          ...node,
          children:
            filteredChildren.length > 0 ? filteredChildren : node.children,
        });
      }
    }
  }
  return result;
}

function countTotalFiles(node: TreeNode | null): number {
  if (!node) return 0;
  if (node.type === "file") return 1;
  if (!node.children) return 0;
  return node.children.reduce((acc, child) => acc + countTotalFiles(child), 0);
}

function getLangDotColor(lang?: string): string {
  switch ((lang || "").toLowerCase()) {
    case "python":
    case "py":
      return "text-blue-400";
    case "typescript":
    case "tsx":
    case "ts":
      return "text-sky-400";
    case "javascript":
    case "jsx":
    case "js":
      return "text-amber-400";
    default:
      return "text-zinc-500";
  }
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  selectedFilePath,
  onSelectFile,
  depth = 0,
  forceOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const expanded = forceOpen || isOpen;

  if (node.type === "directory") {
    return (
      <div role="treeitem" aria-expanded={expanded}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          aria-label={`Toggle directory ${node.name}`}
          className="cursor-pointer group flex w-full items-center justify-between py-1 pr-2 text-xs text-slate-300 hover:bg-white/[0.06] rounded transition-colors text-left font-medium focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <div className="flex items-center gap-1.5 truncate">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-400 shrink-0" />
            )}
            <span className="truncate font-mono text-[11.5px] text-slate-200">
              {node.name}
            </span>
          </div>
          {node.children && (
            <span className="font-mono text-[10px] text-slate-400 tabular-nums">
              {node.children.length}
            </span>
          )}
        </button>

        {expanded && node.children && (
          <div role="group" className="relative">
            {node.children.map((child, i) => (
              <TreeItem
                key={`${child.name}-${i}`}
                node={child}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                depth={depth + 1}
                forceOpen={forceOpen}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedFilePath === node.path;

  return (
    <div role="treeitem" aria-selected={isSelected}>
      <button
        onClick={() => node.id && node.path && onSelectFile(node.id, node.path)}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        aria-label={`Open file ${node.name}`}
        className={cn(
          "cursor-pointer group flex w-full items-center justify-between py-1 pr-2 text-xs rounded transition-colors text-left my-0.5 focus-visible:ring-1 focus-visible:ring-blue-500",
          isSelected
            ? "bg-blue-500/20 text-white font-medium border-l-2 border-blue-400"
            : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
        )}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <FileCode
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isSelected
                ? "text-blue-400"
                : cn(getLangDotColor(node.language), "opacity-80 group-hover:opacity-100")
            )}
          />
          <span className="truncate font-mono text-[11.5px]">{node.name}</span>
        </div>
        {typeof node.lines === "number" && (
          <span
            className={cn(
              "font-mono text-[10px] shrink-0 ml-1.5 tabular-nums",
              isSelected
                ? "text-blue-300"
                : "text-slate-400 group-hover:text-slate-200"
            )}
          >
            {node.lines}L
          </span>
        )}
      </button>
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  tree,
  selectedFilePath,
  onSelectFile,
}) => {
  const [filter, setFilter] = useState("");

  const filteredChildren = useMemo(() => {
    if (!tree || !tree.children) return [];
    return filterTreeNodes(tree.children, filter.trim());
  }, [tree, filter]);

  const totalFiles = useMemo(() => countTotalFiles(tree), [tree]);

  if (!tree) {
    return (
      <div className="flex h-full flex-col bg-[#06080d] p-3.5 space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-5 rounded bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#06080d]">
      {/* Explorer Header */}
      <div className="p-2.5 border-b border-white/[0.08] space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 font-mono">
            <Files className="h-3 w-3 text-blue-400" />
            Files
          </span>
          <span className="font-mono text-[10px] text-slate-400 tabular-nums">
            {totalFiles} indexed
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <input
            type="text"
            placeholder="Filter files..."
            aria-label="Filter files by name or path"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-white/[0.08] bg-[#000000] py-1 pl-7 pr-6 font-mono text-[11px] text-slate-200 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div role="tree" aria-label="Repository files" className="flex-1 overflow-y-auto p-1.5">
        {filteredChildren.length > 0 ? (
          filteredChildren.map((child, i) => (
            <TreeItem
              key={`${child.name}-${i}`}
              node={child}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
              forceOpen={Boolean(filter.trim())}
            />
          ))
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">
            {filter ? `No files match "${filter}"` : "No files indexed."}
          </div>
        )}
      </div>
    </div>
  );
};
