/**
 * API client — typed wrappers around all backend endpoints.
 * Uses /api/backend/* rewrites defined in next.config.js.
 */
import type {
  UploadResponse, DashboardData, ChatMessage,
  AnalysisArtifact, ForecastData,
} from "@/types";

const BASE = "/api/backend";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData
      ? (body as FormData)
      : body !== undefined
      ? JSON.stringify(body)
      : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}


// ── Upload ────────────────────────────────────────────────────────────────────
export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadResponse>("POST", "/upload", form, true);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request("DELETE", `/upload/${sessionId}`);
}


// ── Analysis ──────────────────────────────────────────────────────────────────
export async function getDashboard(sessionId: string): Promise<DashboardData> {
  return request<DashboardData>("GET", `/analysis/dashboard/${sessionId}`);
}

export async function getPreview(
  sessionId: string,
  rows = 50,
  offset = 0,
): Promise<{ total_rows: number; data: Record<string, unknown>[] }> {
  return request("GET", `/analysis/preview/${sessionId}?rows=${rows}&offset=${offset}`);
}


// ── Chat ──────────────────────────────────────────────────────────────────────
export interface ChatRequest {
  session_id: string;
  message: string;
  history: { role: string; content: string; timestamp: string }[];
}

export interface ChatResponseBody {
  message: string;
  artifacts: AnalysisArtifact[];
  confidence: number;
  columns_used: string[];
  rows_analyzed: number;
  follow_up_suggestions: string[];
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponseBody> {
  return request<ChatResponseBody>("POST", "/chat", req);
}

/**
 * Streaming chat — calls the /chat/stream endpoint and invokes
 * callbacks as chunks arrive.
 */
export async function streamChatMessage(
  req: ChatRequest,
  onDelta: (text: string) => void,
  onDone: (meta: Omit<ChatResponseBody, "message">) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok || !res.body) {
    onError("Stream request failed");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === "delta") onDelta(data.text ?? "");
          else if (currentEvent === "done") onDone(data);
          else if (currentEvent === "error") onError(data.message ?? "Unknown error");
        } catch {
          // Skip malformed lines
        }
      }
    }
  }
}


// ── Forecast ──────────────────────────────────────────────────────────────────
export async function runForecast(
  sessionId: string,
  options?: { target_col?: string; date_col?: string; horizon_days?: number },
): Promise<ForecastData> {
  return request<ForecastData>("POST", "/forecast/run", {
    session_id: sessionId,
    ...options,
  });
}


// ── Export ────────────────────────────────────────────────────────────────────
export async function exportReport(
  sessionId: string,
  format: "pdf" | "excel" | "csv",
): Promise<void> {
  const res = await fetch(`${BASE}/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      format,
      include_charts: true,
      include_insights: true,
    }),
  });
  if (!res.ok) throw new Error("Export failed");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = format === "excel" ? "xlsx" : format;
  a.download = `ai_analyst_report.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
