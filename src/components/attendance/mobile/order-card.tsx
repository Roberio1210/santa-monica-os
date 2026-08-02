import Link from "next/link";
import { Clock, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatElapsedTime } from "@/lib/utils/format";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { SERVICE_ORDER_STATUS_LABELS, type ManagerBoardOrder } from "@/lib/attendance/types";

const STATUS_DOT_CLASSES: Record<ManagerBoardOrder["status"], string> = {
  recebido: "bg-foreground-subtle",
  diagnostico: "bg-foreground-subtle",
  aguardando_execucao: "bg-foreground-subtle",
  em_execucao: "bg-accent",
  aguardando_conferencia: "bg-warning",
  pronto_entrega: "bg-positive",
  entregue: "bg-positive",
};

function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Card de uma Ordem de Serviço — mesmo formato em Execução e Entregas. "Equipe" é sempre o responsável exibido nesta sprint: não há atribuição individual de técnico ainda (nunca inventada aqui). */
export function OrderCard({ order }: { order: ManagerBoardOrder }) {
  return (
    <Link
      href={`/atendimento/ordens/${order.serviceOrderId}`}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-background-panel p-4 transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASSES[order.status])} />
          <p className="truncate text-base font-medium text-foreground">{order.vehicleModel ?? "Veículo"}</p>
        </div>
        <p className="mt-0.5 truncate text-sm text-foreground-subtle">
          {order.vehiclePlate ?? "Placa não informada"} · {order.customerName ?? "Cliente"}
        </p>
        <p className="mt-0.5 truncate text-sm text-foreground-subtle">{order.serviceNames.length > 0 ? order.serviceNames.join(", ") : "Diagnóstico em andamento"}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-foreground-subtle">
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            Equipe
          </span>
          <span>{formatClockTime(order.visitCreatedAt)}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsedTime(order.visitCreatedAt)}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-xs font-medium text-foreground-subtle">{SERVICE_ORDER_STATUS_LABELS[order.status]}</span>
    </Link>
  );
}
