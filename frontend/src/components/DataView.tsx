"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { useStore } from "@/lib/store";
import { getPreview } from "@/lib/api";
import { cn, truncate } from "@/lib/utils";

const DTYPE_COLORS: Record<string, string> = {
  numeric:     "tag-blue",
  categorical: "tag-amber",
  datetime:    "tag-green",
  boolean:     "tag-purple",
  text:        "tag-muted",
};

const DTYPE_ICONS: Record<string, string> = {
  numeric:     "🔢",
  categorical: "🏷",
  datetime:    "📅",
  boolean:     "☑",
  text:        "📝",
};

const PAGE_SIZE = 50;

export function DataView() {
  const { sessionId, meta } = useStore();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getPreview(sessionId, PAGE_SIZE, page * PAGE_SIZE);
        setData(res.data);
        setTotalRows(res.total_rows);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, page]);

  const columns = meta?.columns ?? [];
  const visibleCols = columns.slice(0, 12);
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Database size={14} className="text-accent-300" />
            {meta?.filename}
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            {totalRows.toLocaleString()} rows · {meta?.col_count} columns ·{" "}
            {meta?.duplicates_removed} duplicates removed · {meta?.missing_handled} nulls filled
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {meta?.missing_handled ? (
            <span className="tag tag-amber">△ {meta.missing_handled} nulls filled</span>
          ) : null}
          {meta?.duplicates_removed === 0 && (
            <span className="tag tag-green">✓ No duplicates</span>
          )}
          {meta?.detected_date_col && (
            <span className="tag tag-blue">📅 Dates parsed</span>
          )}
        </div>
      </div>

      {/* Column info */}
      <div className="card p-4">
        <div className="text-[11px] font-semibold text-white mb-3">Column Overview</div>
        <div className="flex flex-wrap gap-2">
          {columns.map((col) => (
            <div
              key={col.name}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 rounded-lg border border-border text-[11px]"
            >
              <span>{DTYPE_ICONS[col.dtype]}</span>
              <span className="text-white font-medium">{truncate(col.name, 18)}</span>
              <span className={cn("tag text-[9px]", DTYPE_COLORS[col.dtype])}>
                {col.dtype}
              </span>
              {col.null_pct > 0 && (
                <span className="text-muted text-[9px]">{col.null_pct.toFixed(0)}% null</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="px-3 py-2 text-left text-muted font-medium whitespace-nowrap border-b border-border w-10">
                  #
                </th>
                {visibleCols.map((col) => (
                  <th
                    key={col.name}
                    className="px-3 py-2 text-left text-muted font-medium whitespace-nowrap border-b border-border"
                  >
                    <div className="flex items-center gap-1">
                      {col.name}
                      <span className={cn("tag text-[9px]", DTYPE_COLORS[col.dtype])}>
                        {col.dtype.slice(0, 3)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 border-b border-border">
                        <div className="skeleton h-3 w-6 rounded" />
                      </td>
                      {visibleCols.map((col) => (
                        <td key={col.name} className="px-3 py-2 border-b border-border">
                          <div className="skeleton h-3 w-16 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data.map((row, rowIdx) => (
                    <motion.tr
                      key={rowIdx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: rowIdx * 0.01 }}
                      className="hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-3 py-2 border-b border-border text-muted">
                        {page * PAGE_SIZE + rowIdx + 1}
                      </td>
                      {visibleCols.map((col) => {
                        const val = row[col.name];
                        const display = val === null || val === undefined ? "" : String(val);
                        return (
                          <td
                            key={col.name}
                            className="px-3 py-2 border-b border-border text-white whitespace-nowrap"
                          >
                            {col.dtype === "categorical" ? (
                              <span className="tag tag-amber text-[9px]">
                                {truncate(display, 16)}
                              </span>
                            ) : col.dtype === "numeric" ? (
                              <span className="text-green-400 font-mono">
                                {display}
                              </span>
                            ) : col.dtype === "datetime" ? (
                              <span className="text-blue-300">{display.slice(0, 10)}</span>
                            ) : (
                              <span className="text-muted">{truncate(display, 24)}</span>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="text-[11px] text-muted">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} of{" "}
            {totalRows.toLocaleString()} rows
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded-lg hover:bg-surface-2 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded-lg hover:bg-surface-2 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
