import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatDurationMinutes, formatElapsedTime } from "@/lib/utils/format";
import { minutesSince } from "@/lib/attendance/timers";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { SERVICE_ORDER_STATUS_LABELS, type ManagerBoardOrder } from "@/lib/attendance/types";

const STATUS_BADGE_VARIANT: Record<ManagerBoardOrder["status"], BadgeProps["variant"]> = {
  recebido: "default",
  diagnostico: "default",
  aguardando_execucao: "default",
  em_execucao: "info",
  aguardando_conferencia: "warning",
  pronto_entrega: "positive",
  entregue: "positive",
};

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Card reaproveitado nas 3 filas da Central de Operações (Execução/Conferência/Prontos) — só
 * muda o rótulo do cronômetro de estágio. `stageLabel` sempre mede `agora - updatedAt`: como o
 * schema só guarda a última mudança de status, `updatedAt` é exatamente o momento em que a ordem
 * entrou no estágio atual (ver `operationsCenter.ts`).
 */
export function OperationsOrderCard({ order, stageLabel }: { order: ManagerBoardOrder; stageLabel: string }) {
  const stageMinutes = minutesSince(order.updatedAt);

  return (
    <Link
      href={`/atendimento/ordens/${order.serviceOrderId}`}
      className="block rounded-xl border border-border bg-background-panel p-4 transition-colors hover:border-accent/50 hover:bg-background-elevated"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {order.vehicleModel ?? "Veículo"} {order.vehiclePlate ? `· ${order.vehiclePlate}` : ""}
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground-muted">{order.customerName ?? "Cliente"}</p>
          <p className="mt-0.5 truncate text-xs text-foreground-subtle">{order.serviceNames.length > 0 ? order.serviceNames.join(", ") : "Diagnóstico em andamento"}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[order.status]}>{SERVICE_ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-subtle">
        <span>
          Entrou às {formatClockTime(order.visitCreatedAt)} · {formatElapsedTime(order.visitCreatedAt)} desde a entrada
        </span>
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Clock className="h-3.5 w-3.5" />
          {stageLabel} {formatDurationMinutes(stageMinutes)}
        </span>
      </div>
    </Link>
  );
}
