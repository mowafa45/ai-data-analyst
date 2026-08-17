"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, AlertCircle, Sparkles } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn, formatFileSize } from "@/lib/utils";
import toast from "react-hot-toast";

const DEMO_DATASETS = [
  { id: "sales",     label: "🛍  Sales Report",   desc: "12.8K orders, Q1-Q4 2024" },
  { id: "ecommerce", label: "🛒  E-Commerce",      desc: "45K transactions, multi-region" },
  { id: "finance",   label: "💰  Finance Report",  desc: "8.3K entries, P&L data" },
];

const STEPS = [
  "Reading file structure…",
  "Detecting column types…",
  "Handling missing values…",
  "Removing duplicates…",
  "Generating insights…",
  "Building dashboard…",
];

export function UploadView() {
  const { setSession, setLoading } = useStore();
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);

      // Animate through steps
      let stepIdx = 0;
      const stepTimer = setInterval(() => {
        if (stepIdx < STEPS.length) {
          setStepLabel(STEPS[stepIdx]);
          setProgress(Math.round(((stepIdx + 1) / STEPS.length) * 90));
          stepIdx++;
        }
      }, 500);

      try {
        const result = await uploadFile(file);
        clearInterval(stepTimer);
        setProgress(100);
        setStepLabel("Done!");
        await new Promise((r) => setTimeout(r, 400));

        setSession(result.session_id, result.meta, result.preview);
        toast.success(`Loaded ${result.meta.row_count.toLocaleString()} rows from ${file.name}`);
      } catch (err: unknown) {
        clearInterval(stepTimer);
        const msg = err instanceof Error ? err.message : "Upload failed";
        setError(msg);
        toast.error(msg);
      } finally {
        setIsProcessing(false);
        setProgress(0);
        setStepLabel("");
      }
    },
    [setSession]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) processFile(accepted[0]);
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxSize: 100 * 1024 * 1024, // 100 MB
    multiple: false,
    disabled: isProcessing,
  });

  const loadDemo = async (id: string) => {
    // For demo purposes, create a synthetic CSV and upload it
    const demoData = generateDemoCSV(id);
    const blob = new Blob([demoData], { type: "text/csv" });
    const file = new File([blob], `${id}_demo.csv`, { type: "text/csv" });
    processFile(file);
  };

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-300 text-xs mb-4">
            <Sparkles size={12} />
            AI-powered analytics
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Upload your dataset
          </h2>
          <p className="text-sm text-muted">
            Drop a CSV or Excel file to get instant dashboards, insights, and AI chat.
          </p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200",
            isDragActive
              ? "border-accent-500 bg-accent-500/5"
              : "border-border-strong hover:border-accent-500/50 hover:bg-surface-1",
            isProcessing && "pointer-events-none"
          )}
        >
          <input {...getInputProps()} />

          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="text-3xl">⚙️</div>
                <div className="text-sm font-medium text-white">{stepLabel}</div>
                <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-accent-500 to-purple-500 rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <div className="text-xs text-muted">{progress}% complete</div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="text-4xl">📂</div>
                <div className="text-base font-medium text-white">
                  {isDragActive ? "Drop it here…" : "Drag & drop your file"}
                </div>
                <div className="text-sm text-muted">
                  or{" "}
                  <span className="text-accent-300 hover:underline cursor-pointer">
                    browse to upload
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {[".csv", ".xlsx", ".xls"].map((ext) => (
                    <span key={ext} className="tag tag-muted">{ext}</span>
                  ))}
                  <span className="tag tag-muted">≤ 100 MB</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error */}
        {(error || fileRejections.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-300">
              {error || fileRejections[0]?.errors[0]?.message || "Invalid file"}
            </p>
          </motion.div>
        )}

        {/* Demo datasets */}
        <div>
          <div className="text-xs text-muted text-center mb-3">Or try a demo dataset</div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_DATASETS.map((demo) => (
              <button
                key={demo.id}
                onClick={() => !isProcessing && loadDemo(demo.id)}
                disabled={isProcessing}
                className="p-3 rounded-lg bg-surface-1 border border-border hover:border-accent-500/40 hover:bg-surface-2
                           text-left transition-all duration-150 disabled:opacity-50"
              >
                <div className="text-xs font-medium text-white mb-0.5">{demo.label}</div>
                <div className="text-[10px] text-muted">{demo.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: "🔍", label: "Auto column detection" },
            { icon: "🧹", label: "Data cleaning" },
            { icon: "📊", label: "Instant dashboard" },
            { icon: "🤖", label: "AI-powered insights" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-2 text-xs text-muted">
              <span>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Demo data generator ────────────────────────────────────────────────────────
function generateDemoCSV(type: string): string {
  const products = ["MacBook Pro", "iPhone 15", "Sony PS5", "Samsung TV", "iPad Air", "Nike Shoes", "Levi's Jeans", "Coffee Table"];
  const categories = ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Clothing", "Clothing", "Home"];
  const regions = ["North America", "APAC", "Europe", "LATAM", "MEA"];
  const customers = Array.from({ length: 50 }, (_, i) => `CUST${String(i + 1001).padStart(4, "0")}`);

  const header = "order_id,date,product_name,category,region,units,unit_price,revenue,profit,customer_id";
  const rows: string[] = [header];

  const startDate = new Date("2024-01-01");
  for (let i = 0; i < (type === "ecommerce" ? 500 : 200); i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.floor(Math.random() * 365));
    const pIdx = Math.floor(Math.random() * products.length);
    const unitPrice = [2499, 999, 549, 1299, 749, 120, 79, 349][pIdx];
    const units = Math.ceil(Math.random() * 5);
    const revenue = unitPrice * units;
    const profit = revenue * (0.25 + Math.random() * 0.2);

    rows.push([
      i + 1001,
      d.toISOString().split("T")[0],
      products[pIdx],
      categories[pIdx],
      regions[Math.floor(Math.random() * regions.length)],
      units,
      unitPrice,
      revenue.toFixed(2),
      profit.toFixed(2),
      customers[Math.floor(Math.random() * customers.length)],
    ].join(","));
  }
  return rows.join("\n");
}
