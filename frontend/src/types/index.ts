// ── Column & Dataset types ────────────────────────────────────────────────────
export interface ColumnInfo {
  name: string;
  dtype: "numeric" | "categorical" | "datetime" | "boolean" | "text";
  pandas_dtype: string;
  null_count: number;
  null_pct: number;
  unique_count: number;
  sample_values: (string | number | boolean)[];
  stats?: {
    mean: number; std: number; min: number; max: number;
    median: number; q25: number; q75: number;
  };
}

export interface DatasetMeta {
  session_id: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  col_count: number;
  sheets: string[];
  active_sheet: string;
  columns: ColumnInfo[];
  detected_date_col?: string;
  detected_revenue_col?: string;
  detected_category_col?: string;
  detected_region_col?: string;
  missing_handled: number;
  duplicates_removed: number;
  upload_ts: string;
}

export interface UploadResponse {
  session_id: string;
  meta: DatasetMeta;
  preview: Record<string, unknown>[];
  message: string;
}

// ── Dashboard types ───────────────────────────────────────────────────────────
export interface KPICard {
  label: string;
  value: string;
  raw_value: number;
  delta_pct?: number;
  delta_label?: string;
  trend: "up" | "down" | "flat";
  sparkline: number[];
}

export interface ChartDataset {
  label: string;
  data: (number | null | { x: number; y: number })[];
  color?: string;
}

export interface ChartData {
  chart_type: "bar" | "line" | "pie" | "doughnut" | "scatter" | "area" | "heatmap" | "treemap";
  title: string;
  subtitle?: string;
  labels: string[];
  datasets: ChartDataset[];
  x_label?: string;
  y_label?: string;
  x_format?: "currency" | "percentage" | "date" | "number";
  y_format?: "currency" | "percentage" | "date" | "number";
}

export interface InsightItem {
  id: string;
  type: "positive" | "negative" | "neutral" | "warning";
  emoji: string;
  headline: string;
  detail: string;
  columns_used: string[];
  row_count_analyzed: number;
  confidence: number;
}

export interface DashboardData {
  session_id: string;
  kpis: KPICard[];
  charts: ChartData[];
  insights: InsightItem[];
  recommendations: string[];
  generated_at: string;
}

// ── Chat types ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  artifacts?: AnalysisArtifact[];
  confidence?: number;
  columns_used?: string[];
  rows_analyzed?: number;
  follow_up_suggestions?: string[];
  isStreaming?: boolean;
}

export interface AnalysisArtifact {
  artifact_type: "chart" | "table" | "summary";
  chart_data?: ChartData;
  table_data?: Record<string, unknown>[];
  columns_used?: string[];
  rows_analyzed?: number;
}

// ── Forecast types ────────────────────────────────────────────────────────────
export interface ForecastPoint {
  date: string;
  actual?: number;
  predicted: number;
  lower: number;
  upper: number;
}

export interface ModelMetric {
  name: string;
  mape: number;
  rmse: number;
  r2: number;
  selected: boolean;
}

export interface ForecastData {
  session_id: string;
  target_column: string;
  date_column: string;
  model_used: string;
  horizon_days: number;
  series: ForecastPoint[];
  model_metrics: ModelMetric[];
  trend_direction: "up" | "down" | "flat";
  trend_pct: number;
  next_period_forecast: number;
  next_period_label: string;
  summary: string;
}

// ── App state ─────────────────────────────────────────────────────────────────
export type AppPanel = "upload" | "dashboard" | "chat" | "data" | "forecast";

export interface AppState {
  sessionId: string | null;
  meta: DatasetMeta | null;
  preview: Record<string, unknown>[];
  activePanel: AppPanel;
  isLoading: boolean;
  loadingMessage: string;
}
