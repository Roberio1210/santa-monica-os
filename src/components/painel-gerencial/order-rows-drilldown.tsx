import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ManagementOrderRow } from "@/lib/painel-gerencial/types";

/** Tabela compacta reutilizada dentro dos modais de drill-down do Painel Gerencial — mesma linha (`ManagementOrderRow`) da tabela completa, versão enxuta para caber num modal. */
export function OrderRowsDrilldown({ orders }: { orders: ManagementOrderRow[] }) {
  if (orders.length === 0) return <EmptyState title="Nenhuma ordem neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Cliente</th>
            <th className="pb-2 pr-3 font-medium">Veículo</th>
            <th className="pb-2 pr-3 font-medium">Serviços</th>
            <th className="pb-2 font-medium">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.externalId} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(o.date)}</td>
              <td className="py-2 pr-3 text-foreground-muted">{o.customerName ?? "Não informado"}</td>
              <td className="py-2 pr-3 text-foreground-muted">{o.vehicleModel}</td>
              <td className="py-2 pr-3 text-foreground-muted">{o.serviceLines.map((s) => s.description).join(", ") || "—"}</td>
              <td className="py-2 font-medium text-foreground">{formatCurrency(o.netAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
