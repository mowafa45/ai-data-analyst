"""
Data Service — handles file parsing, cleaning, column detection,
and dataset caching in Redis. Supports CSV, XLSX, XLS up to 100 MB.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import structlog

from models.schemas import ColumnInfo, DatasetMeta
from services.cache import cache_set, cache_get, cache_delete
from utils.config import settings

log = structlog.get_logger()


# ── Column-type detection heuristics ──────────────────────────────────────────
REVENUE_KEYWORDS = re.compile(
    r"(revenue|sales|income|amount|price|total|gmv|arr|mrr|turnover|receipt|payment|cost|profit)",
    re.I,
)
DATE_KEYWORDS = re.compile(r"(date|time|day|month|year|period|week|ts|created|updated)", re.I)
CATEGORY_KEYWORDS = re.compile(r"(category|cat|type|segment|class|group|kind|tag)", re.I)
REGION_KEYWORDS = re.compile(r"(region|country|state|city|location|area|market|territory|geo)", re.I)
CUSTOMER_KEYWORDS = re.compile(r"(customer|client|user|account|buyer)", re.I)


# ── Public API ─────────────────────────────────────────────────────────────────
async def parse_and_cache_file(
    file_bytes: bytes,
    filename: str,
    file_size: int,
) -> Tuple[str, DatasetMeta, List[Dict[str, Any]]]:
    """
    Parse an uploaded file, clean the data, detect column semantics,
    store the DataFrame in Redis, and return (session_id, meta, preview).
    """
    session_id = _make_session_id(filename, file_bytes)
    log.info("Parsing file", session_id=session_id, filename=filename, bytes=file_size)

    ext = Path(filename).suffix.lower()
    sheets, active_df = _read_file(file_bytes, ext)

    # ── Clean ─────────────────────────────────────────────────────────────────
    original_rows = len(active_df)
    active_df, duplicates_removed = _remove_duplicates(active_df)
    active_df, missing_handled = _handle_missing(active_df)
    active_df = _parse_dates(active_df)
    active_df = _normalise_strings(active_df)

    # ── Column analysis ────────────────────────────────────────────────────────
    columns = _analyse_columns(active_df)

    # ── Semantic detection ─────────────────────────────────────────────────────
    detected_revenue_col = _detect_column(columns, REVENUE_KEYWORDS, "numeric")
    detected_date_col = _detect_column(columns, DATE_KEYWORDS, "datetime")
    detected_category_col = _detect_column(columns, CATEGORY_KEYWORDS, "categorical")
    detected_region_col = _detect_column(columns, REGION_KEYWORDS, "categorical")

    meta = DatasetMeta(
        session_id=session_id,
        filename=filename,
        file_size_bytes=file_size,
        row_count=len(active_df),
        col_count=len(active_df.columns),
        sheets=sheets,
        active_sheet=sheets[0] if sheets else "Sheet1",
        columns=columns,
        detected_date_col=detected_date_col,
        detected_revenue_col=detected_revenue_col,
        detected_category_col=detected_category_col,
        detected_region_col=detected_region_col,
        missing_handled=missing_handled,
        duplicates_removed=duplicates_removed,
    )

    # ── Cache DataFrame as JSON-compressed Parquet ─────────────────────────────
    buf = io.BytesIO()
    active_df.to_parquet(buf, engine="pyarrow", index=False)
    await cache_set(
        f"dataset:{session_id}",
        buf.getvalue(),
        ttl=settings.REDIS_DATASET_TTL,
        raw=True,
    )
    await cache_set(
        f"meta:{session_id}",
        meta.model_dump_json(),
        ttl=settings.REDIS_DATASET_TTL,
    )

    preview = active_df.head(10).replace({np.nan: None}).to_dict(orient="records")
    log.info(
        "File parsed and cached",
        session_id=session_id,
        rows=len(active_df),
        cols=len(active_df.columns),
        duplicates_removed=duplicates_removed,
        missing_handled=missing_handled,
    )
    return session_id, meta, preview


async def load_dataframe(session_id: str) -> Optional[pd.DataFrame]:
    """Load a cached dataset from Redis."""
    raw = await cache_get(f"dataset:{session_id}", raw=True)
    if raw is None:
        return None
    return pd.read_parquet(io.BytesIO(raw))


async def load_meta(session_id: str) -> Optional[DatasetMeta]:
    """Load dataset metadata from Redis."""
    raw = await cache_get(f"meta:{session_id}")
    if raw is None:
        return None
    return DatasetMeta.model_validate_json(raw)


async def delete_session(session_id: str) -> None:
    """Delete all cached data for a session."""
    await cache_delete(f"dataset:{session_id}")
    await cache_delete(f"meta:{session_id}")
    await cache_delete(f"insights:{session_id}")
    log.info("Session deleted", session_id=session_id)


# ── File reading ───────────────────────────────────────────────────────────────
def _read_file(file_bytes: bytes, ext: str) -> Tuple[List[str], pd.DataFrame]:
    buf = io.BytesIO(file_bytes)
    if ext == ".csv":
        df = _read_csv_smart(buf)
        return ["Sheet1"], df
    elif ext in (".xlsx", ".xls"):
        engine = "openpyxl" if ext == ".xlsx" else "xlrd"
        xl = pd.ExcelFile(buf, engine=engine)
        sheets = xl.sheet_names
        # Use the sheet with the most data
        best_sheet = sheets[0]
        best_size = 0
        dfs: Dict[str, pd.DataFrame] = {}
        for s in sheets:
            d = xl.parse(s)
            dfs[s] = d
            if d.size > best_size:
                best_size = d.size
                best_sheet = s
        return sheets, dfs[best_sheet]
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _read_csv_smart(buf: io.BytesIO) -> pd.DataFrame:
    """Try multiple delimiters and encodings."""
    content = buf.read()
    for encoding in ("utf-8", "latin-1", "cp1252"):
        for sep in (",", ";", "\t", "|"):
            try:
                return pd.read_csv(
                    io.BytesIO(content),
                    sep=sep,
                    encoding=encoding,
                    on_bad_lines="skip",
                    low_memory=False,
                )
            except Exception:
                continue
    raise ValueError("Could not parse CSV file. Please check the format.")


# ── Cleaning ───────────────────────────────────────────────────────────────────
def _remove_duplicates(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    before = len(df)
    df = df.drop_duplicates()
    return df.reset_index(drop=True), before - len(df)


def _handle_missing(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    missing_before = df.isnull().sum().sum()
    for col in df.columns:
        if df[col].dtype in (np.float64, np.float32, np.int64, np.int32):
            df[col] = df[col].fillna(df[col].median())
        elif df[col].dtype == object:
            df[col] = df[col].fillna("Unknown")
    return df, int(missing_before)


def _parse_dates(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        if DATE_KEYWORDS.search(col) and df[col].dtype == object:
            try:
                parsed = pd.to_datetime(df[col], infer_datetime_format=True, errors="coerce")
                if parsed.notna().sum() > len(df) * 0.7:   # >70% parseable → it's a date
                    df[col] = parsed
            except Exception:
                pass
    return df


def _normalise_strings(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].astype(str).str.strip()
    return df


# ── Column analysis ────────────────────────────────────────────────────────────
def _analyse_columns(df: pd.DataFrame) -> List[ColumnInfo]:
    infos: List[ColumnInfo] = []
    for col in df.columns:
        series = df[col]
        null_count = int(series.isnull().sum())
        unique_count = int(series.nunique())

        if pd.api.types.is_datetime64_any_dtype(series):
            dtype = "datetime"
        elif pd.api.types.is_bool_dtype(series):
            dtype = "boolean"
        elif pd.api.types.is_numeric_dtype(series):
            dtype = "numeric"
        elif unique_count <= min(50, len(df) * 0.1):
            dtype = "categorical"
        else:
            dtype = "text"

        stats = None
        if dtype == "numeric":
            stats = {
                "mean": round(float(series.mean()), 4),
                "std": round(float(series.std()), 4),
                "min": round(float(series.min()), 4),
                "max": round(float(series.max()), 4),
                "median": round(float(series.median()), 4),
                "q25": round(float(series.quantile(0.25)), 4),
                "q75": round(float(series.quantile(0.75)), 4),
            }

        sample = series.dropna().head(5).tolist()
        sample = [str(v) if not isinstance(v, (int, float, bool)) else v for v in sample]

        infos.append(ColumnInfo(
            name=col,
            dtype=dtype,
            pandas_dtype=str(series.dtype),
            null_count=null_count,
            null_pct=round(null_count / max(len(series), 1) * 100, 2),
            unique_count=unique_count,
            sample_values=sample,
            stats=stats,
        ))
    return infos


# ── Semantic column detection ─────────────────────────────────────────────────
def _detect_column(
    columns: List[ColumnInfo],
    pattern: re.Pattern,
    preferred_dtype: str,
) -> Optional[str]:
    # First pass: name match + dtype match
    for col in columns:
        if pattern.search(col.name) and col.dtype == preferred_dtype:
            return col.name
    # Second pass: name match only
    for col in columns:
        if pattern.search(col.name):
            return col.name
    return None


# ── Session ID ────────────────────────────────────────────────────────────────
def _make_session_id(filename: str, file_bytes: bytes) -> str:
    h = hashlib.sha256(file_bytes[:4096]).hexdigest()[:12]
    return f"{uuid.uuid4().hex[:8]}-{h}"
