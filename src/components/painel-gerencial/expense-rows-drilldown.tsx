import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ExpenseRow } from "@/lib/painel-gerencial/types";

const STATUS_VARIANT: Record<string, "positive" | "critical" | "warning" | "outline"> = {
  Paga: "positive",
  Vencida: "critical",
  Pendente: "warning",
  "Parcialmente paga": "warning",
};

/** Tabela compacta reutilizada dentro dos modais de drill-down do Painel Gerencial. */
export function ExpenseRowsDrilldown({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) return <EmptyState title="Nenhuma despesa neste conjunto." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Data</th>
            <th className="pb-2 pr-3 font-medium">Descrição</th>
            <th className="pb-2 pr-3 font-medium">Categoria</th>
            <th className="pb-2 pr-3 font-medium">Fornecedor</th>
            <th className="pb-2 pr-3 font-medium">Valor</th>
            <th className="pb-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.date)}</td>
              <td className="py-2 pr-3 text-foreground-muted">{row.description}</td>
              <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
              <td className="py-2 pr-3 text-foreground-muted">{row.supplier ?? "Não informado"}</td>
              <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(row.amount)}</td>
              <td className="py-2">
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
