"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Zap, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from "recharts";
import { useStore } from "@/lib/store";
import { runForecast } from "@/lib/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ForecastData } from "@/types";
import toast from "react-hot-toast";

const GRID_COLOR = "#1f1f26";
const AXIS_COLOR = "#35353f";
const TICK_COLOR = "#5a5a6a";

const tooltipStyle = {
  backgroundColor: "#1c1c22",
  border: "1px solid #2a2a32",
  borderRadius: "8px",
  fontSize: "11px",
  color: "#e8e8f0",
};

export function ForecastView() {
  const { sessionId, meta, forecast, setForecast } = useStore();
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState(180);

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await runForecast(sessionId, { horizon_days: horizon });
      setForecast(data);
      toast.success(`Forecast complete — ${data.model_used} selected`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Forecasting failed");
    } finally {
      setLoading(false);
    }
  };

  if (!forecast && !loading) {
    return <ForecastEmpty onRun={load} horizon={horizon} setHorizon={setHorizon} />;
  }

  if (loading) {
    return <ForecastLoading />;
  }

  return <ForecastResult forecast={forecast!} onRefresh={load} horizon={horizon} setHorizon={setHorizon} />;
}


// ── Empty state ────────────────────────────────────────────────────────────────
function ForecastEmpty({
  onRun, horizon, setHorizon,
}: { onRun: () => void; horizon: number; setHorizon: (n: number) => void }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-4xl">🔮</div>
        <h2 className="text-base font-semibold text-white">Revenue Forecasting</h2>
        <p className="text-sm text-muted leading-relaxed">
          Run ML forecasting across Prophet, XGBoost, Linear Regression, and Random Forest.
          The best model is selected automatically by MAPE.
        </p>
        <div className="flex items-center gap-2 justify-center">
          <label className="text-xs text-muted">Horizon:</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="input w-auto text-xs"
          >
            <option value={90}>3 months</option>
            <option value={180}>6 months</option>
            <option value={365}>12 months</option>
          </select>
        </div>
        <button onClick={onRun} className="btn-primary flex items-center gap-2 mx-auto">
          <Zap size={14} />
          Run Forecast
        </button>
        <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted">
          {["Prophet", "XGBoost", "Linear Regression", "Random Forest"].map((m) => (
            <span key={m} className="tag tag-muted">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Loading ────────────────────────────────────────────────────────────────────
function ForecastLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="text-3xl animate-bounce">⚙️</div>
        <div className="text-sm text-white font-medium">Training models…</div>
        <div className="text-xs text-muted">Comparing Prophet · XGBoost · Linear · Random Forest</div>
        <div className="flex gap-1 justify-center mt-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-accent-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Result ─────────────────────────────────────────────────────────────────────
function ForecastResult({
  forecast, onRefresh, horizon, setHorizon,
}: {
  forecast: ForecastData;
  onRefresh: () => void;
  horizon: number;
  setHorizon: (n: number) => void;
}) {
  const chartData = forecast.series.map((p) => ({
    date: formatDate(p.date),
    actual: p.actual ?? null,
    predicted: p.actual != null ? null : p.predicted,
    lower: p.actual != null ? null : p.lower,
    upper: p.actual != null ? null : p.upper,
  }));

  const TrendIcon = forecast.trend_direction === "up" ? TrendingUp : TrendingDown;
  const trendColor = forecast.trend_direction === "up" ? "text-green-400" : "text-red-400";

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Revenue Forecast</h2>
          <p className="text-[11px] text-muted mt-0.5">
            Model: <span className="text-accent-300">{forecast.model_used}</span> ·
            Target: {forecast.target_column} ·
            Horizon: {Math.round(forecast.horizon_days / 30)} months
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="input w-auto text-xs"
          >
            <option value={90}>3 months</option>
            <option value={180}>6 months</option>
            <option value={365}>12 months</option>
          </select>
          <button
            onClick={onRefresh}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={13} />
            Re-run
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-[11px] text-muted mb-1">Next Period</div>
          <div className="text-xl font-bold text-white">
            {formatCurrency(forecast.next_period_forecast)}
          </div>
          <div className="text-[11px] text-muted mt-0.5">{forecast.next_period_label}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-muted mb-1">Trend</div>
          <div className={cn("flex items-center gap-1.5 text-xl font-bold", trendColor)}>
            <TrendIcon size={18} />
            {forecast.trend_pct > 0 ? "+" : ""}{forecast.trend_pct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted mt-0.5">vs previous period</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] text-muted mb-1">Best Model</div>
          <div className="text-sm font-bold text-accent-300">{forecast.model_used}</div>
          <div className="text-[11px] text-muted mt-0.5">
            MAPE: {forecast.model_metrics.find((m) => m.selected)?.mape.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Main forecast chart */}
      <div className="card p-4">
        <div className="text-[12px] font-semibold text-white mb-1">
          Forecast with Confidence Interval
        </div>
        <div className="text-[10px] text-muted mb-3">
          Historical (solid) · Predicted (dashed) · 95% confidence band
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="date"
                tick={{ fill: TICK_COLOR, fontSize: 9 }}
                axisLine={{ stroke: AXIS_COLOR }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: TICK_COLOR, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v, true)}
                width={60}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [
                  formatCurrency(v),
                  name === "actual" ? "Historical" : name === "predicted" ? "Forecast" : name,
                ]}
              />
              {/* Confidence band */}
              <Area
                dataKey="upper"
                stroke="transparent"
                fill="#10b98122"
                connectNulls={false}
              />
              <Area
                dataKey="lower"
                stroke="transparent"
                fill="#ffffff00"
                connectNulls={false}
              />
              {/* Lines */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#2a78d6"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model comparison + Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-[12px] font-semibold text-white mb-3">Model Comparison</div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecast.model_metrics} barSize={20}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: TICK_COLOR, fontSize: 8 }}
                  axisLine={{ stroke: AXIS_COLOR }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: TICK_COLOR, fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "MAPE (lower = better)"]}
                />
                <Bar dataKey="mape" radius={[3, 3, 0, 0]}>
                  {forecast.model_metrics.map((m, i) => (
                    <Cell
                      key={i}
                      fill={m.selected ? "#10b981" : "#2a2a32"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-[12px] font-semibold text-white mb-3">Forecast Summary</div>
          <p className="text-[12px] text-muted leading-relaxed">{forecast.summary}</p>
          <div className="mt-3 space-y-1">
            {forecast.model_metrics.map((m) => (
              <div key={m.name} className={cn(
                "flex items-center justify-between text-[11px] px-2 py-1 rounded",
                m.selected ? "bg-green-500/10 text-green-300" : "text-muted"
              )}>
                <span>{m.selected ? "★ " : ""}{m.name}</span>
                <span>MAPE {m.mape.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
