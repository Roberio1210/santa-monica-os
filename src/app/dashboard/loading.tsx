function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border border-border bg-background-panel ${className}`} />;
}

/** Skeleton da Central de Operações — usado automaticamente pelo Next.js enquanto os dados reais carregam. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SkeletonCard className="h-16 w-full" />
        <SkeletonCard className="h-8 w-64" />
      </div>

      <div>
        <div className="mb-3 h-4 w-48 animate-pulse rounded bg-background-elevated" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} className="h-28" />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-background-elevated" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-48" />
      </div>
    </div>
  );
}
