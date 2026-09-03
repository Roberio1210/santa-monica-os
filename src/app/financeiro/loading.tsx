function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border border-border bg-background-panel ${className}`} />;
}

/**
 * Missão Financeiro 5D.6 — feedback visual imediato ao trocar de aba/período. O Next.js mostra
 * este skeleton assim que a navegação começa (mesmo em `<a href>` full-reload), enquanto os dados
 * reais carregam — nunca deixa a tela "parada" sem indicação nenhuma durante uma busca demorada.
 */
export default function FinanceiroLoading() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-16 w-full" />
      <SkeletonCard className="h-20 w-full" />
      <div className="flex gap-1 border-b border-border-subtle pb-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded bg-background-elevated" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
      <SkeletonCard className="h-48" />
    </div>
  );
}
