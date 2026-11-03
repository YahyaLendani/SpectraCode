"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  FileText,
  Hash,
  Layers,
  Copy,
  Check,
  Search,
  WrapText,
  ChevronRight,
  Sparkles,
  X,
  Crosshair,
} from "lucide-react";
import { FileDetail } from "@/lib/api";
import { cn, formatBytes, getLanguageColor, getSymbolBadgeStyle } from "@/lib/utils";

interface CodeViewerProps {
  file: FileDetail | null;
  highlightRange?: [number, number] | null;
  onSelectSymbol?: (startLine: number, endLine?: number) => void;
}

const CODE_KEYWORDS = new Set([
  "def",
  "class",
  "async",
  "await",
  "return",
  "import",
  "from",
  "as",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "try",
  "except",
  "finally",
  "raise",
  "with",
  "yield",
  "pass",
  "break",
  "continue",
  "True",
  "False",
  "None",
  "and",
  "or",
  "not",
  "in",
  "is",
  "lambda",
  "self",
  "cls",
  "const",
  "let",
  "var",
  "function",
  "export",
  "default",
  "interface",
  "type",
  "implements",
  "extends",
  "new",
  "null",
  "undefined",
  "true",
  "false",
]);

function renderSyntaxHighlightedLine(line: string): React.ReactNode {
  if (!line) return " ";
  const trimmed = line.trimStart();

  // Full-line comments
  if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  // Decorators / annotations
  if (trimmed.startsWith("@")) {
    return <span className="text-amber-300 font-medium">{line}</span>;
  }

  // Tokenize strings, words, numbers, and punctuation
  const tokenRegex =
    /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|[{}()[\].,:;+-/*=<>!&|]+)/g;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      parts.push(
        <span key={key} className="text-emerald-300">
          {token}
        </span>
      );
    } else if (CODE_KEYWORDS.has(token)) {
      parts.push(
        <span key={key} className="text-indigo-300 font-semibold">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key} className="text-amber-300">
          {token}
        </span>
      );
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      parts.push(
        <span key={key} className="text-cyan-300">
          {token}
        </span>
      );
    } else {
      parts.push(token);
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < line.length) {
    parts.push(line.slice(lastIdx));
  }

  return parts;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  file,
  highlightRange,
  onSelectSymbol,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState("");

  const scrollToHighlightedLine = () => {
    if (highlightRange && containerRef.current) {
      const [startLine] = highlightRange;
      const lineElem = containerRef.current.querySelector(
        `[data-line="${startLine}"]`
      );
      if (lineElem) {
        lineElem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  useEffect(() => {
    scrollToHighlightedLine();
  }, [highlightRange, file?.id]);

  const lines = useMemo(() => {
    if (!file) return [];
    return file.content.split("\n");
  }, [file]);

  const matchingLinesCount = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q || !lines.length) return 0;
    return lines.filter((l) => l.toLowerCase().includes(q)).length;
  }, [lines, findQuery]);

  const handleCopyCode = async () => {
    if (!file) return;
    try {
      let textToCopy = file.content;
      if (highlightRange) {
        const [start, end] = highlightRange;
        textToCopy = lines.slice(Math.max(0, start - 1), end).join("\n");
      }
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#060911] p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-slate-900/80 text-indigo-400 shadow-inner">
          <Code2 className="h-7 w-7" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">
          Select a source file to inspect AST boundaries
        </h3>
        <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">
          Choose any file from the left repository tree or click a verified{" "}
          <code className="font-mono text-indigo-300">[file:start-end]</code> citation badge in the AI chat to jump directly to exact source lines.
        </p>
      </div>
    );
  }

  const pathSegments = file.file_path.split("/").filter(Boolean);
  const byteSize = new Blob([file.content]).size;

  return (
    <div className="flex h-full flex-col bg-[#060911]">
      {/* Top IDE File Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0b101e] px-4 py-2">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <div className="flex items-center gap-1 font-mono text-xs text-slate-400 truncate">
            {pathSegments.map((seg, i) => {
              const isLast = i === pathSegments.length - 1;
              return (
                <React.Fragment key={`${seg}-${i}`}>
                  <span
                    className={cn(
                      "truncate",
                      isLast ? "font-semibold text-white" : "text-slate-500"
                    )}
                  >
                    {seg}
                  </span>
                  {!isLast && (
                    <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <span
            className={cn(
              "ml-1.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase shrink-0",
              getLanguageColor(file.language)
            )}
          >
            {file.language}
          </span>

          <span className="hidden sm:inline-block font-mono text-[11px] text-slate-500 pl-1 shrink-0">
            {file.line_count} lines • {formatBytes(byteSize)}
          </span>
        </div>

        {/* Right Toolbar & Citation Beacon */}
        <div className="flex items-center gap-2">
          {highlightRange && (
            <button
              onClick={scrollToHighlightedLine}
              title="Click to center highlighted citation span"
              className="flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-200 shadow-sm hover:bg-indigo-500/25 transition-colors"
            >
              <Crosshair className="h-3 w-3 text-indigo-400" />
              <span>
                L{highlightRange[0]}–L{highlightRange[1]}
              </span>
            </button>
          )}

          {/* In-File Search Toggle */}
          <button
            onClick={() => setShowFind((prev) => !prev)}
            title="Find in file"
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              showFind
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                : "border-white/[0.07] bg-slate-900/80 text-slate-400 hover:text-slate-200"
            )}
          >
            <Search className="h-3 w-3" />
            <span className="hidden md:inline">Find</span>
          </button>

          {/* Word Wrap Toggle */}
          <button
            onClick={() => setWordWrap((prev) => !prev)}
            title="Toggle line wrap"
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              wordWrap
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                : "border-white/[0.07] bg-slate-900/80 text-slate-400 hover:text-slate-200"
            )}
          >
            <WrapText className="h-3 w-3" />
          </button>

          {/* Copy Code / Span Button */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-slate-900/80 hover:border-indigo-500/40 hover:text-white px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-slate-400" />
                <span>{highlightRange ? "Copy Span" : "Copy"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible In-File Search Bar */}
      {showFind && (
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-slate-900/90 px-4 py-1.5">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-3.5 w-3.5 text-indigo-400" />
            <input
              type="text"
              autoFocus
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Find identifier or text in current file..."
              className="w-full max-w-sm bg-transparent font-mono text-xs text-slate-200 placeholder:text-slate-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            {findQuery && (
              <span className="font-mono text-[11px] text-amber-300">
                {matchingLinesCount} matching lines
              </span>
            )}
            <button
              onClick={() => {
                setShowFind(false);
                setFindQuery("");
              }}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* AST Symbols Ribbon */}
      {file.symbols && file.symbols.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-[#080d19] px-4 py-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 shrink-0 font-semibold uppercase tracking-wider text-[10px] mr-1">
            <Layers className="h-3 w-3 text-indigo-400" /> AST Symbols ({file.symbols.length}):
          </span>
          {file.symbols.map((sym) => {
            const isSymActive =
              highlightRange &&
              highlightRange[0] <= sym.start_line &&
              highlightRange[1] >= sym.start_line;

            return (
              <button
                key={sym.id}
                onClick={() =>
                  onSelectSymbol && onSelectSymbol(sym.start_line, sym.end_line)
                }
                title={`${sym.signature} (Lines ${sym.start_line}-${sym.end_line})`}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md border px-2 py-0.5 shrink-0 font-mono text-[11px] transition-all",
                  isSymActive
                    ? "border-indigo-500 bg-indigo-500/20 text-white shadow-sm"
                    : "border-white/[0.06] bg-slate-900/80 text-slate-300 hover:border-indigo-500/40 hover:bg-slate-800 hover:text-white"
                )}
              >
                <span
                  className={cn(
                    "rounded px-1 py-0.2 text-[9px] font-bold uppercase border",
                    getSymbolBadgeStyle(sym.kind)
                  )}
                >
                  {sym.kind === "function"
                    ? "fn"
                    : sym.kind === "method"
                    ? "meth"
                    : sym.kind}
                </span>
                <span className="font-medium">{sym.name}</span>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-400">
                  :{sym.start_line}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Source Code Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto py-3 font-mono text-xs select-text"
      >
        <div className="min-w-full inline-block">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isHighlighted =
              highlightRange &&
              lineNum >= highlightRange[0] &&
              lineNum <= highlightRange[1];
            const isSearchMatch =
              findQuery.trim().length > 0 &&
              line.toLowerCase().includes(findQuery.trim().toLowerCase());

            return (
              <div
                key={lineNum}
                data-line={lineNum}
                className={cn(
                  "code-line px-2",
                  isHighlighted && "code-line-highlight",
                  !isHighlighted && isSearchMatch && "code-line-search-match"
                )}
              >
                <span className="code-line-number">{lineNum}</span>
                <span
                  className={cn(
                    "code-content flex-1 pr-6 text-slate-200",
                    wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                  )}
                >
                  {renderSyntaxHighlightedLine(line)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
