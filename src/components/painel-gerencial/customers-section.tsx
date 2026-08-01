import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { rankCustomersByVisits } from "@/lib/painel-gerencial/orders";
import type { CustomerAggregate } from "@/lib/painel-gerencial/types";

/** `customers` já vem ordenado por gasto (ver service.ts) — reordenamos localmente para o ranking por visitas. */
export function CustomersSection({ customers }: { customers: CustomerAggregate[] }) {
  if (customers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clientes do período</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <EmptyState title="Nenhum cliente identificado no período." description="Atendimentos sem telefone ou nome não podem ser atribuídos a um cliente." />
        </CardContent>
      </Card>
    );
  }

  const byVisits = rankCustomersByVisits(customers).slice(0, 5);
  const bySpend = customers.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Clientes do período — {customers.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Nome</th>
                  <th className="pb-2 pr-3 font-medium">Telefone</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Visitas</th>
                  <th className="pb-2 pr-3 font-medium">Total gasto</th>
                  <th className="pb-2 pr-3 font-medium">Ticket médio</th>
                  <th className="pb-2 font-medium">Último atendimento</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.customerId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                    <td className="py-2 pr-3 text-foreground-muted">{c.name ?? "Não informado"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-muted">{c.phone ?? "Não informado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{c.vehicleModel ?? "Não informado"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-muted">{c.licensePlate ?? "Não informado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{c.visits}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(c.totalSpent)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(c.averageTicket)}</td>
                    <td className="py-2 text-foreground-muted">{formatDateBR(c.lastVisit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Clientes que mais gastaram</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {bySpend.map((c, i) => (
              <div key={c.customerId} className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">
                  {i + 1}. {c.name ?? "Não informado"}
                </span>
                <span className="font-medium text-foreground">{formatCurrency(c.totalSpent)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clientes com mais visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {byVisits.map((c, i) => (
              <div key={c.customerId} className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">
                  {i + 1}. {c.name ?? "Não informado"}
                </span>
                <span className="font-medium text-foreground">{c.visits} visita(s)</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
