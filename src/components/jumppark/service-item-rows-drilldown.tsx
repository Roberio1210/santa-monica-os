import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { EnrichedServiceItem } from "@/lib/integrations/jumppark/serviceAnalytics";

const NOT_INFORMED = "Não informado";

/** Tabela compacta de itens de serviço reais — usada nos drill-downs dos KPIs da visão geral de Serviços. */
export function ServiceItemRowsDrilldown({ items }: { items: EnrichedServiceItem[] }) {
  if (items.length === 0) return <EmptyState title="Nenhum serviço neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Serviço</th>
            <th className="pb-2 pr-3 font-medium">Cliente</th>
            <th className="pb-2 pr-3 font-medium">Veículo</th>
            <th className="pb-2 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.orderId}-${item.category}-${index}`} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">
                <Link href={`/ordens/${item.orderId}`} className="text-foreground hover:text-accent">
                  {formatDateBR(item.orderDate)}
                </Link>
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{item.category}</td>
              <td className="py-2 pr-3 text-foreground-muted">
                {item.customerId ? (
                  <Link href={`/ordens/clientes/${item.customerId}`} className="hover:text-accent">
                    {item.customerName ?? NOT_INFORMED}
                  </Link>
                ) : (
                  (item.customerName ?? NOT_INFORMED)
                )}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">
                {item.vehicleId ? (
                  <Link href={`/ordens/veiculos/${item.vehicleId}`} className="hover:text-accent">
                    {item.vehicleModel ?? NOT_INFORMED}
                  </Link>
                ) : (
                  (item.vehicleModel ?? NOT_INFORMED)
                )}
              </td>
              <td className="py-2 font-medium text-foreground">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
