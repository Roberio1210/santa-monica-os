import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalculationNote } from "@/components/shared/calculation-note";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import { PeriodSelector } from "@/components/operations/period-selector";
import { fetchServiceDetail } from "@/lib/integrations/jumppark/servicesQuery";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

const trendLabel: Record<string, string> = {
  crescendo: "Crescendo",
  caindo: "Caindo",
  estavel: "Estável",
  novo: "Novo no período",
  sem_venda: "Sem venda em nenhum dos dois períodos",
};
const trendVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  crescendo: "positive",
  caindo: "critical",
  estavel: "outline",
  novo: "outline",
  sem_venda: "outline",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

export default async function ServicoDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { slug } = await params;
  const rawParams = await searchParams;
  const period = parsePeriodParams({ period: rawParams.period, from: rawParams.from, to: rawParams.to });
  const detail = await fetchServiceDetail(slug, period);
  if (!detail || !detail.found) notFound();

  const { category, lifetimeStats, currentStats, previousStats, comparison, trend, evolutionMonthly, combinations, customers, vehicles, daysSinceLastSale, revenueShareLifetime } = detail;
  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={category}
        description="Perfil calculado automaticamente a partir das ordens sincronizadas da JumpPark — nenhum campo abaixo foi digitado manualmente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens/servicos">Voltar para Serviços</Link>
          </Button>
        }
      />

      <PeriodSelector period={period} />

      <Card>
        <CardHeader>
          <CardTitle>1. Vitalício (todo o histórico)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Quantidade vendida" value={lifetimeStats ? String(lifetimeStats.quantity) : null} />
          <Field label="Faturamento" value={lifetimeStats ? formatCurrency(lifetimeStats.revenue) : null} />
          <Field label="Ticket médio" value={lifetimeStats ? formatCurrency(lifetimeStats.averageTicket) : null} />
          <Field label="Primeira venda" value={lifetimeStats?.firstSoldDate ? formatDateBR(lifetimeStats.firstSoldDate) : null} />
          <Field label="Última venda" value={lifetimeStats?.lastSoldDate ? formatDateBR(lifetimeStats.lastSoldDate) : null} />
          <Field label="Dias desde a última venda" value={daysSinceLastSale !== null ? String(daysSinceLastSale) : null} />
          <Field label="Clientes distintos" value={lifetimeStats ? String(lifetimeStats.distinctCustomers) : null} />
          <Field label="Veículos distintos" value={lifetimeStats ? String(lifetimeStats.distinctVehicles) : null} />
          <Field label="Participação no faturamento total de serviços" value={formatPercent(revenueShareLifetime, 1)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. No período selecionado ({periodCaption})</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Quantidade vendida" value={currentStats ? String(currentStats.quantity) : "0"} />
          <Field label="Faturamento" value={formatCurrency(currentStats?.revenue ?? 0)} />
          <Field label="Comparado ao período anterior" value={comparison.quantity.percent !== null ? `${comparison.quantity.percent > 0 ? "+" : ""}${formatPercent(comparison.quantity.percent, 0)}` : "Sem base no período anterior"} />
          <div>
            <p className="text-xs text-foreground-subtle">Tendência</p>
            <Badge variant={trendVariant[trend.direction] ?? "outline"}>{trendLabel[trend.direction] ?? trend.direction}</Badge>
          </div>
          <Field label="Quantidade no período anterior" value={previousStats ? String(previousStats.quantity) : "0"} />
          <div className="sm:col-span-3">
            <CalculationNote
              source="jumppark_service_order_items desta categoria, filtrados por data da ordem"
              formula="Comparação: quantidade no período atual vs mesmo tamanho de janela no período imediatamente anterior. Tendência: crescendo (>+20%), caindo (<-20%), estável (entre esses limites), novo (sem venda no período anterior)."
              period={periodCaption}
              recordsUsed={`${currentStats?.quantity ?? 0} venda(s) no período`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Evolução mensal (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {evolutionMonthly.every((p) => p.quantity === 0) ? <p className="text-sm text-foreground-subtle">Nenhuma venda registrada nos últimos 12 meses.</p> : <ServiceEvolutionChart points={evolutionMonthly} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Combinações ({combinations.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {combinations.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma ordem com este serviço teve outro serviço junto.</p>
          ) : (
            <ul className="space-y-1.5">
              {combinations.map((c) => {
                const other = c.categories.find((cat) => cat !== category) ?? c.categories[0];
                return (
                  <li key={c.categories.join("+")} className="flex items-center justify-between text-sm">
                    <span className="text-foreground-muted">+ {other}</span>
                    <span className="font-medium text-foreground">{c.count}x juntos</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Clientes que contrataram ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {customers.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum cliente identificável.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Vezes</th>
                    <th className="pb-2 pr-3 font-medium">Primeira</th>
                    <th className="pb-2 pr-3 font-medium">Última</th>
                    <th className="pb-2 font-medium">Gasto acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.slice(0, 50).map((c) => (
                    <tr key={c.customerId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/clientes/${c.customerId}`} className="text-foreground hover:text-accent">
                          {c.customerName ?? NOT_INFORMED}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {c.vehicleId ? (
                          <Link href={`/ordens/veiculos/${c.vehicleId}`} className="hover:text-accent">
                            {c.vehicleModel ?? NOT_INFORMED}
                          </Link>
                        ) : (
                          (c.vehicleModel ?? NOT_INFORMED)
                        )}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.count}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(c.firstDate)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(c.lastDate)}</td>
                      <td className="py-2 font-medium text-foreground">{formatCurrency(c.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customers.length > 50 ? <p className="mt-2 text-xs text-foreground-subtle">Mostrando os 50 primeiros de {customers.length} clientes, ordenados por número de vezes.</p> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Veículos ({vehicles.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {vehicles.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum veículo identificável.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Vezes</th>
                    <th className="pb-2 font-medium">Última vez</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.slice(0, 50).map((v) => (
                    <tr key={v.vehicleId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/veiculos/${v.vehicleId}`} className="text-foreground hover:text-accent">
                          {v.vehicleModel ?? NOT_INFORMED}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.count}</td>
                      <td className="py-2 text-foreground-muted">{formatDateBR(v.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vehicles.length > 50 ? <p className="mt-2 text-xs text-foreground-subtle">Mostrando os 50 primeiros de {vehicles.length} veículos, ordenados por número de vezes.</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
