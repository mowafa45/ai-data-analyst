"use client";

import { motion } from "framer-motion";
import {
  LayoutDashboard, MessageSquare, Database,
  TrendingUp, FileDown, FileSpreadsheet, Settings,
  Upload, Sun, Moon, Zap,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { exportReport } from "@/lib/api";
import { cn, formatFileSize } from "@/lib/utils";
import type { AppPanel } from "@/types";
import toast from "react-hot-toast";

interface NavItem {
  id: AppPanel | "export-pdf" | "export-excel";
  label: string;
  icon: React.ReactNode;
  badge?: number;
  requiresSession?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard",    icon: <LayoutDashboard size={16} />, requiresSession: true },
  { id: "chat",      label: "AI Chat",      icon: <MessageSquare size={16} />,   requiresSession: true },
  { id: "data",      label: "Data Preview", icon: <Database size={16} />,        requiresSession: true },
  { id: "forecast",  label: "Forecasting",  icon: <TrendingUp size={16} />,      requiresSession: true },
];

const EXPORT_ITEMS = [
  { id: "pdf",   label: "Export PDF",   icon: <FileDown size={16} /> },
  { id: "excel", label: "Export Excel", icon: <FileSpreadsheet size={16} /> },
];

export function Sidebar() {
  const { activePanel, sessionId, meta, setPanel, clearSession, theme, toggleTheme, chatHistory } = useStore();

  const handleNav = (id: string) => {
    if (id.startsWith("export-")) return;
    setPanel(id as AppPanel);
  };

  const handleExport = async (format: "pdf" | "excel" | "csv") => {
    if (!sessionId) return;
    try {
      await exportReport(sessionId, format);
      toast.success(`${format.toUpperCase()} exported!`);
    } catch {
      toast.error("Export failed. Please try again.");
    }
  };

  const unreadMsgs = chatHistory.filter((m) => m.role === "assistant").length;

  return (
    <aside className="w-[220px] flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-purple-500 flex items-center justify-center text-base flex-shrink-0">
          📊
        </div>
        <div>
          <div className="text-sm font-semibold text-white">DataAI</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">AI Analyst</div>
        </div>
      </div>

      {/* Upload button */}
      <div className="px-3 py-3 border-b border-border">
        <button
          onClick={() => setPanel("upload")}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                     bg-gradient-to-r from-accent-500 to-purple-500
                     text-white text-xs font-medium transition-all hover:opacity-90 hover:scale-[1.01]"
        >
          <Upload size={13} />
          Upload Dataset
        </button>

        {/* File info */}
        {meta && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 p-2.5 bg-surface-2 rounded-lg border border-border"
          >
            <div className="text-[11px] font-medium text-white truncate">{meta.filename}</div>
            <div className="text-[10px] text-muted mt-0.5">
              {meta.row_count.toLocaleString()} rows · {meta.col_count} cols
            </div>
            <div className="text-[10px] text-muted">
              {formatFileSize(meta.file_size_bytes)}
            </div>
            <div className="mt-1.5 h-[2px] bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full w-full bg-green-500 rounded-full" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] text-muted/60 uppercase tracking-widest px-2 pb-1">
          Analysis
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = activePanel === item.id;
          const disabled = item.requiresSession && !sessionId;
          return (
            <button
              key={item.id}
              onClick={() => !disabled && handleNav(item.id)}
              disabled={disabled}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-all text-left",
                isActive
                  ? "bg-accent-500/15 text-accent-300 font-medium"
                  : "text-muted hover:bg-surface-2 hover:text-white",
                disabled && "opacity-30 cursor-not-allowed"
              )}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.id === "chat" && unreadMsgs > 0 && (
                <span className="text-[10px] bg-accent-900 text-accent-300 px-1.5 py-0.5 rounded-full">
                  {unreadMsgs}
                </span>
              )}
            </button>
          );
        })}

        <div className="text-[10px] text-muted/60 uppercase tracking-widest px-2 pt-3 pb-1">
          Reports
        </div>
        {EXPORT_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => sessionId && handleExport(item.id as "pdf" | "excel")}
            disabled={!sessionId}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-all text-left",
              "text-muted hover:bg-surface-2 hover:text-white",
              !sessionId && "opacity-30 cursor-not-allowed"
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-muted hover:text-white hover:bg-surface-2 transition-all"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        {sessionId && (
          <button
            onClick={() => { clearSession(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Upload size={14} className="rotate-180" />
            New dataset
          </button>
        )}
        <div className="flex items-center gap-1.5 px-2 pt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-slow" />
          <span className="text-[10px] text-muted">AI ready · claude-sonnet-4-6</span>
        </div>
      </div>
    </aside>
  );
}
