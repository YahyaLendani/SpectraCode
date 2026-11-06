"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  RotateCcw,
  FileCode2,
  Terminal,
  ArrowUpRight,
} from "lucide-react";
import { ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ExecutionTraceStepper, TraceStep } from "@/components/ExecutionTraceStepper";

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

interface ChatInterfaceProps {
  repoId: string;
  onCitationClick: (filePath: string, startLine: number, endLine: number) => void;
}

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Ask any architectural or implementation question about this repository.\n\nEvery claim is backed by deterministic `[file:start-end]` source citations—click any citation badge to inspect the exact lines in the Code Viewer.",
};

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

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
          content: `Error generating response: ${
            err.message || "Failed to connect to RepoLens API server"
          }`,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  // Renders inline text containing [file:start-end] citations, `inline code`, and **bold**
  const renderInlineWithCitations = (text: string, keyPrefix: string) => {
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

        return (
          <button
            key={key}
            type="button"
            onClick={() => onCitationClick(filePath, startLine, endLine)}
            className="citation-pill"
            title={`Jump to ${filePath} (Lines ${startLine}–${endLine})`}
          >
            <FileCode2 className="h-3 w-3 text-zinc-400 shrink-0" />
            <span>
              {shortName}:{startLine}
              {endLine !== startLine ? `-${endLine}` : ""}
            </span>
            <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />
          </button>
        );
      }

      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code
            key={key}
            className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={key} className="font-semibold text-zinc-50">
            {part.slice(2, -2)}
          </strong>
        );
      }

      return <span key={key}>{part}</span>;
    });
  };

  // Renders full message with fenced code blocks + inline formatting + citations
  const renderMessageContent = (content: string, msgIdx: number) => {
    if (!content) {
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-zinc-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          <span>Retrieving AST spans &amp; verifying line citations...</span>
        </div>
      );
    }

    const segments = content.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-2.5 text-xs leading-relaxed">
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

            return (
              <div
                key={segKey}
                className="overflow-hidden rounded border border-white/[0.08] bg-[#0c0c0e] my-2"
              >
                <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#111113] px-3 py-1.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-zinc-400">
                    <Terminal className="h-3 w-3 text-zinc-400" />
                    {lang}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet(codeBody, segKey)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 transition-colors"
                  >
                    {copiedSnippetKey === segKey ? (
                      <>
                        <Check className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-2.5 w-2.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-200">
                  {codeBody}
                </pre>
              </div>
            );
          }

          const isLast = msgIdx === messages.length - 1;
          return (
            <div key={segKey} className="whitespace-pre-wrap">
              {renderInlineWithCitations(segment, segKey)}
              {streaming && isLast && sIdx === segments.length - 1 && (
                <span className="inline-block w-1.5 h-3.5 bg-zinc-300 ml-1 rounded-xs animate-pulse align-middle" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const sampleQueries = [
    {
      tag: "auth/jwt",
      question:
        "Where is JWT token verification implemented and what exception is thrown on expiration?",
    },
    {
      tag: "scheduler",
      question:
        "How does the distributed scheduler handle retry backoff and concurrency limits?",
    },
    {
      tag: "models/rbac",
      question:
        "How are user roles defined and how is administrative access verified?",
    },
  ];

  return (
    <div className="flex h-full flex-col bg-[#09090b] border-l border-white/[0.07]">
      {/* Query Inspector Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#0c0c0e] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-100 font-mono tracking-tight">
            Query Inspector
          </span>
          <span className="rounded border border-white/[0.08] bg-[#111113] px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
            Strict [file:L-L]
          </span>
        </div>

        <button
          onClick={handleResetChat}
          disabled={streaming || messages.length <= 1}
          title="Start new conversation"
          aria-label="Start new conversation"
          className="cursor-pointer flex items-center gap-1 rounded border border-white/[0.08] bg-[#111113] px-2 py-1 text-[10px] font-medium text-zinc-400 hover:border-white/[0.16] hover:text-zinc-100 disabled:opacity-40 transition-colors focus-visible:ring-1 focus-visible:ring-zinc-400"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex flex-col gap-2 rounded border p-3.5 text-xs transition-colors",
              msg.role === "user"
                ? "bg-[#0c0c0e] border-white/[0.08] text-zinc-100"
                : "bg-[#111113] border-white/[0.08] text-zinc-200"
            )}
          >
            {/* Message Role Header */}
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/[0.05]">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                {msg.role === "user" ? (
                  "QUERY"
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    VERIFIED GROUNDED OUTPUT
                  </>
                )}
              </span>

              {msg.role === "assistant" && msg.content && (
                <div className="flex items-center gap-2">
                  {typeof msg.latency_ms === "number" && msg.latency_ms > 0 && (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      {msg.latency_ms}ms
                    </span>
                  )}
                  <button
                    onClick={() => handleCopyText(msg.content, idx)}
                    title="Copy response"
                    aria-label="Copy assistant response text"
                    className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 transition-colors"
                  >
                    {copiedMsgIdx === idx ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Body */}
            {renderMessageContent(msg.content, idx)}

            {/* Interactive Multi-Hop Trace Stepper */}
            {msg.role === "assistant" && !streaming && (
              <ExecutionTraceStepper
                steps={extractTraceSteps(msg)}
                onCitationClick={onCitationClick}
              />
            )}

            {/* Verified Citations Shelf */}
            {msg.verified_citations && msg.verified_citations.length > 0 && (
              <div className="mt-1.5 pt-2.5 border-t border-white/[0.07]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-zinc-300 tabular-nums">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" />
                    VERIFIED SOURCE SPANS ({msg.verified_citations.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {msg.verified_citations.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        onCitationClick(c.file_path, c.start_line, c.end_line)
                      }
                      title={`Jump to ${c.file_path} lines ${c.start_line}-${c.end_line}`}
                      aria-label={`Jump to file ${c.file_path} lines ${c.start_line} through ${c.end_line}`}
                      className="citation-pill cursor-pointer"
                    >
                      <FileCode2 className="h-3 w-3 text-zinc-400" />
                      <span>
                        {c.file_path}:{c.start_line}-{c.end_line}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Abstention Warning */}
            {msg.is_abstained && (
              <div className="mt-1.5 flex items-center gap-2 rounded border border-amber-500/25 bg-amber-500/[0.05] p-2.5 text-[11px] text-amber-200/90">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  Grounding Gate Abstained: Insufficient evidence in indexed repository chunks to verify claims.
                </span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Curated Starter Prompts */}
      {messages.length === 1 && (
        <div className="px-3.5 py-3 border-t border-white/[0.07] bg-[#0c0c0e]">
          <div className="font-mono text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
            Suggested Queries
          </div>
          <div className="space-y-1.5">
            {sampleQueries.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item.question)}
                aria-label={`Ask: ${item.question}`}
                className="cursor-pointer group w-full flex items-center justify-between gap-2 text-left rounded border border-white/[0.07] bg-[#111113] hover:bg-[#16161a] hover:border-white/[0.14] px-3 py-2 text-[11px] text-zinc-300 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="block font-mono text-[10px] text-zinc-400">
                    [{item.tag}]
                  </span>
                  <span className="block line-clamp-2 leading-snug text-zinc-200">
                    {item.question}
                  </span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-300 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Composer */}
      <div className="p-3 border-t border-white/[0.07] bg-[#0c0c0e]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask about functions, classes, or architecture..."
            aria-label="Ask about codebase functions, classes, or architecture"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            className="flex-1 rounded border border-white/[0.08] bg-[#111113] px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-white/[0.24] focus:outline-none disabled:opacity-50 transition-colors font-mono"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send question"
            className="cursor-pointer flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-30 transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            {streaming ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
