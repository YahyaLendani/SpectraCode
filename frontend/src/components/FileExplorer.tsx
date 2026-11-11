"use client";

import React, { useMemo, useState } from "react";
import { File, Folder, FolderOpen, Search, X } from "lucide-react";
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

const ROW =
  "flex h-7 w-full cursor-pointer items-center gap-2 pr-3 text-left font-sans text-sm transition-colors duration-150 focus-visible:outline-offset-[-2px]";

const SKELETON_WIDTHS = ["w-24", "w-36", "w-28", "w-40", "w-20", "w-32", "w-28"];

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  selectedFilePath,
  onSelectFile,
  depth = 0,
  forceOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const expanded = forceOpen || isOpen;
  const indent = { paddingLeft: `${depth * 12 + 12}px` };

  if (node.type === "directory") {
    const FolderIcon = expanded ? FolderOpen : Folder;
    return (
      <div role="treeitem" aria-expanded={expanded}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={indent}
          aria-label={`Folder ${node.name}`}
          className={cn(ROW, "font-semibold text-ink hover:bg-sunk active:bg-rule")}
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-sub" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.children && (
            <span
              className="shrink-0 text-xs font-normal tabular-nums text-sub"
              title={`${node.children.length} ${
                node.children.length === 1 ? "item" : "items"
              }`}
            >
              {node.children.length}
            </span>
          )}
        </button>

        {expanded && node.children && (
          <div role="group">
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
        type="button"
        onClick={() => node.id && node.path && onSelectFile(node.id, node.path)}
        style={indent}
        aria-label={`Open file ${node.name}`}
        className={cn(
          ROW,
          isSelected
            ? "bg-signal font-semibold text-ink"
            : "text-ink-2 hover:bg-sunk hover:text-ink active:bg-rule"
        )}
      >
        <File
          className={cn("h-4 w-4 shrink-0", isSelected ? "text-ink" : "text-sub")}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {typeof node.lines === "number" && (
          <span
            className={cn(
              "shrink-0 text-xs font-normal tabular-nums",
              isSelected ? "text-ink" : "text-sub"
            )}
            title={`${node.lines} ${node.lines === 1 ? "line" : "lines"}`}
          >
            {node.lines}
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
      <div
        className="flex h-full flex-col gap-3 bg-wash p-3"
        aria-busy="true"
        aria-label="Loading files"
      >
        {SKELETON_WIDTHS.map((w, i) => (
          <div key={i} className={cn("skeleton h-4", w)} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-wash">
      <div className="space-y-2 border-b border-rule p-3">
        <h2 className="text-sm font-bold text-ink">
          Files
          <span className="ml-2 font-normal tabular-nums text-sub">
            {totalFiles.toLocaleString()}
          </span>
        </h2>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sub"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Filter files"
            aria-label="Filter files by name or path"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="field field-sm pl-8 pr-8"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              title="Clear filter"
              className="absolute right-0.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-sub transition-colors duration-150 hover:bg-wash hover:text-ink active:bg-sunk"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div
        role="tree"
        aria-label="Repository files"
        className="flex-1 overflow-y-auto py-1"
      >
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
          <p className="px-3 py-2 text-sm text-sub">
            {filter
              ? `No file matches "${filter}".`
              : "This repository has no indexed files."}
          </p>
        )}
      </div>
    </div>
  );
};
