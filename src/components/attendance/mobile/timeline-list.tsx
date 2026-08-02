import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { TimelineEntry } from "@/lib/attendance/timeline";

/** Lista cronológica reaproveitada pela Timeline do Cliente e pela Timeline do Veículo — mesmo formato, escopos diferentes. */
export function TimelineList({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-foreground-subtle">Nenhuma visita registrada ainda.</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map((entry) => (
        <div key={entry.visitId} className="rounded-2xl border border-border-subtle bg-background-panel p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{formatDateBR(entry.date)}</p>
            {entry.value !== null ? <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.value)}</p> : null}
          </div>

          {entry.services.length > 0 ? <p className="mt-1.5 text-sm text-foreground">{entry.services.join(", ")}</p> : <p className="mt-1.5 text-sm text-foreground-subtle">Diagnóstico em andamento</p>}

          {entry.recommendationCategories.length > 0 ? (
            <p className="mt-1 text-xs text-foreground-subtle">Recomendado: {entry.recommendationCategories.map((c) => recommendationCategoryLabel(c)).join(", ")}</p>
          ) : null}

          {entry.observations ? <p className="mt-2 text-sm text-foreground-subtle">{entry.observations}</p> : null}
        </div>
      ))}
    </div>
  );
}
