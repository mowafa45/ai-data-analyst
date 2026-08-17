"""
Pydantic schemas for API request/response validation.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field


# ── Dataset models ─────────────────────────────────────────────────────────────
class ColumnInfo(BaseModel):
    name: str
    dtype: str                      # "numeric", "categorical", "datetime", "boolean", "text"
    pandas_dtype: str
    null_count: int
    null_pct: float
    unique_count: int
    sample_values: List[Any]
    stats: Optional[Dict[str, float]] = None   # mean/std/min/max for numerics


class DatasetMeta(BaseModel):
    session_id: str
    filename: str
    file_size_bytes: int
    row_count: int
    col_count: int
    sheets: List[str]
    active_sheet: str
    columns: List[ColumnInfo]
    detected_date_col: Optional[str] = None
    detected_revenue_col: Optional[str] = None
    detected_category_col: Optional[str] = None
    detected_region_col: Optional[str] = None
    missing_handled: int
    duplicates_removed: int
    upload_ts: datetime = Field(default_factory=datetime.utcnow)


class UploadResponse(BaseModel):
    session_id: str
    meta: DatasetMeta
    preview: List[Dict[str, Any]]   # first 10 rows as list of dicts
    message: str


# ── KPI / Dashboard models ─────────────────────────────────────────────────────
class KPICard(BaseModel):
    label: str
    value: str                      # formatted string e.g. "$4.82M"
    raw_value: float
    delta_pct: Optional[float] = None
    delta_label: Optional[str] = None
    trend: Literal["up", "down", "flat"] = "flat"
    sparkline: List[float] = []


class ChartDataset(BaseModel):
    label: str
    data: List[float | None]
    color: Optional[str] = None


class ChartData(BaseModel):
    chart_type: Literal["bar", "line", "pie", "doughnut", "scatter", "area", "heatmap", "treemap"]
    title: str
    subtitle: Optional[str] = None
    labels: List[str]
    datasets: List[ChartDataset]
    x_label: Optional[str] = None
    y_label: Optional[str] = None
    x_format: Optional[str] = None     # "currency", "percentage", "date", "number"
    y_format: Optional[str] = None


class InsightItem(BaseModel):
    id: str
    type: Literal["positive", "negative", "neutral", "warning"]
    emoji: str
    headline: str
    detail: str
    columns_used: List[str]
    row_count_analyzed: int
    confidence: float               # 0–1


class DashboardResponse(BaseModel):
    session_id: str
    kpis: List[KPICard]
    charts: List[ChartData]
    insights: List[InsightItem]
    recommendations: List[str]
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Chat models ────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: List[ChatMessage] = []


class AnalysisArtifact(BaseModel):
    """Attached chart/table generated as part of a chat response."""
    artifact_type: Literal["chart", "table", "summary"]
    chart_data: Optional[ChartData] = None
    table_data: Optional[List[Dict[str, Any]]] = None
    columns_used: List[str] = []
    rows_analyzed: int = 0


class ChatResponse(BaseModel):
    message: str
    artifacts: List[AnalysisArtifact] = []
    confidence: float                   # 0–1
    columns_used: List[str] = []
    rows_analyzed: int = 0
    follow_up_suggestions: List[str] = []


# ── Forecast models ────────────────────────────────────────────────────────────
class ForecastPoint(BaseModel):
    date: str                           # ISO date string
    actual: Optional[float] = None
    predicted: float
    lower: float
    upper: float


class ModelMetric(BaseModel):
    name: str
    mape: float
    rmse: float
    r2: float
    selected: bool = False


class ForecastResponse(BaseModel):
    session_id: str
    target_column: str
    date_column: str
    model_used: str
    horizon_days: int
    series: List[ForecastPoint]
    model_metrics: List[ModelMetric]
    trend_direction: Literal["up", "down", "flat"]
    trend_pct: float
    next_period_forecast: float
    next_period_label: str
    summary: str


# ── Export models ──────────────────────────────────────────────────────────────
class ExportRequest(BaseModel):
    session_id: str
    format: Literal["pdf", "excel", "csv"]
    include_charts: bool = True
    include_insights: bool = True
    include_forecast: bool = False


# ── Health ────────────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: str
    db: str
    cache: str
    version: str = "1.0.0"
