import { formatNextAvailability } from "@/lib/planning/dayView";
import type { DayView } from "@/lib/planning/types";
import { formatPercent } from "@/lib/utils/format";

/**
 * Missão 40 (item 2) / Missão 43 (Parte E) — resumo operacional do dia. Nunca usa "boxes" no texto
 * (preferindo "posições"/"capacidade simultânea") e nunca hard-codeia o denominador de capacidade
 * — sempre `capacity.boxesCount` real, para acompanhar automaticamente uma futura mudança de
 * configuração. Capacidade simultânea e carga prevista recebem destaque visual (`emphasis`) por
 * serem os dois indicadores operacionais mais acionáveis do dia — mesmos dados de antes, só
 * hierarquia visual reforçada.
 */
export function DaySummaryCards({ dayView }: { dayView: DayView }) {
  const { capacity } = dayView;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryStat label="Agendamentos" value={String(dayView.appointmentCount)} />
      <SummaryStat
        label="Em atendimento agora"
        value={String(dayView.occupiedNowCount)}
        hint={dayView.occupiedNowIndeterminateCount > 0 ? `${dayView.occupiedNowIndeterminateCount} com duração indefinida` : undefined}
      />
      <SummaryStat label="Capacidade simultânea" value={capacity.configured ? `${dayView.occupiedNowCount} / ${capacity.boxesCount} posições` : "Não configurada"} emphasis />
      <SummaryStat label="Próxima disponibilidade" value={formatNextAvailability(dayView.nextAvailability)} />
      <SummaryStat
        label="Carga prevista do dia"
        value={capacity.configured ? formatPercent(capacity.percentOccupied) : "—"}
        hint={capacity.configured && capacity.appointmentsMissingDuration > 0 ? `${capacity.appointmentsMissingDuration} agendamento(s) sem duração definida.` : undefined}
        emphasis
      />
    </div>
  );
}

function SummaryStat({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${emphasis ? "border-accent/30 bg-background-panel" : "border-border-subtle bg-background-panel"}`}>
      <p className="text-[11px] text-foreground-subtle">{label}</p>
      <p className={`mt-0.5 font-semibold text-foreground ${emphasis ? "text-xl" : "text-lg"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-warning">{hint}</p> : null}
    </div>
  );
}
