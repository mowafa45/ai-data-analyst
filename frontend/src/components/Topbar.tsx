"use client";

import { RefreshCw, MessageSquare } from "lucide-react";
import { useStore } from "@/lib/store";
import { getDashboard } from "@/lib/api";
import toast from "react-hot-toast";

const PANEL_TITLES: Record<string, string> = {
  upload: "Upload Dataset",
  dashboard: "Dashboard",
  chat: "AI Chat",
  data: "Data Preview",
  forecast: "Forecasting",
};

export function Topbar() {
  const { activePanel, sessionId, setPanel, setDashboard, setLoading } = useStore();

  const handleRefresh = async () => {
    if (!sessionId) return;
    setLoading(true, "Refreshing dashboard…");
    try {
      const data = await getDashboard(sessionId);
      setDashboard(data);
      toast.success("Dashboard refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="h-13 flex-shrink-0 bg-surface-1 border-b border-border flex items-center px-5 gap-4">
      <h1 className="text-sm font-semibold text-white flex-1">
        {PANEL_TITLES[activePanel] ?? "AI Data Analyst"}
      </h1>

      <div className="flex items-center gap-2">
        {sessionId && (
          <button
            onClick={handleRefresh}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        )}
        <button
          onClick={() => sessionId && setPanel("chat")}
          disabled={!sessionId}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-30"
        >
          <MessageSquare size={13} />
          Ask AI
        </button>
      </div>
    </header>
  );
}
