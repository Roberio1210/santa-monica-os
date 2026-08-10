import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { purchaseTotalValue, type PurchaseEvent } from "@/lib/inventory/purchaseAnalytics";

const NOT_INFORMED = "Não informado";

/** Tabela compacta reutilizada dentro dos modais de drill-down do módulo Produtos/Compras. */
export function PurchaseRowsDrilldown({ rows }: { rows: PurchaseEvent[] }) {
  if (rows.length === 0) return <EmptyState title="Nenhuma compra neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Produto</th>
            <th className="pb-2 pr-3 font-medium">Categoria</th>
            <th className="pb-2 pr-3 font-medium">Quantidade</th>
            <th className="pb-2 pr-3 font-medium">Preço unit.</th>
            <th className="pb-2 pr-3 font-medium">Valor total</th>
            <th className="pb-2 font-medium">Fornecedor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.movementId} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.orderDate)}</td>
              <td className="py-2 pr-3 text-foreground-muted">{row.itemName}</td>
              <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
              <td className="py-2 pr-3 text-foreground-muted">
                {row.quantity} {row.unit}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{row.unitPricePaid !== null ? formatCurrency(row.unitPricePaid) : "Sem dado"}</td>
              <td className="py-2 pr-3 font-medium text-foreground">{purchaseTotalValue(row) !== null ? formatCurrency(purchaseTotalValue(row) as number) : "Sem dado"}</td>
              <td className="py-2 text-foreground-muted">{row.supplierText ?? NOT_INFORMED}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
