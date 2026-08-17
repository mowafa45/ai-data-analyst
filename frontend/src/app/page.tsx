"use client";

import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { UploadView } from "@/components/upload/UploadView";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ChatView } from "@/components/chat/ChatView";
import { DataView } from "@/components/DataView";
import { ForecastView } from "@/components/forecast/ForecastView";
import { useStore } from "@/lib/store";

export default function Home() {
  const { activePanel, theme } = useStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1c1c22",
            color: "#e8e8f0",
            border: "1px solid #2a2a32",
            borderRadius: "10px",
            fontSize: "13px",
          },
        }}
      />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />

        <main className="flex-1 overflow-y-auto">
          {activePanel === "upload"    && <UploadView />}
          {activePanel === "dashboard" && <DashboardView />}
          {activePanel === "chat"      && <ChatView />}
          {activePanel === "data"      && <DataView />}
          {activePanel === "forecast"  && <ForecastView />}
        </main>
      </div>
    </div>
  );
}
