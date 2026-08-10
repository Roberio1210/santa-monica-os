import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { VehicleOrderRow } from "@/lib/integrations/jumppark/vehiclesQuery";

/** Tabela compacta de ordens reais — reutilizada nos drill-downs de Veículos (segmentos, rankings, perfil). */
export function VehicleOrderRowsDrilldown({ orders }: { orders: VehicleOrderRow[] }) {
  if (orders.length === 0) return <EmptyState title="Nenhuma ordem neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Veículo</th>
            <th className="pb-2 pr-3 font-medium">Cliente</th>
            <th className="pb-2 pr-3 font-medium">Valor</th>
            <th className="pb-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">
                <Link href={`/ordens/${o.id}`} className="text-foreground hover:text-accent">
                  {formatDateBR(o.orderDate)}
                </Link>
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{o.vehicleModel ?? "Não informado"}</td>
              <td className="py-2 pr-3 text-foreground-muted">{o.clientName ?? "Não informado"}</td>
              <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(Number(o.totalAmount))}</td>
              <td className="py-2 text-foreground-muted">{o.situation ?? "Não informado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
