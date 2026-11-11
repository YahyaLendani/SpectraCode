"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowRight, Check, Copy, RotateCcw } from "lucide-react";
import { ChatMessage } from "@/lib/api";
import { cn, assignLineColors, LINE_COLORS } from "@/lib/utils";
import { ExecutionTraceStepper, TraceStep } from "@/components/ExecutionTraceStepper";
import { Roundel } from "@/components/LineMap";

function extractTraceSteps(msg: ChatMessage): TraceStep[] {
  const steps: TraceStep[] = [];
  const seen = new Set<string>();

  if (msg.verified_citations && msg.verified_citations.length > 0) {
    for (const c of msg.verified_citations) {
      const key = `${c.file_path}:${c.start_line}-${c.end_line}`;
      if (!seen.has(key)) {
        seen.add(key);
        const parts = c.file_path.split("/");
        steps.push({
          stepNumber: steps.length + 1,
          filePath: c.file_path,
          shortName: parts[parts.length - 1],
          startLine: c.start_line,
          endLine: c.end_line,
        });
      }
    }
  }

  if (steps.length < 2 && msg.content) {
    const regex = /\[([a-zA-Z0-9_.\-/\\]+?\.[a-zA-Z0-9]+):(?:L?)(\d+)(?:-(?:L?)(\d+))?\]/g;
    let match;
    while ((match = regex.exec(msg.content)) !== null) {
      const filePath = match[1].replace(/\\/g, "/");
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;
      const key = `${filePath}:${startLine}-${endLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        const parts = filePath.split("/");
        steps.push({
          stepNumber: steps.length + 1,
          filePath,
          shortName: parts[parts.length - 1],
          startLine,
          endLine,
        });
      }
    }
  }

  return steps;
}

/* -------------------------------------------------------------------------
 * One numbering per answer. The stations in the text and the stops on the
 * route under it are read from the same list, so ② in a sentence is ② on
 * the route, in the same line colour.
 * ---------------------------------------------------------------------- */

// Values the backend's citation check sends in `status`.
const STATUS_CLAMPED = "clamped_to_bounds";
const STATUS_REJECTED = ["invalid_line_range", "hallucinated_file"];

interface CitationIndex {
  steps: TraceStep[];
  numbers: Map<string, number>;
  colors: Record<string, string>;
  statuses: Map<string, string>;
}

const citationKey = (filePath: string, startLine: number, endLine: number) =>
  `${filePath.replace(/\\/g, "/")}:${startLine}-${endLine}`;

// Message objects are replaced, never mutated, once they are in state, so
// the index can be kept per object. It also keeps `steps` stable for the route.
const citationIndexCache = new WeakMap<ChatMessage, CitationIndex>();

function getCitationIndex(msg: ChatMessage): CitationIndex {
  const cached = citationIndexCache.get(msg);
  if (cached) return cached;

  const steps = extractTraceSteps(msg);
  const numbers = new Map<string, number>();
  for (const s of steps) {
    numbers.set(citationKey(s.filePath, s.startLine, s.endLine), s.stepNumber);
  }

  // A marker in the prose that the route did not pick up joins the end of it.
  if (msg.content) {
    for (const segment of msg.content.split(/(```[\s\S]*?```)/g)) {
      if (!segment || (segment.startsWith("```") && segment.endsWith("```"))) continue;
      const regex = /\[([a-zA-Z0-9_.\-\/\\]+?\.[a-zA-Z0-9]+):(\d+)(?:-(\d+))?\]/g;
      let match;
      while ((match = regex.exec(segment)) !== null) {
        const filePath = match[1].replace(/\\/g, "/");
        const startLine = parseInt(match[2], 10);
        const endLine = match[3] ? parseInt(match[3], 10) : startLine;
        const key = citationKey(filePath, startLine, endLine);
        if (!numbers.has(key)) {
          const parts = filePath.split("/");
          steps.push({
            stepNumber: steps.length + 1,
            filePath,
            shortName: parts[parts.length - 1],
            startLine,
            endLine,
          });
          numbers.set(key, steps.length);
        }
      }
    }
  }

  const statuses = new Map<string, string>();
  for (const c of msg.verified_citations ?? []) {
    const key = citationKey(c.file_path, c.start_line, c.end_line);
    if (!statuses.has(key)) statuses.set(key, c.status);
  }

  const index: CitationIndex = {
    steps,
    numbers,
    // Same call the route makes, over the same list, so colours agree.
    colors: assignLineColors(steps.map((s) => s.filePath)),
    statuses,
  };
  citationIndexCache.set(msg, index);
  return index;
}

interface ChatInterfaceProps {
  repoId: string;
  onCitationClick: (filePath: string, startLine: number, endLine: number) => void;
}

// Kept as the first entry in `messages` so the empty-state checks stay as
// they were; it is shown as the empty state's sentence, not as an answer.
const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Type your own question below, or start with one of these.",
};

const ERROR_PREFIX = "Error generating response: ";

const StreamingMark: React.FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn(
      "station-now inline-block h-2.5 w-2.5 shrink-0 border border-ink bg-signal",
      className
    )}
  />
);

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  repoId,
  onCitationClick,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    INITIAL_ASSISTANT_MESSAGE,
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [copiedSnippetKey, setCopiedSnippetKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  // The question box grows with its text, up to its max height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [input]);

  const handleResetChat = () => {
    if (streaming) return;
    setConversationId(null);
    setMessages([INITIAL_ASSISTANT_MESSAGE]);
  };

  const handleCopyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgIdx(idx);
      setTimeout(() => setCopiedMsgIdx(null), 1600);
    } catch {
      // Ignore
    }
  };

  const handleCopySnippet = async (code: string, key: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSnippetKey(key);
      setTimeout(() => setCopiedSnippetKey(null), 1600);
    } catch {
      // Ignore
    }
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText ?? input).trim();
    if (!textToSend || streaming) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

    try {
      const response = await fetch(
        `${apiBase}/repositories/${repoId}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: textToSend,
            conversation_id: conversationId,
          }),
        }
      );

      if (!response.body) throw new Error("No response stream available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: "",
        verified_citations: [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (evt.startsWith("data: ")) {
            try {
              const payload = JSON.parse(evt.substring(6).trim());

              if (payload.type === "init") {
                setConversationId(payload.conversation_id);
              } else if (payload.type === "token") {
                assistantMsg.content += payload.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                });
              } else if (payload.type === "citations") {
                assistantMsg.verified_citations = payload.citations;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                });
              } else if (payload.type === "done") {
                assistantMsg.is_abstained = payload.is_abstained;
                assistantMsg.latency_ms = payload.latency_ms;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                });
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${ERROR_PREFIX}${
            err.message || "Failed to connect to SpectraCode API server"
          }`,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  // Renders inline text containing [file:start-end] citations, `inline code`, and **bold**
  const renderInlineWithCitations = (
    text: string,
    keyPrefix: string,
    index: CitationIndex
  ) => {
    const tokenPattern =
      /(\[[a-zA-Z0-9_.\-\/\\]+?\.[a-zA-Z0-9]+:\d+(?:-\d+)?\]|`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
    const parts = text.split(tokenPattern);

    return parts.map((part, idx) => {
      if (!part) return null;
      const key = `${keyPrefix}-${idx}`;

      const citMatch =
        /^\[([a-zA-Z0-9_.\-\/\\]+?\.[a-zA-Z0-9]+):(\d+)(?:-(\d+))?\]$/.exec(
          part
        );
      if (citMatch) {
        const filePath = citMatch[1];
        const startLine = parseInt(citMatch[2], 10);
        const endLine = citMatch[3] ? parseInt(citMatch[3], 10) : startLine;
        const shortName = filePath.split("/").pop() || filePath;
        const range =
          endLine !== startLine ? `${startLine}-${endLine}` : `${startLine}`;

        const citeKey = citationKey(filePath, startLine, endLine);
        const status = index.statuses.get(citeKey);

        // A citation the check rejected is named but cannot be opened.
        if (status && STATUS_REJECTED.includes(status)) {
          return (
            <span
              key={key}
              className="font-mono text-sm text-sub"
              title={`${filePath}:${range} could not be matched to the retrieved code`}
            >
              {shortName}:{range}
            </span>
          );
        }

        const n = index.numbers.get(citeKey);
        const color =
          index.colors[filePath.replace(/\\/g, "/")] ?? LINE_COLORS[0];
        const adjusted = status === STATUS_CLAMPED;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onCitationClick(filePath, startLine, endLine)}
            className="cite max-w-full"
            title={`${filePath}:${range}${
              adjusted ? " (lines adjusted to the retrieved code)" : ""
            }`}
            aria-label={`Citation ${n ?? ""}: ${filePath}, ${
              endLine !== startLine
                ? `lines ${startLine} to ${endLine}`
                : `line ${startLine}`
            }`}
          >
            <Roundel n={n ?? "?"} color={color} variant="solid" />
            <span className="truncate">
              {shortName}:{range}
            </span>
          </button>
        );
      }

      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code
            key={key}
            className="break-words rounded-sm border border-rule bg-wash px-1 font-mono text-sm text-ink"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={key} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }

      return <span key={key}>{part}</span>;
    });
  };

  // Renders full message with fenced code blocks + inline formatting + citations
  const renderMessageContent = (msg: ChatMessage, msgIdx: number) => {
    const content = msg.content;
    const isLast = msgIdx === messages.length - 1;

    if (!content) {
      if (streaming && isLast) {
        return (
          <p role="status" className="flex items-center gap-2 text-sm text-sub">
            <StreamingMark />
            <span>Reading the code</span>
          </p>
        );
      }
      return (
        <p role="alert" className="note note-error">
          No answer came back. Check that the backend is running and try again.
        </p>
      );
    }

    const index = getCitationIndex(msg);
    const segments = content.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-3 text-base leading-relaxed text-ink-2">
        {segments.map((segment, sIdx) => {
          if (!segment) return null;
          const segKey = `msg-${msgIdx}-seg-${sIdx}`;

          if (segment.startsWith("```") && segment.endsWith("```")) {
            const rawInner = segment.slice(3, -3);
            const firstNewline = rawInner.indexOf("\n");
            const lang =
              firstNewline !== -1
                ? rawInner.slice(0, firstNewline).trim() || "code"
                : "code";
            const codeBody =
              firstNewline !== -1
                ? rawInner.slice(firstNewline + 1).replace(/\n$/, "")
                : rawInner;
            const copied = copiedSnippetKey === segKey;

            return (
              <div key={segKey} className="rounded border border-rule bg-wash">
                <div className="flex items-center justify-between gap-2 pl-3 pr-1 pt-1">
                  <span className="font-mono text-xs text-sub">
                    {lang !== "code" ? lang : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet(codeBody, segKey)}
                    title={copied ? "Copied" : "Copy code"}
                    aria-label={copied ? "Copied" : "Copy code"}
                    className="btn-icon h-7 w-7 hover:bg-sunk"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-line-green" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto px-3 pb-3 font-mono text-[0.8125rem] leading-relaxed text-ink">
                  {codeBody}
                </pre>
              </div>
            );
          }

          return (
            <div key={segKey} className="whitespace-pre-wrap break-words">
              {renderInlineWithCitations(segment, segKey, index)}
              {streaming && isLast && sIdx === segments.length - 1 && (
                <StreamingMark className="ml-1.5" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Citations whose line range the check moved to fit the retrieved code.
  const renderAdjustedNote = (msg: ChatMessage) => {
    if (!msg.verified_citations || msg.verified_citations.length === 0) return null;
    const index = getCitationIndex(msg);
    const seen = new Set<number>();
    const adjusted: { n: number; color: string }[] = [];
    for (const c of msg.verified_citations) {
      if (c.status !== STATUS_CLAMPED) continue;
      const n = index.numbers.get(citationKey(c.file_path, c.start_line, c.end_line));
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      adjusted.push({
        n,
        color: index.colors[c.file_path.replace(/\\/g, "/")] ?? LINE_COLORS[0],
      });
    }
    if (adjusted.length === 0) return null;

    return (
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-sub">
        <span className="sr-only">
          {adjusted.length === 1 ? "Citation" : "Citations"}{" "}
          {adjusted.map((a) => a.n).join(", ")}:
        </span>
        {adjusted.map((a) => (
          <Roundel key={a.n} n={a.n} color={a.color} variant="solid" />
        ))}
        <span>lines adjusted to the retrieved code</span>
      </p>
    );
  };

  // The benchmark questions the sample repository is known to answer.
  const sampleQueries = [
    "Where is JWT token verification implemented and what exception is thrown on expiration?",
    "How does the distributed scheduler handle retry backoff and concurrency limits?",
    "How are user roles defined and how is administrative access verified?",
  ];

  return (
    <div className="flex h-full flex-col border-l border-rule bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold leading-tight text-ink">Ask</h2>
          <p className="mt-0.5 text-sm text-sub">
            Answers cite the file and lines they come from.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetChat}
          disabled={streaming || messages.length <= 1}
          title="Start a new conversation"
          aria-label="Start a new conversation"
          className="btn-icon shrink-0"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 1 && (
          <div>
            <h3 className="text-lg font-bold text-ink">Ask about this repository</h3>
            <p className="mt-1 text-sm text-sub">{INITIAL_ASSISTANT_MESSAGE.content}</p>
            <ul className="mt-3">
              {sampleQueries.map((question, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => handleSend(question)}
                    className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 border-b border-rule px-2 py-2.5 text-left text-sm text-ink transition-colors duration-150 hover:bg-wash active:bg-sunk"
                  >
                    <span>{question}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-sub" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg === INITIAL_ASSISTANT_MESSAGE) return null;

          if (msg.role === "user") {
            return (
              <h3
                key={idx}
                className={cn(
                  "whitespace-pre-wrap break-words text-base font-bold text-ink",
                  idx > 1 && "mt-5 border-t border-rule pt-4"
                )}
              >
                {msg.content}
              </h3>
            );
          }

          if (msg.content.startsWith(ERROR_PREFIX)) {
            return (
              <div key={idx} role="alert" className="note note-error mt-3">
                <p>
                  The answer could not be generated. Check that the backend is
                  running and try again.
                </p>
                <p className="mt-1 text-xs">
                  Reported error: {msg.content.slice(ERROR_PREFIX.length)}
                </p>
              </div>
            );
          }

          return (
            <div key={idx} className="mt-2">
              {msg.is_abstained && (
                <p className="note note-warn mb-3">
                  The repository does not contain enough to answer this.
                </p>
              )}

              {renderMessageContent(msg, idx)}

              {renderAdjustedNote(msg)}

              {msg.content && (
                <div className="mt-1 flex min-h-8 items-center justify-between gap-2 text-xs tabular-nums text-sub">
                  <span>
                    {typeof msg.latency_ms === "number" && msg.latency_ms > 0
                      ? `answered in ${(msg.latency_ms / 1000).toFixed(1)} s`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(msg.content, idx)}
                    title={copiedMsgIdx === idx ? "Copied" : "Copy answer"}
                    aria-label={copiedMsgIdx === idx ? "Copied" : "Copy answer"}
                    className="btn-icon -mr-2"
                  >
                    {copiedMsgIdx === idx ? (
                      <Check className="h-4 w-4 text-line-green" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              )}

              {/* Route through the cited spans; numbered as in the text above */}
              {!streaming && (
                <ExecutionTraceStepper
                  steps={getCitationIndex(msg).steps}
                  onCitationClick={onCitationClick}
                />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-end gap-2 border-t-[3px] border-ink p-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Ask how something works, or where it lives"
          aria-label="Question about this repository"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={streaming}
          className="field h-auto max-h-40 min-h-[44px] flex-1 resize-none py-2.5 leading-6"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="btn btn-primary h-11 shrink-0"
        >
          Ask
        </button>
      </form>
    </div>
  );
};
