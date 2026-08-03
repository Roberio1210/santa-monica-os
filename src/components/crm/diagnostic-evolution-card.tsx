import { DIAGNOSTIC_AREA_LABELS } from "@/lib/attendance/types";
import type { DiagnosticAreaEvolution } from "@/lib/crm-intelligente/types";

/** "Memória Técnica do Veículo" (Missão 21) — só aparece quando existem 2+ diagnósticos reais. */
export function DiagnosticEvolutionCard({ evolution }: { evolution: DiagnosticAreaEvolution[] | null }) {
  if (!evolution) {
    return <p className="rounded-xl border border-dashed border-border-subtle p-3 text-xs text-foreground-subtle">Memória técnica disponível a partir do 2º diagnóstico deste veículo.</p>;
  }

  return (
    <div className="space-y-1.5">
      {evolution.map((item) => (
        <div key={item.area} className="rounded-lg border border-border-subtle bg-background-elevated p-2.5 text-xs">
          <p className="font-medium text-foreground">{DIAGNOSTIC_AREA_LABELS[item.area]}</p>
          <p className="mt-0.5 text-foreground-subtle">
            Última visita: {item.previous} {item.changed ? "→" : "·"} Hoje: <span className={item.changed ? "font-medium text-foreground" : undefined}>{item.current}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
