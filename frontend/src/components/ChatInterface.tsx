"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
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
} from "lucide-react";
import { ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  repoId: string;
  onCitationClick: (filePath: string, startLine: number, endLine: number) => void;
}

const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Welcome to **RepoLens Grounded Intelligence**. Ask any architectural or implementation question about this repository.\n\nEvery claim is backed by deterministic `[file:start-end]` source citations—click any citation badge to inspect the exact lines in the Code Viewer.",
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  repoId,
  onCitationClick,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
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

      // Check if [file:start-end] citation
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
            <FileCode2 className="h-3 w-3 text-blue-400 shrink-0" />
            <span>
              {shortName}:{startLine}
              {endLine !== startLine ? `-${endLine}` : ""}
            </span>
            <ExternalLink className="h-2.5 w-2.5 opacity-75 shrink-0" />
          </button>
        );
      }

      // Check if `inline code`
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code
            key={key}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-blue-200"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      // Check if **bold**
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={key} className="font-semibold text-white">
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
        <div className="flex items-center gap-2 py-1 text-xs text-slate-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
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
                className="overflow-hidden rounded-lg border border-slate-800 bg-[#0b0f17] my-2"
              >
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-1.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-slate-400">
                    <Terminal className="h-3 w-3 text-blue-400" />
                    {lang}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet(codeBody, segKey)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
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
                <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                  {codeBody}
                </pre>
              </div>
            );
          }

          return (
            <div key={segKey} className="whitespace-pre-wrap">
              {renderInlineWithCitations(segment, segKey)}
            </div>
          );
        })}
      </div>
    );
  };

  const sampleQueries = [
    {
      badge: "JWT Auth",
      question:
        "Where is JWT token verification implemented and what exception is thrown on expiration?",
    },
    {
      badge: "Scheduler",
      question:
        "How does the distributed scheduler handle retry backoff and concurrency limits?",
    },
    {
      badge: "RBAC Models",
      question:
        "How are user roles defined and how is administrative access verified?",
    },
  ];

  return (
    <div className="flex h-full flex-col bg-[#0f1623] border-l border-slate-800">
      {/* Copilot Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0b0f17] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-100">
                Grounded AI Copilot
              </span>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-emerald-300">
                Strict Citations
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetChat}
            disabled={streaming || messages.length <= 1}
            title="Start new conversation"
            className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-400 hover:border-slate-700 hover:text-white disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex flex-col gap-2 rounded-lg p-3.5 text-xs",
              msg.role === "user"
                ? "ml-6 bg-blue-950/35 border border-blue-500/30 text-slate-100"
                : "mr-2 bg-[#111827] border border-slate-800 text-slate-200"
            )}
          >
            {/* Message Role Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                {msg.role === "user" ? (
                  <>
                    <User className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-blue-200">Developer Query</span>
                  </>
                ) : (
                  <>
                    <Terminal className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-slate-300">RepoLens Intelligence</span>
                  </>
                )}
              </div>

              {msg.role === "assistant" && msg.content && (
                <div className="flex items-center gap-2">
                  {typeof msg.latency_ms === "number" && msg.latency_ms > 0 && (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      {msg.latency_ms}ms
                    </span>
                  )}
                  <button
                    onClick={() => handleCopyText(msg.content, idx)}
                    title="Copy response"
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
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

            {/* Verified Citations Shelf */}
            {msg.verified_citations && msg.verified_citations.length > 0 && (
              <div className="mt-2 pt-2.5 border-t border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-400 tracking-wider tabular-nums">
                    <ShieldCheck className="h-3 w-3" />
                    Verified Source Citations ({msg.verified_citations.length})
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
                      className="citation-pill"
                    >
                      <FileCode2 className="h-3 w-3 text-blue-400" />
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
              <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-amber-950/40 border border-amber-500/30 p-2.5 text-[11px] text-amber-200">
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
        <div className="px-4 py-3 border-t border-slate-800 bg-[#0b0f17]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Terminal className="h-3 w-3 text-blue-400" />
            Suggested Architecture Queries
          </span>
          <div className="space-y-1.5">
            {sampleQueries.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item.question)}
                className="group w-full flex items-start gap-2 text-left rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-[11px] text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white transition-colors"
              >
                <span className="shrink-0 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-blue-300 mt-0.5">
                  {item.badge}
                </span>
                <span className="line-clamp-2 leading-snug">{item.question}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Composer */}
      <div className="p-3 border-t border-slate-800 bg-[#0b0f17]">
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send question"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
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
