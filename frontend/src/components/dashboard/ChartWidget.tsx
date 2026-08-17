"use client";

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { ChartData } from "@/types";
import { CHART_COLORS, formatValue, truncate } from "@/lib/utils";

interface Props {
  chart: ChartData;
  height?: number;
}

const GRID_COLOR = "#1f1f26";
const AXIS_COLOR = "#35353f";
const TICK_COLOR = "#5a5a6a";

const tooltipStyle = {
  backgroundColor: "#1c1c22",
  border: "1px solid #2a2a32",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e8e8f0",
};

export function ChartWidget({ chart, height = 160 }: Props) {
  // Build recharts-compatible data
  const data = chart.labels.map((label, i) => {
    const entry: Record<string, unknown> = { label: truncate(String(label), 12) };
    chart.datasets.forEach((ds) => {
      entry[ds.label] = (ds.data[i] as number) ?? null;
    });
    return entry;
  });

  const formatTick = (v: number) => formatValue(v, chart.y_format ?? "number");
  const formatTooltip = (v: number) => formatValue(v, chart.y_format ?? "number");

  const commonAxis = {
    xAxis: (
      <XAxis
        dataKey="label"
        tick={{ fill: TICK_COLOR, fontSize: 10 }}
        axisLine={{ stroke: AXIS_COLOR }}
        tickLine={false}
      />
    ),
    yAxis: (
      <YAxis
        tick={{ fill: TICK_COLOR, fontSize: 10 }}
        axisLine={false}
        tickLine={false}
        tickFormatter={formatTick}
        width={52}
      />
    ),
    grid: <CartesianGrid vertical={false} stroke={GRID_COLOR} />,
    tooltip: (
      <Tooltip
        contentStyle={tooltipStyle}
        formatter={(v: number) => [formatTooltip(v)]}
        cursor={{ fill: "rgba(255,255,255,0.03)" }}
      />
    ),
  };

  const renderChart = () => {
    switch (chart.chart_type) {
      case "bar":
        return (
          <BarChart data={data} barSize={18}>
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            {commonAxis.tooltip}
            {chart.datasets.map((ds, i) => (
              <Bar
                key={ds.label}
                dataKey={ds.label}
                fill={ds.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case "line":
        return (
          <LineChart data={data}>
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            {commonAxis.tooltip}
            {chart.datasets.map((ds, i) => (
              <Line
                key={ds.label}
                type="monotone"
                dataKey={ds.label}
                stroke={ds.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart data={data}>
            {commonAxis.grid}
            {commonAxis.xAxis}
            {commonAxis.yAxis}
            {commonAxis.tooltip}
            {chart.datasets.map((ds, i) => {
              const color = ds.color ?? CHART_COLORS[i % CHART_COLORS.length];
              return (
                <Area
                  key={ds.label}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={color}
                  fill={`${color}22`}
                  strokeWidth={2}
                  dot={false}
                />
              );
            })}
          </AreaChart>
        );

      case "pie":
      case "doughnut": {
        const pieData = chart.labels.map((label, i) => ({
          name: label,
          value: (chart.datasets[0]?.data[i] as number) ?? 0,
        }));
        return (
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={chart.chart_type === "doughnut" ? "55%" : 0}
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatTooltip(v)]} />
            <Legend
              iconSize={8}
              iconType="circle"
              formatter={(value) => (
                <span style={{ color: TICK_COLOR, fontSize: "10px" }}>
                  {truncate(String(value), 16)}
                </span>
              )}
            />
          </PieChart>
        );
      }

      case "scatter": {
        const scatterData = (chart.datasets[0]?.data ?? []) as { x: number; y: number }[];
        return (
          <ScatterChart>
            {commonAxis.grid}
            <XAxis
              dataKey="x"
              type="number"
              name={chart.x_label}
              tick={{ fill: TICK_COLOR, fontSize: 10 }}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={chart.y_label}
              tick={{ fill: TICK_COLOR, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={scatterData} fill={CHART_COLORS[0]} opacity={0.7} />
          </ScatterChart>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[12px] font-semibold text-white">{chart.title}</div>
          {chart.subtitle && (
            <div className="text-[10px] text-muted mt-0.5">{chart.subtitle}</div>
          )}
        </div>
        <span className="tag tag-muted capitalize text-[10px]">{chart.chart_type}</span>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() ?? <div />}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
