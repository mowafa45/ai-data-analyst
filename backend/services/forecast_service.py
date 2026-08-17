"""
Forecast Service — fits multiple ML models on the time series,
picks the best by MAPE, and returns predictions with confidence intervals.

Models tried (in order):
  1. Prophet          — handles seasonality + holidays natively
  2. XGBoost          — gradient boosted trees with date features
  3. Linear Regression — fast baseline
  4. Random Forest    — non-linear baseline
"""
from __future__ import annotations

import warnings
from datetime import timedelta
from typing import List, Optional, Tuple
import uuid

import numpy as np
import pandas as pd
import structlog
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from prophet import Prophet
    HAS_PROPHET = True
except ImportError:
    HAS_PROPHET = False

from models.schemas import ForecastPoint, ForecastResponse, ModelMetric
from services.data_service import load_dataframe, load_meta
from utils.config import settings

log = structlog.get_logger()
warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────
async def run_forecast(
    session_id: str,
    target_col: Optional[str] = None,
    date_col: Optional[str] = None,
    horizon_days: int = 180,
) -> ForecastResponse:
    df = await load_dataframe(session_id)
    meta = await load_meta(session_id)
    if df is None or meta is None:
        raise ValueError("Session not found.")

    # Resolve columns
    rev_col = target_col or meta.detected_revenue_col
    dt_col = date_col or meta.detected_date_col

    if not rev_col or rev_col not in df.columns:
        raise ValueError("No numeric target column found. Please specify one.")
    if not dt_col or dt_col not in df.columns:
        raise ValueError("No date column found. Forecasting requires a date/time column.")

    # Aggregate to monthly
    ts = _prepare_timeseries(df, dt_col, rev_col)
    if len(ts) < settings.MIN_ROWS_FOR_FORECAST:
        raise ValueError(f"Need at least {settings.MIN_ROWS_FOR_FORECAST} data points for forecasting. Got {len(ts)}.")

    log.info("Running forecast", session_id=session_id, rows=len(ts), horizon_days=horizon_days)

    results = []
    metrics: List[ModelMetric] = []

    # ── Try each model ──────────────────────────────────────────────────────
    if HAS_PROPHET:
        try:
            preds, mets, future_dates = _forecast_prophet(ts, horizon_days)
            results.append(("Prophet", preds, mets, future_dates))
        except Exception as e:
            log.warning("Prophet failed", error=str(e))

    try:
        preds, mets, future_dates = _forecast_xgboost(ts, horizon_days)
        results.append(("XGBoost" if HAS_XGB else "GBM", preds, mets, future_dates))
    except Exception as e:
        log.warning("XGBoost failed", error=str(e))

    try:
        preds, mets, future_dates = _forecast_linear(ts, horizon_days)
        results.append(("Linear Regression", preds, mets, future_dates))
    except Exception as e:
        log.warning("Linear Regression failed", error=str(e))

    try:
        preds, mets, future_dates = _forecast_random_forest(ts, horizon_days)
        results.append(("Random Forest", preds, mets, future_dates))
    except Exception as e:
        log.warning("Random Forest failed", error=str(e))

    if not results:
        raise ValueError("All forecasting models failed. Dataset may be too small or have too many gaps.")

    # ── Select best by MAPE ─────────────────────────────────────────────────
    best_name, best_preds, best_mets, best_future_dates = min(results, key=lambda r: r[2]["mape"])

    # Build ModelMetric list
    for name, _, mets_dict, _ in results:
        metrics.append(ModelMetric(
            name=name,
            mape=round(mets_dict["mape"] * 100, 2),
            rmse=round(mets_dict["rmse"], 2),
            r2=round(mets_dict["r2"], 4),
            selected=name == best_name,
        ))

    # ── Build full series (historical + forecast) ──────────────────────────
    series: List[ForecastPoint] = []
    for date, actual in zip(ts.index, ts.values):
        series.append(ForecastPoint(
            date=str(date.date()),
            actual=float(actual),
            predicted=float(actual),
            lower=float(actual * 0.95),
            upper=float(actual * 1.05),
        ))

    for i, (date, pred, lower, upper) in enumerate(zip(
        best_future_dates, best_preds["mean"], best_preds["lower"], best_preds["upper"]
    )):
        series.append(ForecastPoint(
            date=str(date.date()),
            actual=None,
            predicted=round(float(pred), 2),
            lower=round(float(lower), 2),
            upper=round(float(upper), 2),
        ))

    # ── Trend calculation ──────────────────────────────────────────────────
    next_val = best_preds["mean"][0] if best_preds["mean"] else ts.iloc[-1]
    last_val = ts.iloc[-1]
    trend_pct = (next_val - last_val) / max(abs(last_val), 1) * 100
    trend_dir = "up" if trend_pct > 1 else "down" if trend_pct < -1 else "flat"

    next_date = best_future_dates[0] if best_future_dates else pd.Timestamp.now()
    next_label = next_date.strftime("%B %Y") if hasattr(next_date, "strftime") else str(next_date)

    summary = (
        f"Using {best_name} (MAPE {best_mets['mape']*100:.1f}%), {_prettify(rev_col)} is forecast to "
        f"{'grow' if trend_pct > 0 else 'decline'} {abs(trend_pct):.1f}% next period to "
        f"{_fmt(next_val)}. "
        f"Confidence interval: {_fmt(best_preds['lower'][0])} – {_fmt(best_preds['upper'][0])}."
    )

    return ForecastResponse(
        session_id=session_id,
        target_column=rev_col,
        date_column=dt_col,
        model_used=best_name,
        horizon_days=horizon_days,
        series=series,
        model_metrics=sorted(metrics, key=lambda m: m.mape),
        trend_direction=trend_dir,
        trend_pct=round(trend_pct, 2),
        next_period_forecast=round(float(next_val), 2),
        next_period_label=next_label,
        summary=summary,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Data preparation
# ─────────────────────────────────────────────────────────────────────────────
def _prepare_timeseries(df: pd.DataFrame, date_col: str, target_col: str) -> pd.Series:
    tmp = df[[date_col, target_col]].copy()
    tmp[date_col] = pd.to_datetime(tmp[date_col], errors="coerce")
    tmp = tmp.dropna()
    tmp = tmp.groupby(pd.Grouper(key=date_col, freq="ME"))[target_col].sum()
    tmp = tmp[tmp > 0]
    return tmp


def _make_date_features(dates: pd.DatetimeIndex) -> np.ndarray:
    return np.column_stack([
        dates.year,
        dates.month,
        dates.quarter,
        dates.dayofyear,
        np.sin(2 * np.pi * dates.month / 12),
        np.cos(2 * np.pi * dates.month / 12),
    ])


def _future_dates(ts: pd.Series, horizon_days: int) -> pd.DatetimeIndex:
    months = max(1, horizon_days // 30)
    last = ts.index[-1]
    return pd.date_range(start=last + pd.DateOffset(months=1), periods=months, freq="ME")


# ─────────────────────────────────────────────────────────────────────────────
# Prophet
# ─────────────────────────────────────────────────────────────────────────────
def _forecast_prophet(ts: pd.Series, horizon_days: int) -> Tuple[dict, dict, pd.DatetimeIndex]:
    df_p = pd.DataFrame({"ds": ts.index.to_timestamp(), "y": ts.values})
    model = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False, uncertainty_samples=100)
    model.fit(df_p)

    months = max(1, horizon_days // 30)
    future = model.make_future_dataframe(periods=months, freq="MS")
    forecast = model.predict(future)

    future_fc = forecast.tail(months)
    preds = {
        "mean": future_fc["yhat"].tolist(),
        "lower": future_fc["yhat_lower"].tolist(),
        "upper": future_fc["yhat_upper"].tolist(),
    }

    # CV metrics on training fold
    in_sample = forecast.head(len(ts))
    y_true = ts.values
    y_pred = in_sample["yhat"].values[:len(y_true)]
    mets = _compute_metrics(y_true, y_pred)

    future_dates = pd.DatetimeIndex(future_fc["ds"].values)
    return preds, mets, future_dates


# ─────────────────────────────────────────────────────────────────────────────
# XGBoost / sklearn-based models
# ─────────────────────────────────────────────────────────────────────────────
def _forecast_sklearn(ts: pd.Series, horizon_days: int, model) -> Tuple[dict, dict, pd.DatetimeIndex]:
    X = _make_date_features(ts.index)
    y = ts.values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Simple walk-forward CV
    split = max(1, len(ts) // 5)
    X_train, X_test = X_scaled[:-split], X_scaled[-split:]
    y_train, y_test = y[:-split], y[-split:]
    model.fit(X_train, y_train)
    y_pred_cv = model.predict(X_test)
    mets = _compute_metrics(y_test, y_pred_cv)

    # Refit on all data
    model.fit(X_scaled, y)

    fut_dates = _future_dates(ts, horizon_days)
    X_fut = scaler.transform(_make_date_features(fut_dates))
    predictions = model.predict(X_fut)
    predictions = np.maximum(predictions, 0)

    std = np.std(y) * 0.15
    preds = {
        "mean": predictions.tolist(),
        "lower": (predictions - 1.96 * std).tolist(),
        "upper": (predictions + 1.96 * std).tolist(),
    }
    return preds, mets, fut_dates


def _forecast_xgboost(ts, horizon_days):
    if HAS_XGB:
        m = XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42, verbosity=0)
    else:
        from sklearn.ensemble import GradientBoostingRegressor
        m = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    return _forecast_sklearn(ts, horizon_days, m)


def _forecast_linear(ts, horizon_days):
    return _forecast_sklearn(ts, horizon_days, Ridge(alpha=1.0))


def _forecast_random_forest(ts, horizon_days):
    return _forecast_sklearn(ts, horizon_days, RandomForestRegressor(n_estimators=100, random_state=42))


# ─────────────────────────────────────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────────────────────────────────────
def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)
    mask = y_true != 0
    mape = mean_absolute_percentage_error(y_true[mask], y_pred[mask]) if mask.sum() > 0 else 1.0
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0
    return {"mape": min(mape, 2.0), "rmse": rmse, "r2": max(r2, 0.0)}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _fmt(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"${v/1_000_000:.2f}M"
    if abs(v) >= 1_000:
        return f"${v/1_000:.1f}K"
    return f"${v:.2f}"


def _prettify(s: str) -> str:
    return s.replace("_", " ").replace("-", " ").title()
