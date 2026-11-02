"use client";

import React, { useEffect, useRef } from "react";
import { Code2, FileText, Hash, Layers } from "lucide-react";
import { FileDetail } from "@/lib/api";
import { cn, getLanguageColor } from "@/lib/utils";

interface CodeViewerProps {
  file: FileDetail | null;
  highlightRange?: [number, number] | null;
  onSelectSymbol?: (startLine: number) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  file,
  highlightRange,
  onSelectSymbol,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightRange && containerRef.current) {
      const [startLine] = highlightRange;
      const lineElem = containerRef.current.querySelector(
        `[data-line="${startLine}"]`
      );
      if (lineElem) {
        lineElem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightRange]);

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
        <Code2 className="mb-3 h-10 w-10 text-slate-700" />
        <p className="text-sm font-medium">Select a file from the explorer to view code</p>
        <p className="text-xs text-slate-600 mt-1">
          Click any citation in the AI chat to jump directly to referenced code lines
        </p>
      </div>
    );
  }

  const lines = file.content.split("\n");

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* File Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-mono font-medium text-slate-200">
            {file.file_path}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase",
              getLanguageColor(file.language)
            )}
          >
            {file.language}
          </span>
          <span className="text-[11px] text-slate-500">
            {file.line_count} lines
          </span>
        </div>

        {/* Highlight Banner if active */}
        {highlightRange && (
          <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300 border border-indigo-500/30 animate-pulse">
            <Hash className="h-3 w-3" />
            <span>
              Highlighted: L{highlightRange[0]} - L{highlightRange[1]}
            </span>
          </div>
        )}
      </div>

      {/* AST Symbols Bar */}
      {file.symbols && file.symbols.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-slate-800/80 bg-slate-900/40 px-4 py-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 shrink-0 font-medium">
            <Layers className="h-3 w-3" /> AST Symbols:
          </span>
          {file.symbols.map((sym) => (
            <button
              key={sym.id}
              onClick={() => onSelectSymbol && onSelectSymbol(sym.start_line)}
              className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-indigo-600 hover:text-white shrink-0 font-mono transition-colors"
            >
              <span className="text-indigo-400 font-semibold">{sym.kind}</span>{" "}
              {sym.name}
            </button>
          ))}
        </div>
      )}

      {/* Code Area */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4 font-mono text-xs">
        <pre className="text-slate-200">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isHighlighted =
              highlightRange &&
              lineNum >= highlightRange[0] &&
              lineNum <= highlightRange[1];

            return (
              <div
                key={lineNum}
                data-line={lineNum}
                className={cn("code-line", isHighlighted && "code-line-highlight")}
              >
                <span className="code-line-number">{lineNum}</span>
                <span className="code-content flex-1 whitespace-pre">
                  {line || " "}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
};
