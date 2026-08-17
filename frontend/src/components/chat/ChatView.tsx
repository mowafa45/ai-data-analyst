"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, BarChart2, AlertCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { streamChatMessage, sendChatMessage } from "@/lib/api";
import { ChartWidget } from "@/components/dashboard/ChartWidget";
import { cn, uid, formatPercent } from "@/lib/utils";
import type { ChatMessage } from "@/types";

const SUGGESTED_QUESTIONS = [
  "Why did revenue change?",
  "Show top-performing products",
  "Which region underperforms?",
  "Find anomalies in the data",
  "Predict next month's revenue",
  "Who are the top customers?",
  "Compare categories by profit",
  "What drives profit margin?",
];

export function ChatView() {
  const { sessionId, meta, chatHistory, addMessage, updateLastMessage } = useStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !sessionId || isLoading) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      // Placeholder streaming message
      const aiId = uid();
      const aiMsg: ChatMessage = {
        id: aiId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
      addMessage(aiMsg);
      setIsLoading(true);

      try {
        let accumulated = "";

        const history = chatHistory.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }));

        await streamChatMessage(
          { session_id: sessionId, message: text.trim(), history },
          (delta) => {
            accumulated += delta;
            updateLastMessage({ content: accumulated, isStreaming: true });
          },
          (meta) => {
            updateLastMessage({
              isStreaming: false,
              artifacts: meta.artifacts,
              confidence: meta.confidence,
              columns_used: meta.columns_used,
              rows_analyzed: meta.rows_analyzed,
              follow_up_suggestions: meta.follow_up_suggestions,
            });
          },
          (errMsg) => {
            updateLastMessage({
              content: errMsg,
              isStreaming: false,
            });
          }
        );
      } catch {
        // Fall back to non-streaming
        try {
          const history = chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }));
          const res = await sendChatMessage({
            session_id: sessionId,
            message: text.trim(),
            history,
          });
          updateLastMessage({
            content: res.message,
            isStreaming: false,
            artifacts: res.artifacts,
            confidence: res.confidence,
            columns_used: res.columns_used,
            rows_analyzed: res.rows_analyzed,
            follow_up_suggestions: res.follow_up_suggestions,
          });
        } catch (fallbackErr: unknown) {
          updateLastMessage({
            content: fallbackErr instanceof Error
              ? fallbackErr.message
              : "Analysis failed. Please try again.",
            isStreaming: false,
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, isLoading, chatHistory, addMessage, updateLastMessage]
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome */}
        {chatHistory.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div>
              <div className="card px-4 py-3 text-[13px] leading-relaxed text-white max-w-xl">
                <p className="mb-2">
                  Hello! I've analysed your{" "}
                  <span className="text-accent-300 font-medium">{meta?.filename}</span>{" "}
                  — {meta?.row_count.toLocaleString()} rows across{" "}
                  {meta?.col_count} columns.
                </p>
                <p className="text-muted">
                  Ask me anything about your data. I remember the full conversation, so
                  follow-up questions work naturally.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {chatHistory.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onFollowUp={sendMessage} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions (only when no history) */}
      {chatHistory.length === 0 && (
        <div className="px-4 pb-2">
          <div className="text-[10px] text-muted mb-2">Suggested questions</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-accent-500/50 hover:text-accent-300 text-muted transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 p-4 pt-2 border-t border-border bg-surface-1">
        <div
          className={cn(
            "flex gap-2 items-end bg-surface-2 border rounded-xl px-3 py-2 transition-all duration-200",
            isLoading ? "border-border" : "border-border-strong focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/10"
          )}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKey}
            placeholder={meta ? `Ask about ${meta.filename}…` : "Upload a file to start…"}
            disabled={!sessionId || isLoading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-white placeholder:text-muted/50 resize-none leading-relaxed disabled:cursor-not-allowed"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !sessionId || isLoading}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-500 to-purple-500 flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
        <div className="text-[10px] text-muted/50 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · AI remembers your full conversation
        </div>
      </div>
    </div>
  );
}


// ── Single message bubble ───────────────────────────────────────────────────────
function MessageBubble({
  msg,
  onFollowUp,
}: {
  msg: ChatMessage;
  onFollowUp: (q: string) => void;
}) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold mt-0.5",
          isUser
            ? "bg-surface-3 border border-border text-muted"
            : "bg-gradient-to-br from-accent-500 to-purple-500 text-white"
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>

      <div className={cn("flex-1 min-w-0", isUser && "flex flex-col items-end")}>
        {/* Bubble */}
        <div
          className={cn(
            "px-4 py-3 rounded-2xl text-[13px] leading-relaxed max-w-2xl",
            isUser
              ? "bg-accent-500/20 border border-accent-500/30 text-white rounded-tr-sm"
              : "card text-white rounded-tl-sm"
          )}
        >
          {msg.isStreaming && !msg.content ? (
            <TypingDots />
          ) : (
            <FormattedText content={msg.content} />
          )}
          {msg.isStreaming && msg.content && (
            <span className="inline-block w-0.5 h-3.5 bg-accent-400 ml-0.5 animate-pulse" />
          )}
        </div>

        {/* Artifacts (charts) */}
        {msg.artifacts && msg.artifacts.length > 0 && (
          <div className="mt-2 space-y-2 w-full max-w-2xl">
            {msg.artifacts.map((artifact, i) =>
              artifact.artifact_type === "chart" && artifact.chart_data ? (
                <ChartWidget key={i} chart={artifact.chart_data} height={140} />
              ) : null
            )}
          </div>
        )}

        {/* Meta */}
        {!isUser && !msg.isStreaming && (msg.confidence || msg.rows_analyzed) && (
          <div className="flex items-center flex-wrap gap-2 mt-1.5">
            {msg.confidence && (
              <span className="tag tag-purple text-[10px]">
                {Math.round(msg.confidence * 100)}% confidence
              </span>
            )}
            {msg.rows_analyzed ? (
              <span className="text-[10px] text-muted">
                {msg.rows_analyzed.toLocaleString()} rows analysed
              </span>
            ) : null}
            {msg.columns_used && msg.columns_used.length > 0 && (
              <span className="text-[10px] text-muted">
                Columns: {msg.columns_used.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* Follow-ups */}
        {!isUser && !msg.isStreaming && (msg.follow_up_suggestions?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {msg.follow_up_suggestions!.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(q)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-accent-500/50 hover:text-accent-300 text-muted transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}


// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}


// ── Formatted text (supports **bold** and newlines) ────────────────────────────
function FormattedText({ content }: { content: string }) {
  const parts = content.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>
            {part.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        )
      )}
    </span>
  );
}
