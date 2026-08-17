"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { getDashboard } from "@/lib/api";
import { KPICardWidget } from "./KPICardWidget";
import { ChartWidget } from "./ChartWidget";
import { InsightsPanel } from "./InsightsPanel";
import { SkeletonDashboard } from "./SkeletonDashboard";
import toast from "react-hot-toast";

export function DashboardView() {
  const { sessionId, dashboard, setDashboard, isLoading, setLoading } = useStore();

  useEffect(() => {
    if (!sessionId || dashboard) return;

    const load = async () => {
      setLoading(true, "Generating dashboard…");
      try {
        const data = await getDashboard(sessionId);
        setDashboard(data);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, dashboard, setDashboard, setLoading]);

  if (isLoading || !dashboard) return <SkeletonDashboard />;

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="p-5 space-y-4"
    >
      {/* KPI cards */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {dashboard.kpis.map((kpi, i) => (
          <KPICardWidget key={i} kpi={kpi} />
        ))}
      </motion.div>

      {/* Charts grid */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dashboard.charts.slice(0, 4).map((chart, i) => (
          <ChartWidget key={i} chart={chart} />
        ))}
      </motion.div>

      {/* Insights */}
      <motion.div variants={item}>
        <InsightsPanel
          insights={dashboard.insights}
          recommendations={dashboard.recommendations}
        />
      </motion.div>

      {/* Additional charts */}
      {dashboard.charts.length > 4 && (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashboard.charts.slice(4).map((chart, i) => (
            <ChartWidget key={i + 4} chart={chart} />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
