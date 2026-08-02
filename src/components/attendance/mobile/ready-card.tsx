import Link from "next/link";
import { formatCurrency } from "@/lib/utils/format";
import type { ManagerBoardOrder } from "@/lib/attendance/types";

/** Card da seção "Prontos" da Gestão do Dia — veículos aguardando entrega. */
export function ReadyCard({ order }: { order: ManagerBoardOrder }) {
  return (
    <Link
      href={`/atendimento/ordens/${order.serviceOrderId}`}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-background-panel p-4 transition-transform active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-foreground">{order.vehicleModel ?? "Veículo"}</p>
        <p className="mt-0.5 truncate text-sm text-foreground-subtle">{order.customerName ?? "Cliente"}</p>
      </div>
      <span className="shrink-0 text-base font-semibold text-positive">{formatCurrency(order.totalValue)}</span>
    </Link>
  );
}
