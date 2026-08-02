import Link from "next/link";
import { Clock } from "lucide-react";
import { formatDurationMinutes } from "@/lib/utils/format";
import { computeOrderTimers } from "@/lib/attendance/timers";
import type { ManagerBoardOrder } from "@/lib/attendance/types";

/**
 * Card da seção "Em Execução" da Gestão do Dia — "tempo desde início" é o tempo em execução
 * (desde a última mudança de status, que é exatamente quando entrou em execução — ver
 * `timers.ts`), não o tempo desde a entrada do carro. Sem campo de funcionário: não há
 * atribuição individual de técnico nesta versão (nunca inventado aqui).
 */
export function ExecutionMiniCard({ order }: { order: ManagerBoardOrder }) {
  const timers = computeOrderTimers({ status: order.status, visitCreatedAt: order.visitCreatedAt, updatedAt: order.updatedAt });

  return (
    <Link
      href={`/atendimento/ordens/${order.serviceOrderId}`}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-background-panel p-4 transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-foreground">{order.vehicleModel ?? "Veículo"}</p>
        <p className="mt-0.5 truncate text-sm text-foreground-subtle">{order.customerName ?? "Cliente"}</p>
        <p className="mt-0.5 truncate text-sm text-foreground-subtle">{order.serviceNames.length > 0 ? order.serviceNames.join(", ") : "Diagnóstico em andamento"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground-subtle">
        <Clock className="h-3.5 w-3.5" />
        {timers.inExecutionMinutes !== null ? formatDurationMinutes(timers.inExecutionMinutes) : "—"}
      </div>
    </Link>
  );
}
