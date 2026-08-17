"""
Insight Service — automatically generates business insights, KPI cards,
and chart data from the uploaded dataset without requiring user questions.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple
import uuid

import numpy as np
import pandas as pd
import structlog

from models.schemas import (
    ChartData, ChartDataset, DashboardResponse, InsightItem, KPICard,
)
from services.cache import cache_get, cache_set
from services.data_service import load_dataframe, load_meta
from utils.config import settings

log = structlog.get_logger()

CHART_COLORS = [
    "#2a78d6", "#1baf7a", "#eda100", "#4a3aa7",
    "#e34948", "#e87ba4", "#eb6834", "#008300",
]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────
async def generate_dashboard(session_id: str) -> DashboardResponse:
    """Generate a full dashboard from the cached dataset."""
    # Return cached dashboard if available
    cached = await cache_get(f"dashboard:{session_id}")
    if cached:
        return DashboardResponse.model_validate_json(cached)

    df = await load_dataframe(session_id)
    meta = await load_meta(session_id)
    if df is None or meta is None:
        raise ValueError("Session not found or expired.")

    kpis = _build_kpis(df, meta)
    charts = _build_charts(df, meta)
    insights = _build_insights(df, meta)
    recommendations = _build_recommendations(insights, df, meta)

    dashboard = DashboardResponse(
        session_id=session_id,
        kpis=kpis,
        charts=charts,
        insights=insights,
        recommendations=recommendations,
    )

    await cache_set(
        f"dashboard:{session_id}",
        dashboard.model_dump_json(),
        ttl=settings.REDIS_INSIGHT_TTL,
    )
    return dashboard


# ─────────────────────────────────────────────────────────────────────────────
# KPI Cards
# ─────────────────────────────────────────────────────────────────────────────
def _build_kpis(df: pd.DataFrame, meta) -> List[KPICard]:
    kpis: List[KPICard] = []
    rev_col = meta.detected_revenue_col
    date_col = meta.detected_date_col

    # ── Revenue / primary numeric ──────────────────────────────────────────────
    if rev_col and rev_col in df.columns:
        total = df[rev_col].sum()
        sparkline, delta_pct = _compute_trend(df, rev_col, date_col, periods=12)
        kpis.append(KPICard(
            label=f"Total {_prettify(rev_col)}",
            value=_fmt_currency(total),
            raw_value=float(total),
            delta_pct=delta_pct,
            delta_label="vs previous period",
            trend="up" if (delta_pct or 0) > 0 else "down",
            sparkline=sparkline,
        ))

    # ── Row count (orders / records) ────────────────────────────────────────────
    kpis.append(KPICard(
        label="Total Records",
        value=f"{len(df):,}",
        raw_value=float(len(df)),
        trend="flat",
    ))

    # ── Average of primary numeric ─────────────────────────────────────────────
    if rev_col and rev_col in df.columns:
        avg = df[rev_col].mean()
        kpis.append(KPICard(
            label=f"Avg {_prettify(rev_col)}",
            value=_fmt_currency(avg),
            raw_value=float(avg),
            trend="flat",
        ))

    # ── Second numeric column (profit, quantity, etc.) ─────────────────────────
    numeric_cols = [c for c in meta.columns if c.dtype == "numeric" and c.name != rev_col]
    if numeric_cols:
        col2 = numeric_cols[0].name
        val = df[col2].sum() if "count" in col2.lower() or "unit" in col2.lower() else df[col2].mean()
        kpis.append(KPICard(
            label=_prettify(col2),
            value=_fmt_smart(float(val), col2),
            raw_value=float(val),
            trend="flat",
        ))

    return kpis[:5]


# ─────────────────────────────────────────────────────────────────────────────
# Charts
# ─────────────────────────────────────────────────────────────────────────────
def _build_charts(df: pd.DataFrame, meta) -> List[ChartData]:
    charts: List[ChartData] = []
    rev_col = meta.detected_revenue_col
    date_col = meta.detected_date_col
    cat_col = meta.detected_category_col
    reg_col = meta.detected_region_col

    # 1. Time series (if date + numeric)
    if date_col and rev_col and date_col in df.columns and rev_col in df.columns:
        charts.append(_time_series_chart(df, date_col, rev_col))

    # 2. Category breakdown (pie/donut)
    if cat_col and rev_col and cat_col in df.columns and rev_col in df.columns:
        charts.append(_category_chart(df, cat_col, rev_col))

    # 3. Top performers (horizontal bar)
    text_cols = [c.name for c in meta.columns if c.dtype == "text" and c.name not in (cat_col, reg_col, date_col)]
    if text_cols and rev_col and rev_col in df.columns:
        charts.append(_top_performers_chart(df, text_cols[0], rev_col))

    # 4. Regional breakdown
    if reg_col and rev_col and reg_col in df.columns and rev_col in df.columns:
        charts.append(_regional_chart(df, reg_col, rev_col))

    # 5. Distribution histogram for primary numeric
    if rev_col and rev_col in df.columns:
        charts.append(_distribution_chart(df, rev_col))

    # 6. Scatter if two good numeric columns
    numeric_cols = [c.name for c in meta.columns if c.dtype == "numeric"]
    if len(numeric_cols) >= 2 and rev_col in numeric_cols:
        other = next(c for c in numeric_cols if c != rev_col)
        charts.append(_scatter_chart(df, other, rev_col))

    return charts[:8]


def _time_series_chart(df: pd.DataFrame, date_col: str, rev_col: str) -> ChartData:
    try:
        dates = pd.to_datetime(df[date_col], errors="coerce")
        tmp = df.copy()
        tmp["_period"] = dates.dt.to_period("M")
        grouped = tmp.groupby("_period")[rev_col].sum().tail(12)
        return ChartData(
            chart_type="bar",
            title=f"{_prettify(rev_col)} Over Time",
            subtitle="Monthly aggregation",
            labels=[str(p) for p in grouped.index],
            datasets=[ChartDataset(label=_prettify(rev_col), data=_safe_list(grouped.values), color=CHART_COLORS[0])],
            y_format="currency",
        )
    except Exception:
        return _fallback_chart("Revenue Over Time")


def _category_chart(df: pd.DataFrame, cat_col: str, rev_col: str) -> ChartData:
    grouped = df.groupby(cat_col)[rev_col].sum().sort_values(ascending=False).head(8)
    return ChartData(
        chart_type="doughnut",
        title=f"{_prettify(rev_col)} by {_prettify(cat_col)}",
        subtitle="Share of total",
        labels=list(grouped.index.astype(str)),
        datasets=[ChartDataset(label=_prettify(rev_col), data=_safe_list(grouped.values))],
        y_format="currency",
    )


def _top_performers_chart(df: pd.DataFrame, name_col: str, rev_col: str) -> ChartData:
    grouped = df.groupby(name_col)[rev_col].sum().sort_values(ascending=False).head(8)
    return ChartData(
        chart_type="bar",
        title=f"Top {_prettify(name_col)} by {_prettify(rev_col)}",
        subtitle="Ranked by total value",
        labels=list(grouped.index.astype(str)),
        datasets=[ChartDataset(label=_prettify(rev_col), data=_safe_list(grouped.values), color=CHART_COLORS[1])],
        y_format="currency",
    )


def _regional_chart(df: pd.DataFrame, reg_col: str, rev_col: str) -> ChartData:
    grouped = df.groupby(reg_col)[rev_col].sum().sort_values(ascending=False)
    return ChartData(
        chart_type="bar",
        title=f"{_prettify(rev_col)} by {_prettify(reg_col)}",
        subtitle="Regional performance",
        labels=list(grouped.index.astype(str)),
        datasets=[ChartDataset(label=_prettify(rev_col), data=_safe_list(grouped.values), color=CHART_COLORS[2])],
        y_format="currency",
    )


def _distribution_chart(df: pd.DataFrame, col: str) -> ChartData:
    vals = df[col].dropna()
    counts, bins = np.histogram(vals, bins=10)
    labels = [f"{bins[i]:.0f}–{bins[i+1]:.0f}" for i in range(len(bins)-1)]
    return ChartData(
        chart_type="bar",
        title=f"{_prettify(col)} Distribution",
        subtitle="Value frequency histogram",
        labels=labels,
        datasets=[ChartDataset(label="Count", data=_safe_list(counts), color=CHART_COLORS[4])],
        y_format="number",
    )


def _scatter_chart(df: pd.DataFrame, x_col: str, y_col: str) -> ChartData:
    sample = df[[x_col, y_col]].dropna().sample(min(200, len(df)), random_state=42)
    return ChartData(
        chart_type="scatter",
        title=f"{_prettify(x_col)} vs {_prettify(y_col)}",
        subtitle="Correlation scatter",
        labels=[],
        datasets=[ChartDataset(
            label="Data points",
            data=[{"x": float(r[x_col]), "y": float(r[y_col])} for _, r in sample.iterrows()],
        )],
        x_label=_prettify(x_col),
        y_label=_prettify(y_col),
    )


def _fallback_chart(title: str) -> ChartData:
    return ChartData(chart_type="bar", title=title, labels=[], datasets=[])


# ─────────────────────────────────────────────────────────────────────────────
# Insights
# ─────────────────────────────────────────────────────────────────────────────
def _build_insights(df: pd.DataFrame, meta) -> List[InsightItem]:
    insights: List[InsightItem] = []
    rev_col = meta.detected_revenue_col
    date_col = meta.detected_date_col
    cat_col = meta.detected_category_col
    reg_col = meta.detected_region_col

    # 1. Revenue trend
    if rev_col and date_col and rev_col in df.columns and date_col in df.columns:
        ins = _insight_revenue_trend(df, rev_col, date_col)
        if ins:
            insights.append(ins)

    # 2. 80/20 rule (Pareto)
    text_cols = [c.name for c in meta.columns if c.dtype == "text"]
    if text_cols and rev_col and rev_col in df.columns:
        ins = _insight_pareto(df, text_cols[0], rev_col)
        if ins:
            insights.append(ins)

    # 3. Top category
    if cat_col and rev_col and cat_col in df.columns and rev_col in df.columns:
        ins = _insight_top_category(df, cat_col, rev_col)
        if ins:
            insights.append(ins)

    # 4. Underperforming region
    if reg_col and rev_col and reg_col in df.columns and rev_col in df.columns:
        ins = _insight_underperforming(df, reg_col, rev_col)
        if ins:
            insights.append(ins)

    # 5. Anomaly detection
    if rev_col and rev_col in df.columns:
        ins = _insight_anomaly(df, rev_col, date_col)
        if ins:
            insights.append(ins)

    return insights[:6]


def _insight_revenue_trend(df, rev_col, date_col) -> Optional[InsightItem]:
    try:
        dates = pd.to_datetime(df[date_col], errors="coerce")
        tmp = df.copy()
        tmp["_period"] = dates.dt.to_period("M")
        grouped = tmp.groupby("_period")[rev_col].sum()
        if len(grouped) < 2:
            return None
        recent = grouped.iloc[-1]
        prev = grouped.iloc[-2]
        pct = (recent - prev) / max(abs(prev), 1) * 100
        direction = "increased" if pct > 0 else "decreased"
        t = "positive" if pct > 0 else "negative"
        return InsightItem(
            id=str(uuid.uuid4()),
            type=t,
            emoji="📈" if pct > 0 else "📉",
            headline=f"{_prettify(rev_col)} {direction} {abs(pct):.1f}% month-over-month",
            detail=f"From {_fmt_currency(prev)} to {_fmt_currency(recent)}. "
                   f"{'Strong momentum heading into the next period.' if pct > 5 else 'Monitor this trend closely.'}",
            columns_used=[rev_col, date_col],
            row_count_analyzed=len(df),
            confidence=0.92,
        )
    except Exception:
        return None


def _insight_pareto(df, name_col, rev_col) -> Optional[InsightItem]:
    try:
        grouped = df.groupby(name_col)[rev_col].sum().sort_values(ascending=False)
        total = grouped.sum()
        cumsum = grouped.cumsum()
        top_80_idx = (cumsum / total <= 0.8).sum() + 1
        top_pct = top_80_idx / len(grouped) * 100
        return InsightItem(
            id=str(uuid.uuid4()),
            type="neutral",
            emoji="🎯",
            headline=f"Top {top_80_idx} {_prettify(name_col)}s drive 80% of {_prettify(rev_col)}",
            detail=f"Only {top_pct:.1f}% of your {_prettify(name_col).lower()}s generate 80% of total value. "
                   f"Focus retention and growth efforts on this critical group.",
            columns_used=[name_col, rev_col],
            row_count_analyzed=len(df),
            confidence=0.95,
        )
    except Exception:
        return None


def _insight_top_category(df, cat_col, rev_col) -> Optional[InsightItem]:
    try:
        grouped = df.groupby(cat_col)[rev_col].sum()
        top = grouped.idxmax()
        top_val = grouped.max()
        total = grouped.sum()
        share = top_val / total * 100
        return InsightItem(
            id=str(uuid.uuid4()),
            type="positive",
            emoji="🏆",
            headline=f"{top} is the top-performing {_prettify(cat_col)} ({share:.1f}% of total)",
            detail=f"Generating {_fmt_currency(top_val)} total. "
                   f"Consider expanding offerings in this category.",
            columns_used=[cat_col, rev_col],
            row_count_analyzed=len(df),
            confidence=0.90,
        )
    except Exception:
        return None


def _insight_underperforming(df, reg_col, rev_col) -> Optional[InsightItem]:
    try:
        grouped = df.groupby(reg_col)[rev_col].sum()
        avg = grouped.mean()
        below_avg = grouped[grouped < avg * 0.7]
        if below_avg.empty:
            return None
        worst = below_avg.idxmin()
        worst_val = below_avg.min()
        gap = avg - worst_val
        return InsightItem(
            id=str(uuid.uuid4()),
            type="warning",
            emoji="⚠️",
            headline=f"{worst} is significantly underperforming vs average {_prettify(reg_col)}",
            detail=f"Generating {_fmt_currency(worst_val)} vs the {_prettify(reg_col).lower()} average of {_fmt_currency(avg)} "
                   f"— a gap of {_fmt_currency(gap)}. Investigate root causes before the next planning cycle.",
            columns_used=[reg_col, rev_col],
            row_count_analyzed=len(df),
            confidence=0.87,
        )
    except Exception:
        return None


def _insight_anomaly(df, rev_col, date_col) -> Optional[InsightItem]:
    try:
        vals = df[rev_col].dropna()
        mean, std = vals.mean(), vals.std()
        outliers = df[np.abs(df[rev_col] - mean) > 3 * std]
        if len(outliers) == 0:
            return None
        return InsightItem(
            id=str(uuid.uuid4()),
            type="neutral",
            emoji="🔍",
            headline=f"{len(outliers)} anomalous transactions detected (>3σ from mean)",
            detail=f"These {len(outliers)} records have {_prettify(rev_col).lower()} values far outside the normal range "
                   f"(mean: {_fmt_currency(mean)}). Review for data quality or exceptional events.",
            columns_used=[rev_col],
            row_count_analyzed=len(df),
            confidence=0.88,
        )
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Recommendations
# ─────────────────────────────────────────────────────────────────────────────
def _build_recommendations(insights: List[InsightItem], df, meta) -> List[str]:
    recs = []
    for ins in insights:
        if ins.type == "warning":
            recs.append(f"Investigate underperformance in {ins.headline.split(' is ')[0]} — assign a dedicated team to diagnose root causes.")
        elif ins.type == "positive" and "top" in ins.headline.lower():
            recs.append(f"Double down on {ins.headline.split(' is the ')[0]} — increase inventory or marketing budget by 15–20%.")
    if meta.detected_revenue_col:
        recs.append("Implement monthly revenue tracking dashboards to catch trends within 30 days, not after quarter-end.")
    recs.append("Run a customer cohort analysis to identify churn risk among high-value accounts.")
    return recs[:5]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _compute_trend(df, rev_col, date_col, periods=12) -> Tuple[List[float], Optional[float]]:
    try:
        if not date_col or date_col not in df.columns:
            spark = [float(v) for v in df[rev_col].rolling(max(1, len(df)//12)).mean().dropna().tail(12).tolist()]
            return spark, None
        dates = pd.to_datetime(df[date_col], errors="coerce")
        tmp = df.copy()
        tmp["_p"] = dates.dt.to_period("M")
        grouped = tmp.groupby("_p")[rev_col].sum().tail(periods)
        spark = [float(v) for v in grouped.values]
        delta = None
        if len(spark) >= 2:
            delta = round((spark[-1] - spark[-2]) / max(abs(spark[-2]), 1) * 100, 2)
        return spark, delta
    except Exception:
        return [], None


def _safe_list(arr) -> List[float]:
    return [round(float(v), 2) if not np.isnan(float(v)) else 0.0 for v in arr]


def _fmt_currency(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"${v/1_000_000:.2f}M"
    if abs(v) >= 1_000:
        return f"${v/1_000:.1f}K"
    return f"${v:.2f}"


def _fmt_smart(v: float, col: str) -> str:
    if "pct" in col.lower() or "rate" in col.lower() or "margin" in col.lower():
        return f"{v:.1f}%"
    if any(k in col.lower() for k in ["price", "revenue", "cost", "amount", "sales"]):
        return _fmt_currency(v)
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v/1_000:.1f}K"
    return f"{v:.1f}"


def _prettify(s: str) -> str:
    return s.replace("_", " ").replace("-", " ").title()
