"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Check,
  Search,
  WrapText,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { FileDetail } from "@/lib/api";
import { cn, formatBytes, getSymbolBadgeStyle } from "@/lib/utils";

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
]);

const CODE_CONSTANTS = new Set([
  "True",
  "False",
  "None",
  "null",
  "undefined",
  "true",
  "false",
]);

/*
 * Syntax colours for a white ground, from the line palette:
 * keywords violet, strings green, numbers and constants orange,
 * comments faint italic, function and class names blue, the rest ink.
 */
const SYNTAX = {
  keyword: "text-line-violet",
  string: "text-line-green",
  constant: "text-line-orange",
  comment: "italic text-faint",
  name: "text-line-blue",
};

function renderSyntaxHighlightedLine(line: string): React.ReactNode {
  if (!line) return " ";
  const trimmed = line.trimStart();

  if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return <span className={SYNTAX.comment}>{line}</span>;
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
    let tone: string | null = null;

    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      tone = SYNTAX.string;
    } else if (CODE_CONSTANTS.has(token)) {
      tone = SYNTAX.constant;
    } else if (CODE_KEYWORDS.has(token)) {
      tone = SYNTAX.keyword;
    } else if (/^\d/.test(token)) {
      tone = SYNTAX.constant;
    } else if (/^[A-Z][A-Z0-9_]+$/.test(token)) {
      // ALL_CAPS identifiers read as constants.
      tone = SYNTAX.constant;
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      tone = SYNTAX.name;
    } else if (
      /^[A-Za-z_]/.test(token) &&
      line[tokenRegex.lastIndex] === "("
    ) {
      tone = SYNTAX.name;
    }

    if (tone) {
      parts.push(
        <span key={key} className={tone}>
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

function lineRangeLabel(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
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
  // Display only: whether the symbol list is unfolded.
  const [showSymbols, setShowSymbols] = useState(true);

  // Stable across renders until the range changes, so the effect below re-runs exactly
  // when it did before: on a new highlight range or a different file.
  const scrollToHighlightedLine = useCallback(() => {
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

  useEffect(() => {
    scrollToHighlightedLine();
  }, [scrollToHighlightedLine, file?.id]);

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
      <div className="flex h-full items-center justify-center bg-white p-8">
        <div className="max-w-[40ch]">
          <h2 className="text-xl font-bold text-ink">
            Pick a file, or ask a question
          </h2>
          <p className="mt-2 text-ink-2">
            Citations in an answer open the code here at the cited lines.
          </p>
        </div>
      </div>
    );
  }

  const pathSegments = file.file_path.split("/").filter(Boolean);
  const fileName = pathSegments[pathSegments.length - 1] ?? file.file_path;
  const dirPath =
    pathSegments.length > 1 ? `${pathSegments.slice(0, -1).join("/")}/` : "";
  const byteSize = new Blob([file.content]).size;
  const symbols = file.symbols ?? [];

  // Innermost symbol whose lines cover the whole highlighted range.
  let enclosingSymbol: FileDetail["symbols"][number] | null = null;
  if (highlightRange) {
    for (const sym of symbols) {
      if (sym.start_line <= highlightRange[0] && sym.end_line >= highlightRange[1]) {
        if (
          !enclosingSymbol ||
          sym.end_line - sym.start_line <=
            enclosingSymbol.end_line - enclosingSymbol.start_line
        ) {
          enclosingSymbol = sym;
        }
      }
    }
  }

  const copyLabel = highlightRange
    ? "Copy the highlighted lines"
    : "Copy the whole file";

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Guide words: where you are in the file */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-1.5">
        <div
          className="flex min-w-0 max-w-full font-mono text-sm font-bold"
          title={file.file_path}
        >
          {dirPath && <span className="min-w-0 truncate text-sub">{dirPath}</span>}
          <span className="shrink-0 text-ink">{fileName}</span>
        </div>

        {highlightRange && (
          <div className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
            <button
              type="button"
              onClick={scrollToHighlightedLine}
              title="Scroll to these lines"
              aria-label={`Scroll to ${lineRangeLabel(
                highlightRange[0],
                highlightRange[1]
              )}`}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-sm bg-signal px-2 font-semibold tabular-nums text-ink transition-colors duration-150 hover:bg-signal-deep active:bg-signal-deep"
            >
              {lineRangeLabel(highlightRange[0], highlightRange[1])}
            </button>
            {enclosingSymbol && (
              <span className="min-w-0 truncate text-sub">
                in{" "}
                <code className="font-semibold text-ink">
                  {enclosingSymbol.name}
                </code>
              </span>
            )}
            {onClearHighlight && (
              <button
                type="button"
                onClick={onClearHighlight}
                className="inline-flex h-7 shrink-0 cursor-pointer items-center px-1 font-semibold text-sub underline transition-colors duration-150 hover:text-ink active:text-ink"
              >
                Clear highlight
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-2 hidden text-[0.8125rem] tabular-nums text-sub sm:inline">
            {file.line_count.toLocaleString()}{" "}
            {file.line_count === 1 ? "line" : "lines"} · {formatBytes(byteSize)}
          </span>

          <button
            type="button"
            onClick={() => setShowFind((prev) => !prev)}
            title="Find in this file"
            aria-label="Find in this file"
            aria-pressed={showFind}
            className="btn-icon"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setWordWrap((prev) => !prev)}
            title="Wrap long lines"
            aria-label="Wrap long lines"
            aria-pressed={wordWrap}
            className="btn-icon"
          >
            <WrapText className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleCopyCode}
            title={copied ? "Copied" : copyLabel}
            aria-label={copyLabel}
            className="btn-icon"
          >
            {copied ? (
              <Check className="h-4 w-4 text-line-green" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <span role="status" className="sr-only">
            {copied ? "Copied" : ""}
          </span>
        </div>
      </div>

      {/* Find in file */}
      {showFind && (
        <div className="flex items-center gap-3 border-b border-rule bg-wash px-4 py-1.5">
          <input
            type="text"
            autoFocus
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find in this file"
            aria-label="Find in this file"
            className="field field-sm max-w-sm"
          />
          {findQuery && (
            <span
              role="status"
              className="shrink-0 text-[0.8125rem] tabular-nums text-sub"
            >
              {matchingLinesCount}{" "}
              {matchingLinesCount === 1 ? "matching line" : "matching lines"}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setShowFind(false);
              setFindQuery("");
            }}
            title="Close find"
            aria-label="Close find"
            className="btn-icon ml-auto shrink-0 hover:bg-sunk"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Symbols in this file */}
      {symbols.length > 0 && (
        <div className="border-b border-rule">
          <button
            type="button"
            onClick={() => setShowSymbols((prev) => !prev)}
            aria-expanded={showSymbols}
            className="flex h-7 w-full cursor-pointer items-center gap-1.5 px-4 text-left text-[0.8125rem] font-semibold text-ink transition-colors duration-150 hover:bg-wash active:bg-sunk focus-visible:outline-offset-[-2px]"
          >
            {showSymbols ? (
              <ChevronDown className="h-4 w-4 text-sub" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-sub" aria-hidden="true" />
            )}
            Symbols
            <span className="font-normal tabular-nums text-sub">
              {symbols.length}
            </span>
          </button>

          {showSymbols && (
            <ul className="max-h-40 overflow-y-auto border-t border-rule">
              {symbols.map((sym) => {
                const isSymActive =
                  highlightRange &&
                  highlightRange[0] <= sym.start_line &&
                  highlightRange[1] >= sym.start_line;

                return (
                  <li key={sym.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectSymbol &&
                        onSelectSymbol(sym.start_line, sym.end_line)
                      }
                      title={`${sym.signature} (lines ${sym.start_line}–${sym.end_line})`}
                      aria-current={isSymActive ? "true" : undefined}
                      className={cn(
                        "flex h-7 w-full cursor-pointer items-center gap-2.5 px-4 text-left transition-colors duration-150 focus-visible:outline-offset-[-2px]",
                        isSymActive
                          ? "bg-signal-soft"
                          : "hover:bg-wash active:bg-sunk"
                      )}
                    >
                      <span
                        className={cn(
                          "tag min-w-[4.5rem] shrink-0 justify-center",
                          getSymbolBadgeStyle(sym.kind)
                        )}
                      >
                        {sym.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink">
                        {sym.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-sub">
                        {sym.start_line}–{sym.end_line}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* The code */}
      <div
        ref={containerRef}
        className="flex-1 select-text overflow-auto bg-white py-2"
      >
        <div className="inline-block min-w-full">
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
                  title="Click to highlight this line. Shift-click to extend the range."
                  className="code-line-number"
                >
                  {lineNum}
                </span>
                <span
                  className={cn(
                    "code-content flex-1 pr-6 text-ink",
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
