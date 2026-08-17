"use client";

export function SkeletonDashboard() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-7 w-20 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-8 w-full rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="skeleton h-3 w-32 rounded" />
            <div className="skeleton h-2 w-20 rounded" />
            <div className="skeleton h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* Insights */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="skeleton h-3 w-24 rounded" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="space-y-1">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-4/5 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
