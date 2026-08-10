import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { movementTypeLabels, type StockMovement } from "@/lib/inventory/types";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

/** Tabela compacta reutilizada nos modais de drill-down do módulo gerencial de Estoque (Missão 34). */
export function MovementRowsDrilldown({ rows, showItem = true }: { rows: (StockMovement & { itemName: string })[]; showItem?: boolean }) {
  if (rows.length === 0) return <EmptyState title="Nenhuma movimentação neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            {showItem ? <th className="pb-2 pr-3 font-medium">Produto</th> : null}
            <th className="pb-2 pr-3 font-medium">Tipo</th>
            <th className="pb-2 pr-3 font-medium">Quantidade</th>
            <th className="pb-2 pr-3 font-medium">Saldo antes → depois</th>
            <th className="pb-2 pr-3 font-medium">Fornecedor</th>
            <th className="pb-2 font-medium">Responsável</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.date)}</td>
              {showItem ? (
                <td className="py-2 pr-3">
                  <Link href={`/estoque/produtos/${row.itemId}`} className="text-foreground hover:text-accent">
                    {row.itemName}
                  </Link>
                </td>
              ) : null}
              <td className="py-2 pr-3">
                <Badge variant="outline">{movementTypeLabels[row.type] ?? row.type}</Badge>
              </td>
              <td className="py-2 pr-3 text-foreground-muted">
                {row.quantity} {row.unit}
                {row.unitPricePaid !== null && row.unitPricePaid !== undefined ? ` · ${formatCurrency(row.unitPricePaid)}/un.` : ""}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">
                {row.previousBalance ?? "—"} → {row.newBalance ?? "—"}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{row.supplier ?? "—"}</td>
              <td className="py-2 text-foreground-muted">{row.responsible ?? "Não informado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
