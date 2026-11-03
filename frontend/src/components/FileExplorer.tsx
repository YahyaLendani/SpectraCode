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
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="group flex w-full items-center justify-between py-1 pr-2 text-xs text-zinc-300 hover:bg-white/[0.04] rounded transition-colors text-left font-medium"
        >
          <div className="flex items-center gap-1.5 truncate">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-blue-400/90 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-zinc-400 group-hover:text-blue-400/90 shrink-0" />
            )}
            <span className="truncate font-mono text-[11.5px] text-zinc-200">
              {node.name}
            </span>
          </div>
          {node.children && (
            <span className="font-mono text-[10px] text-zinc-600 tabular-nums">
              {node.children.length}
            </span>
          )}
        </button>

        {expanded && node.children && (
          <div className="relative">
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
    <button
      onClick={() => node.id && node.path && onSelectFile(node.id, node.path)}
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
      className={cn(
        "group flex w-full items-center justify-between py-1 pr-2 text-xs rounded transition-colors text-left my-0.5",
        isSelected
          ? "bg-blue-500/15 text-zinc-100 font-medium border-l-2 border-blue-400"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
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
              ? "text-blue-300/90"
              : "text-zinc-600 group-hover:text-zinc-400"
          )}
        >
          {node.lines}L
        </span>
      )}
    </button>
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
      <div className="flex h-full flex-col bg-[#0d1017] p-3.5 space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-5 rounded bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0d1017]">
      {/* Explorer Header */}
      <div className="p-2.5 border-b border-white/[0.07] space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <Files className="h-3 w-3 text-blue-400" />
            Files
          </span>
          <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
            {totalFiles} indexed
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-white/[0.08] bg-[#090b10] py-1 pl-7 pr-6 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-1.5">
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
          <div className="p-6 text-center text-xs text-zinc-500">
            {filter ? `No files match "${filter}"` : "No files indexed."}
          </div>
        )}
      </div>
    </div>
  );
};
