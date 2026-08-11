import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CalculationNote } from "@/components/shared/calculation-note";
import { PeriodSelector } from "@/components/operations/period-selector";
import { HistoricalConsumptionTrigger } from "@/components/inventory/historical-consumption-trigger";
import { fetchHistoricalTheoreticalOverview } from "@/lib/jumppark-orders/historical-overview";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { parsePeriodParams, saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

export default async function ConsumoTeoricoHistoricoPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const rawParams = await searchParams;
  const period = parsePeriodParams(rawParams);
  const overview = await fetchHistoricalTheoreticalOverview(period);
  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumo teórico histórico"
        description="Estimativa retroativa de consumo a partir das ordens reais já sincronizadas — nunca uma movimentação real de estoque, sempre calculado à parte e nunca sobrescreve o saldo físico."
      />
      <PeriodSelector period={period} />
      <HistoricalConsumptionTrigger today={saoPauloDateISO()} />

      <Card>
        <CardHeader>
          <CardTitle>Serviços realizados no período — {overview.totalOrdersWithTheoreticalData} ordem(ns) com dado teórico</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overview.servicesRealized.length === 0 ? (
            <EmptyState title="Nenhum serviço com receita configurada realizado neste período." description="Só ordens com serviço mapeado e ao menos um produto com receita técnica entram aqui." />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {overview.servicesRealized.map((s) => (
                <li key={s.serviceName} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <p className="text-xs text-foreground-subtle">{s.serviceName}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{s.count}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consumo teórico por produto</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overview.consumptionByProduct.length === 0 ? (
            <EmptyState title="Nenhum consumo teórico calculado neste período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Consumo teórico</th>
                    <th className="pb-2 font-medium">Custo teórico</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.consumptionByProduct.map((c) => (
                    <tr key={c.itemId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{c.itemName}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {c.quantity} {c.unit}
                      </td>
                      <td className="py-2 text-foreground-muted">{c.cost !== null ? formatCurrency(c.cost) : "Custo não informado"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compras reais no período</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overview.purchasesByProduct.length === 0 ? (
            <EmptyState title="Nenhuma compra real registrada neste período." description="Só compras/entradas realmente cadastradas — nunca uma compra inventada." />
          ) : (
            <ul className="space-y-1.5">
              {overview.purchasesByProduct.map((p) => (
                <li key={p.itemId} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm">
                  <span className="text-foreground-muted">{p.itemName}</span>
                  <span className="font-medium text-foreground">
                    {p.quantity} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estoque teórico (marco de contagem + compras reais − consumo teórico)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overview.theoreticalStockByProduct.length === 0 ? (
            <EmptyState title="Nenhum produto com consumo teórico neste período para calcular." />
          ) : (
            <div className="space-y-2">
              {overview.theoreticalStockByProduct.map((t) => (
                <div key={t.itemId} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{t.itemName}</span>
                    {t.reliable ? (
                      <Badge variant="outline">
                        {t.theoreticalStock} {t.unit}
                      </Badge>
                    ) : (
                      <Badge variant="warning">Não calculável</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-foreground-subtle">{t.reason}</p>
                  {t.reliable ? (
                    <p className="mt-1 text-xs text-foreground-subtle">
                      Marco: {formatDateBR(t.baselineDate as string)} ({t.baselineQuantity} {t.unit}) + {t.realPurchasesInPeriod} {t.unit} comprados − {t.theoreticalConsumptionInPeriod} {t.unit} teóricos
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contagens físicas no período — {overview.stocktakeSessionsInPeriod.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {overview.stocktakeSessionsInPeriod.length === 0 ? (
            <EmptyState title="Nenhuma contagem física neste período." description="Compare o estoque teórico acima com uma contagem real assim que houver uma — ver /estoque/contagem." />
          ) : (
            <ul className="space-y-2">
              {overview.stocktakeSessionsInPeriod.map((s) => (
                <li key={s.reference} className="rounded-lg border border-border-subtle p-2 text-sm">
                  <span className="font-medium text-foreground">
                    {formatDateBR(s.date)} — {s.reference}
                  </span>
                  <span className="ml-2 text-xs text-foreground-subtle">{s.lines.length} linha(s)</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CalculationNote
        source="historical_theoretical_consumption (nunca inventory_movements/inventory_consumption_lines — tabela separada, só análise) + compras reais + contagens físicas já existentes"
        formula="Consumo teórico = receita técnica vigente (aprovada > em calibração > técnica) × ordens reais mapeadas. Estoque teórico = saldo da contagem física inicial + compras reais − consumo teórico. Nunca sobrescreve o saldo físico real."
        period={periodCaption}
        recordsUsed={`${overview.totalOrdersWithTheoreticalData} ordem(ns) histórica(s) com dado teórico no período`}
        limitations="Categoria de veículo sempre 'desconhecida' no histórico (a JumpPark não persiste placa real em Neon, só via API ao vivo) — multiplicador de porte não se aplica retroativamente. Custo teórico usa o custo médio ATUAL do produto, não o custo vigente na data da ordem."
      />
    </div>
  );
}
