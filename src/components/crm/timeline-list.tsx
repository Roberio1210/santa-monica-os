import { Camera, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { DIAGNOSTIC_AREA_LABELS, SERVICE_ORDER_STATUS_LABELS } from "@/lib/attendance/types";
import { DISCOUNT_REASON_LABELS } from "@/lib/manager-assistant/types";
import { formatCurrency, formatDateBR, formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";
import type { CrmTimelineEntry } from "@/lib/crm-intelligente/types";

/** Timeline completa do CRM (Missão 21) — cada campo pedido, um a um, todos reais. */
export function CrmTimelineList({ entries }: { entries: CrmTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground-subtle">Nenhuma visita registrada ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const date = new Date(entry.dateIso);
        return (
          <div key={entry.visitId} className="rounded-xl border border-border-subtle bg-background-panel p-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {formatDateBR(saoPauloDateISO(date))} · {saoPauloTimeHM(date)}
              </span>
              {entry.status ? <Badge variant="outline">{SERVICE_ORDER_STATUS_LABELS[entry.status]}</Badge> : null}
            </div>

            {entry.services.length > 0 ? <p className="mt-1.5 text-foreground-subtle">Serviços aprovados: {entry.services.join(", ")}</p> : null}

            {entry.diagnosticIssues.length > 0 ? (
              <div className="mt-1.5">
                <p className="text-xs font-medium text-foreground-muted">Diagnóstico</p>
                <ul className="ml-3 list-disc text-xs text-foreground-subtle">
                  {entry.diagnosticIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {entry.diagnosticObservations ? <p className="mt-1.5 rounded-lg bg-background-elevated p-2 text-xs text-foreground-subtle">{entry.diagnosticObservations}</p> : null}

            {entry.photos.length > 0 ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground-subtle">
                <Camera className="h-3.5 w-3.5" />
                {entry.photos.length} foto{entry.photos.length > 1 ? "s" : ""} ({entry.photos.map((p) => DIAGNOSTIC_AREA_LABELS[p.area]).join(", ")})
              </p>
            ) : null}

            {entry.recommendations.length > 0 ? (
              <div className="mt-1.5">
                <p className="text-xs font-medium text-foreground-muted">Recomendações técnicas</p>
                <ul className="ml-3 list-disc text-xs text-foreground-subtle">
                  {entry.recommendations.map((r, idx) => (
                    <li key={`${r.category}-${idx}`}>
                      {recommendationCategoryLabel(r.category)}
                      {r.observations ? ` — ${r.observations}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {entry.discounts.length > 0 ? (
              <div className="mt-1.5 space-y-1">
                {entry.discounts.map((d) => (
                  <p key={d.id} className="flex items-center gap-1.5 text-xs text-foreground-subtle">
                    <Tag className="h-3.5 w-3.5" />
                    Desconto de {formatCurrency(d.discountAmount)} ({d.discountPercent}%) — {DISCOUNT_REASON_LABELS[d.reason]}
                  </p>
                ))}
              </div>
            ) : null}

            {entry.executionMinutes !== null ? <p className="mt-1.5 text-xs text-foreground-subtle">Tempo de execução: {formatDurationMinutes(entry.executionMinutes)}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
