"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  FileText,
  Layers,
  Copy,
  Check,
  Search,
  WrapText,
  ChevronRight,
  X,
  Crosshair,
} from "lucide-react";
import { FileDetail } from "@/lib/api";
import { cn, formatBytes, getLanguageColor } from "@/lib/utils";

interface CodeViewerProps {
  file: FileDetail | null;
  highlightRange?: [number, number] | null;
  onSelectSymbol?: (startLine: number, endLine?: number) => void;
  onClearHighlight?: () => void;
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

  if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return <span className="text-zinc-500 italic">{line}</span>;
  }

  if (trimmed.startsWith("@")) {
    return <span className="text-amber-300/90 font-medium">{line}</span>;
  }

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
        <span key={key} className="text-emerald-300/95">
          {token}
        </span>
      );
    } else if (CODE_KEYWORDS.has(token)) {
      parts.push(
        <span key={key} className="text-blue-300 font-semibold">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key} className="text-amber-300/90">
          {token}
        </span>
      );
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      parts.push(
        <span key={key} className="text-sky-300">
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

function getSymbolKindColor(kind: string): string {
  switch ((kind || "").toLowerCase()) {
    case "class":
    case "interface":
      return "text-amber-400";
    case "function":
      return "text-blue-400";
    case "method":
      return "text-sky-400";
    default:
      return "text-zinc-400";
  }
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  file,
  highlightRange,
  onSelectSymbol,
  onClearHighlight,
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

  const handleLineNumberClick = (lineNum: number, shiftKey: boolean) => {
    if (!onSelectSymbol) return;
    if (shiftKey && highlightRange) {
      const anchor = highlightRange[0];
      const start = Math.min(anchor, lineNum);
      const end = Math.max(anchor, lineNum);
      onSelectSymbol(start, end);
    } else {
      onSelectSymbol(lineNum, lineNum);
    }
  };

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black p-8 text-center">
        <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] bg-[#0a0e17] text-blue-400">
          <Code2 className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-white font-mono">
          Select a source file to inspect AST boundaries
        </h3>
        <p className="mt-1.5 max-w-sm text-xs text-slate-300 leading-relaxed">
          Choose any file from the left repository tree or click a verified{" "}
          <code className="font-mono text-blue-300">[file:start-end]</code> citation badge in the AI chat to jump directly to exact source lines.
        </p>
      </div>
    );
  }

  const pathSegments = file.file_path.split("/").filter(Boolean);
  const byteSize = new Blob([file.content]).size;

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Top IDE File Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#06080d] px-4 py-2">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <div className="flex items-center gap-1 font-mono text-xs text-slate-400 truncate">
            {pathSegments.map((seg, i) => {
              const isLast = i === pathSegments.length - 1;
              return (
                <React.Fragment key={`${seg}-${i}`}>
                  <span
                    className={cn(
                      "truncate",
                      isLast ? "font-semibold text-white" : "text-slate-400"
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

          <span className="hidden sm:inline-block font-mono text-[11px] text-slate-400 pl-1 shrink-0 tabular-nums">
            {file.line_count} lines · {formatBytes(byteSize)}
          </span>
        </div>

        {/* Right Toolbar & Citation Beacon */}
        <div className="flex items-center gap-1.5">
          {highlightRange && (
            <div className="flex items-center rounded-md border border-blue-500/40 bg-blue-500/15 text-blue-200 font-mono text-[11px] tabular-nums">
              <button
                onClick={scrollToHighlightedLine}
                title="Click to center highlighted citation span"
                aria-label={`Center highlighted citation span lines ${highlightRange[0]} through ${highlightRange[1]}`}
                className="cursor-pointer flex items-center gap-1.5 px-2 py-0.5 hover:text-white transition-colors"
              >
                <Crosshair className="h-3 w-3 text-blue-400" />
                <span className="font-medium">
                  L{highlightRange[0]}–L{highlightRange[1]}
                </span>
              </button>
              {onClearHighlight && (
                <button
                  onClick={onClearHighlight}
                  title="Clear line highlight"
                  aria-label="Clear line highlight"
                  className="cursor-pointer border-l border-blue-500/25 px-1.5 py-0.5 text-blue-300/70 hover:text-white transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* In-File Search Toggle */}
          <button
            onClick={() => setShowFind((prev) => !prev)}
            title="Find in file"
            aria-label="Find in file"
            className={cn(
              "cursor-pointer flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500",
              showFind
                ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                : "border-white/[0.1] bg-[#0a0e17] text-slate-400 hover:border-white/[0.2] hover:text-slate-200"
            )}
          >
            <Search className="h-3 w-3" />
            <span className="hidden md:inline">Find</span>
          </button>

          {/* Word Wrap Toggle */}
          <button
            onClick={() => setWordWrap((prev) => !prev)}
            title="Toggle line wrap"
            aria-label="Toggle word wrap"
            aria-pressed={wordWrap}
            className={cn(
              "cursor-pointer flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:ring-1 focus-visible:ring-blue-500",
              wordWrap
                ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                : "border-white/[0.1] bg-[#0a0e17] text-slate-400 hover:border-white/[0.2] hover:text-slate-200"
            )}
          >
            <WrapText className="h-3 w-3" />
          </button>

          {/* Copy Code / Span Button */}
          <button
            onClick={handleCopyCode}
            aria-label={highlightRange ? "Copy highlighted code span" : "Copy full file content"}
            className="cursor-pointer flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0a0e17] hover:border-white/[0.2] hover:text-white px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors focus-visible:ring-1 focus-visible:ring-blue-500"
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
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-[#11151f] px-4 py-1.5">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-3.5 w-3.5 text-blue-400" />
            <input
              type="text"
              autoFocus
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Find identifier or text in current file..."
              className="w-full max-w-sm bg-transparent font-mono text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            {findQuery && (
              <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                {matchingLinesCount} matching lines
              </span>
            )}
            <button
              onClick={() => {
                setShowFind(false);
                setFindQuery("");
              }}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Clean Single-Layer AST Symbols Outline Ribbon */}
      {file.symbols && file.symbols.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-white/[0.07] bg-[#0b0e15] px-4 py-1.5 overflow-x-auto text-[11px]">
          <span className="text-zinc-500 flex items-center gap-1 shrink-0 font-semibold uppercase tracking-wider text-[10px] mr-1 tabular-nums">
            <Layers className="h-3 w-3 text-blue-400" />
            <span>AST ({file.symbols.length})</span>
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
                title={`${sym.signature} (Lines ${sym.start_line}–${sym.end_line})`}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md border px-2 py-0.5 shrink-0 font-mono text-[11px] transition-colors tabular-nums",
                  isSymActive
                    ? "border-blue-500/50 bg-blue-500/15 text-zinc-100"
                    : "border-white/[0.07] bg-[#11151f] text-zinc-300 hover:border-white/[0.15] hover:text-zinc-100"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-semibold lowercase",
                    getSymbolKindColor(sym.kind)
                  )}
                >
                  {sym.kind === "function"
                    ? "fn"
                    : sym.kind === "method"
                    ? "def"
                    : sym.kind}
                </span>
                <span className="font-medium">{sym.name}</span>
                <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">
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
                <span
                  onClick={(e) => handleLineNumberClick(lineNum, e.shiftKey)}
                  title="Click to highlight line (Shift+Click for range)"
                  className="code-line-number"
                >
                  {lineNum}
                </span>
                <span
                  className={cn(
                    "code-content flex-1 pr-6 text-zinc-200",
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
