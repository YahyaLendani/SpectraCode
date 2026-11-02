"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileCode, Folder, FolderOpen, Search } from "lucide-react";
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
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  selectedFilePath,
  onSelectFile,
  depth = 0,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="flex w-full items-center gap-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800/60 rounded transition-colors text-left font-medium"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {isOpen && node.children && (
          <div>
            {node.children.map((child, i) => (
              <TreeItem
                key={`${child.name}-${i}`}
                node={child}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                depth={depth + 1}
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
        "flex w-full items-center justify-between py-1 pr-2 text-xs rounded transition-colors text-left",
        isSelected
          ? "bg-indigo-600/20 text-indigo-300 font-semibold border-l-2 border-indigo-500"
          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
      )}
    >
      <div className="flex items-center gap-1.5 truncate">
        <FileCode className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
      {node.language && (
        <span
          className={cn(
            "text-[9px] px-1 py-0.2 rounded border font-mono uppercase shrink-0",
            getLanguageColor(node.language)
          )}
        >
          {node.language}
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

  if (!tree) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        Loading file tree...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-950/50">
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tree.children && tree.children.length > 0 ? (
          tree.children.map((child, i) => (
            <TreeItem
              key={`${child.name}-${i}`}
              node={child}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
            />
          ))
        ) : (
          <div className="p-4 text-center text-xs text-slate-500">
            No files indexed.
          </div>
        )}
      </div>
    </div>
  );
};

