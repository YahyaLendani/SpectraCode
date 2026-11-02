"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { ChatMessage, VerifiedCitation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  repoId: string;
  onCitationClick: (filePath: string, startLine: number, endLine: number) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  repoId,
  onCitationClick,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm RepoLens. Ask me any question about the architecture, functions, or implementation of this codebase. Every response includes verified file and line citations you can click to inspect.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input.trim();
    if (!textToSend || streaming) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/v1/repositories/${repoId}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: textToSend,
            conversation_id: conversationId,
          }),
        }
      );

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let assistantMsg: ChatMessage = {
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
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.substring(6).trim());

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
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...assistantMsg };
                  return updated;
                });
              }
            } catch (err) {
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
          content: `Error generating response: ${err.message || "Failed to connect to backend server"}`,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  // Parses markdown text and turns [file:start-end] into clickable pills
  const renderMessageContent = (content: string) => {
    const citationRegex = /\[([a-zA-Z0-9_.\-\/\\]+?\.[a-zA-Z0-9]+):(\d+)(?:-(\d+))?\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(content)) !== null) {
      const preceding = content.substring(lastIndex, match.index);
      if (preceding) parts.push(preceding);

      const filePath = match[1];
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;

      parts.push(
        <button
          key={`${filePath}-${startLine}-${match.index}`}
          onClick={() => onCitationClick(filePath, startLine, endLine)}
          className="citation-pill"
          title={`Click to view ${filePath} (lines ${startLine}-${endLine})`}
        >
          <span>{filePath.split("/").pop()}:{startLine}-{endLine}</span>
          <ExternalLink className="h-2.5 w-2.5 inline" />
        </button>
      );

      lastIndex = citationRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed text-xs">
        {parts.map((p, idx) => (typeof p === "string" ? <span key={idx}>{p}</span> : p))}
      </div>
    );
  };

  const sampleQueries = [
    "Where is JWT token verification implemented and what exception is thrown on expiration?",
    "How does the distributed scheduler handle retry backoff and concurrency limits?",
    "How are user roles defined and how is administrative access verified?",
  ];

  return (
    <div className="flex h-full flex-col bg-slate-900 border-l border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-200">Grounded Code Intelligence</span>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-full font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Streaming
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl p-3.5 text-xs transition-all",
              msg.role === "user"
                ? "ml-8 bg-indigo-600/20 border border-indigo-500/30 text-indigo-100"
                : "mr-4 bg-slate-950/80 border border-slate-800 text-slate-200"
            )}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-1">
              {msg.role === "user" ? (
                <>
                  <User className="h-3.5 w-3.5 text-indigo-400" />
                  <span>You</span>
                </>
              ) : (
                <>
                  <Bot className="h-3.5 w-3.5 text-indigo-400" />
                  <span>RepoLens Assistant</span>
                </>
              )}
            </div>

            {renderMessageContent(msg.content)}

            {/* Citations Footer */}
            {msg.verified_citations && msg.verified_citations.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1.5">
                  Verified Code Citations ({msg.verified_citations.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {msg.verified_citations.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => onCitationClick(c.file_path, c.start_line, c.end_line)}
                      className="citation-pill"
                    >
                      {c.file_path}:{c.start_line}-{c.end_line}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msg.is_abstained && (
              <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-950/40 border border-amber-800/40 p-2 text-[11px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Answer abstained: claims could not be verified in indexed repository bounds.</span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Queries */}
      {messages.length === 1 && (
        <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/40">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
            Suggested Benchmark Questions:
          </span>
          <div className="space-y-1">
            {sampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="w-full text-left rounded border border-slate-800 bg-slate-900/60 p-1.5 text-[11px] text-slate-300 hover:border-indigo-500 hover:text-white transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 border-t border-slate-800 bg-slate-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask a technical question about the codebase..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
          >
            {streaming ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
