/**
 * Global app state via Zustand.
 * Holds session, dataset meta, panel navigation, chat history, and loading state.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppPanel, AppState, ChatMessage, DatasetMeta,
  DashboardData, ForecastData,
} from "@/types";

interface Store extends AppState {
  // Dataset
  setSession: (sessionId: string, meta: DatasetMeta, preview: Record<string, unknown>[]) => void;
  clearSession: () => void;

  // Navigation
  setPanel: (panel: AppPanel) => void;

  // Loading
  setLoading: (loading: boolean, message?: string) => void;

  // Chat
  chatHistory: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (partial: Partial<ChatMessage>) => void;
  clearChat: () => void;

  // Dashboard
  dashboard: DashboardData | null;
  setDashboard: (d: DashboardData) => void;

  // Forecast
  forecast: ForecastData | null;
  setForecast: (f: ForecastData) => void;

  // Theme
  theme: "dark" | "light";
  toggleTheme: () => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // AppState defaults
      sessionId: null,
      meta: null,
      preview: [],
      activePanel: "upload",
      isLoading: false,
      loadingMessage: "",
      chatHistory: [],
      dashboard: null,
      forecast: null,
      theme: "dark",

      setSession: (sessionId, meta, preview) =>
        set({
          sessionId,
          meta,
          preview,
          activePanel: "dashboard",
          chatHistory: [],
          dashboard: null,
          forecast: null,
        }),

      clearSession: () =>
        set({
          sessionId: null,
          meta: null,
          preview: [],
          activePanel: "upload",
          chatHistory: [],
          dashboard: null,
          forecast: null,
        }),

      setPanel: (panel) => set({ activePanel: panel }),

      setLoading: (loading, message = "") =>
        set({ isLoading: loading, loadingMessage: message }),

      addMessage: (msg) =>
        set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

      updateLastMessage: (partial) =>
        set((s) => {
          const history = [...s.chatHistory];
          if (history.length === 0) return {};
          history[history.length - 1] = { ...history[history.length - 1], ...partial };
          return { chatHistory: history };
        }),

      clearChat: () => set({ chatHistory: [] }),

      setDashboard: (dashboard) => set({ dashboard }),

      setForecast: (forecast) => set({ forecast }),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "ai-analyst-store",
      partialize: (s) => ({ theme: s.theme }),  // Only persist theme preference
    }
  )
);
