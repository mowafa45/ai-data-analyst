"""
AI Service — Claude integration for conversational data analysis.

Builds a rich system prompt from the live dataset, sends it to Claude,
parses the response for embedded chart specs, and streams tokens back
to the frontend via SSE.
"""
from __future__ import annotations

import json
import re
from typing import AsyncIterator, Dict, List, Optional, Any

import anthropic
import pandas as pd
import structlog

from models.schemas import (
    ChatMessage, ChatResponse, AnalysisArtifact, ChartData, ChartDataset,
)
from services.data_service import load_dataframe, load_meta
from utils.config import settings

log = structlog.get_logger()

_client = anthropic.AsyncAnthropic(
    api_key=settings.ANTHROPIC_API_KEY,
    base_url=settings.ANTHROPIC_BASE_URL,
)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────
async def chat_with_data(
    session_id: str,
    user_message: str,
    history: List[ChatMessage],
) -> ChatResponse:
    """Non-streaming chat — full response returned at once."""
    df = await load_dataframe(session_id)
    meta = await load_meta(session_id)
    if df is None or meta is None:
        raise ValueError("Session not found or expired. Please re-upload your file.")

    system_prompt = _build_system_prompt(df, meta)
    messages = _build_messages(history, user_message)

    log.info("Sending to Claude", session_id=session_id, model=settings.CLAUDE_MODEL)

    response = await _client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=system_prompt,
        messages=messages,
    )

    raw_text = response.content[0].text
    return _parse_response(raw_text, df)


async def stream_chat_with_data(
    session_id: str,
    user_message: str,
    history: List[ChatMessage],
) -> AsyncIterator[str]:
    """
    Streaming chat — yields SSE-formatted chunks.
    Final chunk contains the parsed artifacts as a JSON event.
    """
    df = await load_dataframe(session_id)
    meta = await load_meta(session_id)
    if df is None or meta is None:
        yield _sse("error", {"message": "Session expired. Please re-upload your file."})
        return

    system_prompt = _build_system_prompt(df, meta)
    messages = _build_messages(history, user_message)

    full_text = ""
    async with _client.messages.stream(
        model=settings.CLAUDE_MODEL,
        max_tokens=settings.CLAUDE_MAX_TOKENS,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            full_text += text
            yield _sse("delta", {"text": text})

    # After streaming completes, parse and send artifacts
    parsed = _parse_response(full_text, df)
    yield _sse("done", {
        "confidence": parsed.confidence,
        "artifacts": [a.model_dump() for a in parsed.artifacts],
        "columns_used": parsed.columns_used,
        "rows_analyzed": parsed.rows_analyzed,
        "follow_up_suggestions": parsed.follow_up_suggestions,
    })


# ─────────────────────────────────────────────────────────────────────────────
# System prompt builder
# ─────────────────────────────────────────────────────────────────────────────
def _build_system_prompt(df: pd.DataFrame, meta) -> str:
    col_descriptions = _describe_columns(df, meta)
    data_summary = _compute_summary_stats(df, meta)

    return f"""You are an expert AI Data Analyst embedded in a business intelligence platform.
The user has uploaded a dataset called "{meta.filename}" with {meta.row_count:,} rows and {meta.col_count} columns.

## Dataset Columns
{col_descriptions}

## Key Statistics
{data_summary}

## Your capabilities
- Analyse trends, anomalies, seasonality, correlations
- Identify top/bottom performers across any dimension
- Segment customers, products, or regions
- Compare periods (month-over-month, year-over-year)
- Explain WHY something happened, not just what happened
- Provide specific, quantified business recommendations

## Response format rules
1. Always be specific — use exact numbers from the data, not vague claims.
2. Mention which columns and approximate row counts you analysed.
3. Write in professional business language — concise, direct, confident.
4. When you show data that would be better as a chart, embed a JSON spec between
   ```chart and ``` tags using this schema:
   {{"chart_type": "bar|line|pie|doughnut|scatter|area",
     "title": "...",
     "subtitle": "...",
     "labels": [...],
     "datasets": [{{"label":"...", "data":[...]}}],
     "y_format": "currency|percentage|number"}}
5. End your response with exactly this line:
   [META confidence=0.XX columns=col1,col2 rows=NNN]
   where XX is your confidence (0–1), cols are the columns you used, and NNN is rows analysed.
6. Suggest 2–3 follow-up questions at the very end in a [FOLLOWUP] block:
   [FOLLOWUP]
   - Question one?
   - Question two?
   [/FOLLOWUP]

Remember: the user sees charts automatically rendered — always prefer visual answers for trend/comparison questions."""


def _describe_columns(df: pd.DataFrame, meta) -> str:
    lines = []
    for col in meta.columns:
        if col.stats:
            stat_str = f" | mean={col.stats['mean']:.2f}, min={col.stats['min']:.2f}, max={col.stats['max']:.2f}"
        else:
            vals = ", ".join(str(v) for v in col.sample_values[:3])
            stat_str = f" | samples: {vals}"
            if col.dtype == "categorical":
                unique_vals = df[col.name].value_counts().head(5).index.tolist()
                stat_str += f" | top values: {', '.join(str(v) for v in unique_vals)}"
        lines.append(f"- {col.name} ({col.dtype}){stat_str}")
    return "\n".join(lines)


def _compute_summary_stats(df: pd.DataFrame, meta) -> str:
    lines = []

    # Numeric summary
    if meta.detected_revenue_col and meta.detected_revenue_col in df.columns:
        rev_col = meta.detected_revenue_col
        total = df[rev_col].sum()
        lines.append(f"- Total {rev_col}: {_fmt(total)}")
        if meta.detected_date_col and meta.detected_date_col in df.columns:
            try:
                monthly = df.groupby(
                    pd.to_datetime(df[meta.detected_date_col]).dt.to_period("M")
                )[rev_col].sum()
                lines.append(f"- Monthly range: {_fmt(monthly.min())} – {_fmt(monthly.max())}")
            except Exception:
                pass

    # Category breakdown
    if meta.detected_category_col and meta.detected_category_col in df.columns:
        cat_col = meta.detected_category_col
        top_cats = df[cat_col].value_counts().head(5)
        lines.append(f"- Top {cat_col}: " + ", ".join(
            f"{k} ({v:,})" for k, v in top_cats.items()
        ))

    # Region breakdown
    if meta.detected_region_col and meta.detected_region_col in df.columns:
        reg_col = meta.detected_region_col
        top_regs = df[reg_col].value_counts().head(5)
        lines.append(f"- Top {reg_col}: " + ", ".join(
            f"{k} ({v:,})" for k, v in top_regs.items()
        ))

    lines.append(f"- Total rows: {len(df):,}")
    return "\n".join(lines) if lines else "No summary available."


# ─────────────────────────────────────────────────────────────────────────────
# Message builder
# ─────────────────────────────────────────────────────────────────────────────
def _build_messages(history: List[ChatMessage], user_message: str) -> List[Dict]:
    msgs = []
    # Keep last 10 exchanges to stay within context
    for msg in history[-20:]:
        msgs.append({"role": msg.role, "content": msg.content})
    msgs.append({"role": "user", "content": user_message})
    return msgs


# ─────────────────────────────────────────────────────────────────────────────
# Response parser
# ─────────────────────────────────────────────────────────────────────────────
def _parse_response(raw: str, df: pd.DataFrame) -> ChatResponse:
    # Extract chart specs
    artifacts: List[AnalysisArtifact] = []
    chart_pattern = re.compile(r"```chart\s*\n(.*?)\n```", re.DOTALL)
    for match in chart_pattern.finditer(raw):
        try:
            spec = json.loads(match.group(1))
            chart = ChartData(
                chart_type=spec.get("chart_type", "bar"),
                title=spec.get("title", "Chart"),
                subtitle=spec.get("subtitle"),
                labels=spec.get("labels", []),
                datasets=[
                    ChartDataset(
                        label=d.get("label", ""),
                        data=d.get("data", []),
                        color=d.get("color"),
                    )
                    for d in spec.get("datasets", [])
                ],
                y_format=spec.get("y_format"),
                x_format=spec.get("x_format"),
            )
            artifacts.append(AnalysisArtifact(
                artifact_type="chart",
                chart_data=chart,
            ))
        except Exception as e:
            log.warning("Failed to parse chart spec", error=str(e))

    # Extract meta line
    confidence = 0.85
    columns_used: List[str] = []
    rows_analyzed = 0

    meta_match = re.search(r"\[META confidence=([\d.]+) columns=([^\s]+) rows=(\d+)\]", raw)
    if meta_match:
        confidence = float(meta_match.group(1))
        columns_used = meta_match.group(2).split(",")
        rows_analyzed = int(meta_match.group(3))

    # Extract follow-up suggestions
    followup: List[str] = []
    followup_match = re.search(r"\[FOLLOWUP\](.*?)\[/FOLLOWUP\]", raw, re.DOTALL)
    if followup_match:
        for line in followup_match.group(1).strip().splitlines():
            line = line.strip().lstrip("- ").strip()
            if line:
                followup.append(line)

    # Clean message
    clean = raw
    clean = chart_pattern.sub("", clean)
    clean = re.sub(r"\[META.*?\]", "", clean)
    clean = re.sub(r"\[FOLLOWUP\].*?\[/FOLLOWUP\]", "", clean, flags=re.DOTALL)
    clean = clean.strip()

    return ChatResponse(
        message=clean,
        artifacts=artifacts,
        confidence=confidence,
        columns_used=columns_used,
        rows_analyzed=rows_analyzed,
        follow_up_suggestions=followup[:3],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _sse(event: str, data: Dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _fmt(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"${v/1_000_000:.2f}M"
    if abs(v) >= 1_000:
        return f"${v/1_000:.1f}K"
    return f"${v:.2f}"
