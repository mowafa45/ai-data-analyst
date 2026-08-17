import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Number formatting ─────────────────────────────────────────────────────────
export function formatCurrency(value: number, compact = true): string {
  if (!isFinite(value)) return "—";
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatPercent(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatValue(value: number, format?: string): string {
  switch (format) {
    case "currency": return formatCurrency(value);
    case "percentage": return `${value.toFixed(1)}%`;
    default: return formatNumber(value);
  }
}

// ── Chart colors (Tidepool palette) ──────────────────────────────────────────
export const CHART_COLORS = [
  "#2a78d6", // blue
  "#1baf7a", // teal/green
  "#eda100", // amber
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
  "#008300", // green
];

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Truncate ──────────────────────────────────────────────────────────────────
export function truncate(str: string, maxLen = 30): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

// ── UUID ──────────────────────────────────────────────────────────────────────
export function uid(): string {
  return Math.random().toString(36).slice(2);
}
