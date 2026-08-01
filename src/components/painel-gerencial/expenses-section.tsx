import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ExpenseRow, ExpensesSummary } from "@/lib/painel-gerencial/types";

const STATUS_VARIANT: Record<string, "positive" | "critical" | "warning" | "outline"> = {
  Paga: "positive",
  Vencida: "critical",
  Pendente: "warning",
  "Parcialmente paga": "warning",
};

export function ExpensesSection({ expenses }: { expenses: { rows: ExpenseRow[]; summary: ExpensesSummary } }) {
  const { rows, summary } = expenses;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compras e gastos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!summary.hasData ? (
          <EmptyState title="Não há despesas registradas suficientes para esta análise." description="Cadastre lançamentos em Financeiro > Contas a Pagar para ver esta seção preenchida." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Total gasto no período</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(summary.total)}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Quantidade de despesas</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{summary.count}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Categoria com maior gasto</p>
                <p className="mt-1 text-sm font-medium text-foreground">{summary.topCategory ? `${summary.topCategory.name} — ${formatCurrency(summary.topCategory.amount)}` : "—"}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Fornecedor com maior gasto</p>
                <p className="mt-1 text-sm font-medium text-foreground">{summary.topSupplier ? `${summary.topSupplier.name} — ${formatCurrency(summary.topSupplier.amount)}` : "Não informado"}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Despesas vencidas</p>
                <p className="mt-1 text-lg font-semibold text-critical">{summary.overdueCount}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Despesas a vencer</p>
                <p className="mt-1 text-lg font-semibold text-warning">{summary.upcomingCount}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Despesas pagas</p>
                <p className="mt-1 text-lg font-semibold text-positive">{summary.paidCount}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Despesas não pagas</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{summary.unpaidCount}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Vencimento</th>
                    <th className="pb-2 pr-3 font-medium">Situação</th>
                    <th className="pb-2 pr-3 font-medium">Pagamento</th>
                    <th className="pb-2 font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.date)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{row.description}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{row.supplier ?? "Não informado"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(row.amount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(row.dueDate)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{row.paymentMethod}</td>
                      <td className="py-2 text-foreground-subtle">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
