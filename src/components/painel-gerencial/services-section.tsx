import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { ServiceAggregate } from "@/lib/painel-gerencial/types";

export function ServicesSection({ services }: { services: ServiceAggregate[] }) {
  const topSold = [...services].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const topRevenue = services.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Desempenho de serviços — {services.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {services.length === 0 ? (
            <EmptyState title="Nenhum serviço registrado no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Qtd.</th>
                    <th className="pb-2 pr-3 font-medium">Bruto</th>
                    <th className="pb-2 pr-3 font-medium">Desconto</th>
                    <th className="pb-2 pr-3 font-medium">Líquido</th>
                    <th className="pb-2 pr-3 font-medium">Participação</th>
                    <th className="pb-2 font-medium">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.description} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3 text-foreground-muted">{s.description}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{s.category}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{s.quantity}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(s.grossAmount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(s.discountAmount)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(s.netAmount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatPercent(s.revenueShare, 1)}</td>
                      <td className="py-2 text-foreground-muted">{formatCurrency(s.averageTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Serviços mais vendidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {topSold.length === 0 ? (
              <Unavailable />
            ) : (
              topSold.map((s, i) => (
                <div key={s.description} className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">
                    {i + 1}. {s.description}
                  </span>
                  <span className="font-medium text-foreground">{s.quantity}x</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Serviços com maior faturamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {topRevenue.length === 0 ? (
              <Unavailable />
            ) : (
              topRevenue.map((s, i) => (
                <div key={s.description} className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">
                    {i + 1}. {s.description}
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(s.grossAmount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
