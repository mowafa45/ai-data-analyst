"use client";

import { motion } from "framer-motion";
import { Lightbulb, Target } from "lucide-react";
import type { InsightItem } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  insights: InsightItem[];
  recommendations: string[];
}

const TYPE_STYLES: Record<string, string> = {
  positive: "border-l-green-500 bg-green-500/5",
  negative: "border-l-red-500 bg-red-500/5",
  warning:  "border-l-amber-500 bg-amber-500/5",
  neutral:  "border-l-blue-500 bg-blue-500/5",
};

export function InsightsPanel({ insights, recommendations }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Insights */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={14} className="text-accent-300" />
          <span className="text-[12px] font-semibold text-white">AI Insights</span>
          <span className="tag tag-purple text-[10px]">Auto-generated</span>
        </div>
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <motion.div
              key={ins.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "flex gap-3 p-3 rounded-lg border-l-2",
                TYPE_STYLES[ins.type] ?? TYPE_STYLES.neutral
              )}
            >
              <span className="text-base flex-shrink-0 mt-0.5">{ins.emoji}</span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-white mb-0.5">
                  {ins.headline}
                </div>
                <div className="text-[11px] text-muted leading-relaxed">{ins.detail}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted/60">
                    {ins.columns_used.join(", ")}
                  </span>
                  <span className="text-[10px] tag tag-muted">
                    {Math.round(ins.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-green-400" />
          <span className="text-[12px] font-semibold text-white">Recommendations</span>
        </div>
        <div className="space-y-2">
          {recommendations.map((rec, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-2.5 p-3 bg-surface-2 rounded-lg"
            >
              <span className="text-[11px] font-bold text-accent-300 flex-shrink-0 mt-0.5">
                {i + 1}.
              </span>
              <span className="text-[12px] text-white leading-relaxed">{rec}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
