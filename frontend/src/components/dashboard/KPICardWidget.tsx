"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import type { KPICard } from "@/types";
import { cn } from "@/lib/utils";

interface Props { kpi: KPICard; }

export function KPICardWidget({ kpi }: Props) {
  const trendColor =
    kpi.trend === "up"   ? "text-green-400" :
    kpi.trend === "down" ? "text-red-400"   : "text-muted";

  const TrendIcon =
    kpi.trend === "up"   ? TrendingUp  :
    kpi.trend === "down" ? TrendingDown : Minus;

  const sparkData = kpi.sparkline.map((v, i) => ({ i, v }));

  const sparkColor =
    kpi.trend === "up"   ? "#10b981" :
    kpi.trend === "down" ? "#ef4444" : "#6366f1";

  return (
    <div className="card p-4 space-y-2 hover:border-border-strong transition-colors">
      {/* Label */}
      <div className="text-[11px] text-muted font-medium">{kpi.label}</div>

      {/* Value */}
      <div className="text-2xl font-bold text-white tracking-tight leading-none">
        {kpi.value}
      </div>

      {/* Delta */}
      {kpi.delta_pct !== undefined && (
        <div className={cn("flex items-center gap-1 text-[11px] font-medium", trendColor)}>
          <TrendIcon size={11} />
          <span>
            {kpi.delta_pct > 0 ? "+" : ""}
            {kpi.delta_pct.toFixed(1)}%
          </span>
          {kpi.delta_label && (
            <span className="text-muted font-normal">{kpi.delta_label}</span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {sparkData.length > 2 && (
        <div className="h-8 opacity-70">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
