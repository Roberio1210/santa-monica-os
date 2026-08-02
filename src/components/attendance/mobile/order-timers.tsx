import { formatDurationMinutes } from "@/lib/utils/format";
import { computeOrderTimers } from "@/lib/attendance/timers";
import type { ServiceOrderStatus } from "@/lib/attendance/types";

/**
 * Cronômetro da Ordem de Serviço — 3 números, cada um só aparece quando é honestamente
 * calculável (ver `timers.ts`): "Em execução" só durante o status `em_execucao`, "Tempo total"
 * só depois de `entregue`. Nunca preenche com um valor estimado no lugar de "—".
 */
export function OrderTimers({ status, visitCreatedAt, updatedAt }: { status: ServiceOrderStatus; visitCreatedAt: string; updatedAt: string }) {
  const timers = computeOrderTimers({ status, visitCreatedAt, updatedAt });

  return (
    <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
      <p className="text-xs text-foreground-subtle">Cronômetro</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <TimerStat label="Desde a entrada" value={formatDurationMinutes(timers.sinceEntryMinutes)} />
        <TimerStat label="Em execução" value={timers.inExecutionMinutes !== null ? formatDurationMinutes(timers.inExecutionMinutes) : "—"} />
        <TimerStat label="Tempo total" value={timers.totalMinutes !== null ? formatDurationMinutes(timers.totalMinutes) : "—"} />
      </div>
    </div>
  );
}

function TimerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-foreground-subtle">{label}</p>
    </div>
  );
}
