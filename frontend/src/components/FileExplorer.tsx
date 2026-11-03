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
import { cn, getLanguageColor } from "@/lib/utils";

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
          className="flex w-full items-center justify-between py-1 pr-2 text-xs text-slate-300 hover:bg-white/[0.04] rounded-md transition-colors text-left font-medium"
        >
          <div className="flex items-center gap-1.5 truncate">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            )}
            <span className="truncate font-mono text-[11px]">{node.name}</span>
          </div>
          {node.children && (
            <span className="font-mono text-[10px] text-slate-600">
              {node.children.length}
            </span>
          )}
        </button>

        {expanded && node.children && (
          <div>
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
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
      className={cn(
        "group flex w-full items-center justify-between py-1 pr-2 text-xs rounded-md transition-all text-left my-0.5",
        isSelected
          ? "bg-indigo-500/20 text-white font-semibold border-l-2 border-indigo-400 shadow-sm"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
      )}
    >
      <div className="flex items-center gap-1.5 truncate min-w-0">
        <FileCode
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isSelected ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
          )}
        />
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        {typeof node.lines === "number" && (
          <span className="hidden xl:inline font-mono text-[9px] text-slate-600">
            {node.lines}L
          </span>
        )}
        {node.language && (
          <span
            className={cn(
              "text-[9px] px-1 py-0.2 rounded border font-mono uppercase shrink-0",
              getLanguageColor(node.language)
            )}
          >
            {node.language === "python"
              ? "py"
              : node.language === "typescript"
              ? "ts"
              : node.language === "javascript"
              ? "js"
              : node.language.slice(0, 3)}
          </span>
        )}
      </div>
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

  if (!tree) {
    return (
      <div className="flex h-full flex-col bg-[#080d19] p-4 space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-5 rounded bg-slate-800/50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#080d19]">
      {/* Explorer Header */}
      <div className="p-2.5 border-b border-white/[0.07] space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Files className="h-3 w-3 text-indigo-400" />
            Source Explorer
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files by path..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#060911] py-1.5 pl-8 pr-7 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2">
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
          <div className="p-6 text-center text-xs text-slate-500">
            {filter ? `No files match "${filter}"` : "No files indexed."}
          </div>
        )}
      </div>
    </div>
  );
};
