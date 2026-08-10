import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { PositionRow } from "@/lib/inventory/stockAnalytics";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

const STATUS_VARIANT: Record<string, "positive" | "critical" | "warning" | "outline"> = {
  NORMAL: "positive",
  BAIXO: "warning",
  CRITICO: "critical",
  ZERADO: "critical",
  SEM_MOVIMENTACAO: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  BAIXO: "Baixo",
  CRITICO: "Crítico",
  ZERADO: "Zerado",
  SEM_MOVIMENTACAO: "Sem movimentação",
};

/** Tabela compacta reutilizada nos modais de drill-down sobre linhas de posição (produtos abaixo do mínimo, zerados, parados...). */
export function PositionRowsDrilldown({ rows }: { rows: PositionRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nenhum produto neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Produto</th>
            <th className="pb-2 pr-3 font-medium">Saldo</th>
            <th className="pb-2 pr-3 font-medium">Mínimo</th>
            <th className="pb-2 pr-3 font-medium">Valor em estoque</th>
            <th className="pb-2 pr-3 font-medium">Última movimentação</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3">
                <Link href={`/estoque/produtos/${row.itemId}`} className="text-foreground hover:text-accent">
                  {row.itemName}
                </Link>
              </td>
              <td className="py-2 pr-3 text-foreground-muted">
                {row.currentQuantity} {row.unit}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{row.minimumStock !== null ? `${row.minimumStock} ${row.unit}` : "Não definido"}</td>
              <td className="py-2 pr-3 font-medium text-foreground">{row.stockValue !== null ? formatCurrency(row.stockValue) : "Sem dado"}</td>
              <td className="py-2 pr-3 text-foreground-muted">
                {row.daysSinceLastMovement !== null ? `${formatDateBR(row.lastEntryDate ?? row.lastExitDate ?? "")} (${row.daysSinceLastMovement}d)` : "Nunca movimentado"}
              </td>
              <td className="py-2">
                <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
