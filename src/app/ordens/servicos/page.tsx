import Link from "next/link";
import { DollarSign, Receipt, ClipboardList, Ticket, Users, Car, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { ServiceRankingsTable } from "@/components/jumppark/service-rankings-table";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import { ServiceOpportunitiesTable } from "@/components/jumppark/service-opportunities-table";
import { fetchServicesGerencial } from "@/lib/integrations/jumppark/servicesQuery";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

export default async function ServicosPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchServicesGerencial(period);
  const { overview, comparison, rankings, growing, falling, evolutionDaily, evolutionMonthly, combinations, possibleDuplicates, neverSoldFromCatalog, noSaleInPeriod, stoppedSelling, recurrence, crossSellOpportunities, upsellOpportunities } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(result.previousPeriod.from)} a ${formatDateBR(result.previousPeriod.to)}`;

  const topByRevenue = [...rankings].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const leastSold = [...rankings].sort((a, b) => a.quantity - b.quantity).slice(0, 10);
  const highestTicket = [...rankings].sort((a, b) => b.averageTicket - a.averageTicket).slice(0, 5);
  const lowestTicket = [...rankings].filter((r) => r.averageTicket > 0).sort((a, b) => a.averageTicket - b.averageTicket).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serviços — inteligência comercial"
        description="O que estamos vendendo, para quem, com que frequência e a que valor — derivado 100% de jumppark_service_order_items, sem nenhuma fonte paralela."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/ordens">Central de Ordens</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">
          Comparado com <span className="font-medium text-foreground-muted">{previousPeriodCaption}</span>
        </p>
      </div>

      {!result.hasData ? (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">Nenhum serviço vendido com data em {periodCaption}.</CardContent>
        </Card>
      ) : null}

      {/* 1. Visão geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Serviços realizados" value={String(overview.quantity)} icon={ClipboardList} trend={comparisonToTrend(comparison.quantity)} />
        <StatCard label="Faturamento" value={formatCurrency(overview.revenue)} icon={DollarSign} trend={comparisonToTrend(comparison.revenue)} />
        <StatCard label="Ordens com serviço" value={String(overview.distinctOrders)} icon={Receipt} trend={comparisonToTrend(comparison.distinctOrders)} />
        <StatCard label="Serviços por atendimento" value={overview.averageServicesPerOrder.toFixed(2)} icon={Layers} trend={comparisonToTrend(comparison.averageServicesPerOrder)} />
        <StatCard label="Ticket médio" value={formatCurrency(overview.averageTicket)} icon={Ticket} trend={comparisonToTrend(comparison.averageTicket)} />
        <StatCard label="Clientes atendidos" value={String(overview.distinctCustomers)} icon={Users} trend={comparisonToTrend(comparison.distinctCustomers)} />
        <StatCard label="Veículos atendidos" value={String(overview.distinctVehicles)} icon={Car} trend={comparisonToTrend(comparison.distinctVehicles)} />
      </div>
      <CalculationNote
        source="jumppark_service_order_items, ligados a jumppark_service_orders pela data da ordem"
        formula="Quantidade = nº de itens de serviço no período. Faturamento = soma de amount. Ticket médio = faturamento ÷ ordens distintas com serviço. Serviços por atendimento = quantidade ÷ ordens distintas."
        period={periodCaption}
        recordsUsed={`${overview.quantity} item(ns) de serviço em ${overview.distinctOrders} ordem(ns)`}
        recordsIgnored="Itens sem descrição (nenhum encontrado na base atual) nunca entram na contagem."
        limitations="'Serviço' aqui é a categoria derivada da descrição real (texto antes de ' - ') — a mesma normalização já usada em Clientes e Veículos."
      />

      {/* 2. Evolução */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução diária (período selecionado)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {evolutionDaily.every((p) => p.quantity === 0) ? <p className="text-sm text-foreground-subtle">Nenhuma venda no período.</p> : <ServiceEvolutionChart points={evolutionDaily} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ServiceEvolutionChart points={evolutionMonthly} />
          <div className="mt-3">
            <CalculationNote
              source="jumppark_service_order_items — todas as competências, independente do período selecionado acima"
              formula="Quantidade e faturamento de itens de serviço, por mês da data da ordem"
              period={`${evolutionMonthly[0]?.bucket ?? "—"} a ${evolutionMonthly[evolutionMonthly.length - 1]?.bucket ?? "—"}`}
              recordsUsed="Todos os itens de serviço da base"
              limitations="Meses sem venda aparecem com total zero, nunca omitidos."
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Rankings */}
      <Card>
        <CardHeader>
          <CardTitle>Ranking de serviços ({rankings.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ServiceRankingsTable rankings={rankings} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Maior faturamento</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-1.5">
              {topByRevenue.map((r, i) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                    {i + 1}. {r.category}
                  </Link>
                  <span className="font-medium text-foreground">{formatCurrency(r.revenue)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menos vendidos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-1.5">
              {leastSold.map((r, i) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                    {i + 1}. {r.category}
                  </Link>
                  <span className="font-medium text-foreground">{r.quantity}x</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maior ticket médio</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-1.5">
              {highestTicket.map((r, i) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                    {i + 1}. {r.category}
                  </Link>
                  <span className="font-medium text-foreground">{formatCurrency(r.averageTicket)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menor ticket médio</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-1.5">
              {lowestTicket.map((r, i) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                    {i + 1}. {r.category}
                  </Link>
                  <span className="font-medium text-foreground">{formatCurrency(r.averageTicket)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* 4. Crescendo / Caindo */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Em crescimento ({growing.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {growing.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum serviço com crescimento acima de 20% vs período anterior.</p>
            ) : (
              <ol className="space-y-1.5">
                {growing.map((r, i) => (
                  <li key={r.category} className="flex items-center justify-between text-sm">
                    <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                      {i + 1}. {r.category}
                    </Link>
                    <span className="font-medium text-positive">+{formatPercent(r.trend.comparison.percent ?? 0, 0)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Em queda ({falling.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {falling.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum serviço com queda além de 20% vs período anterior.</p>
            ) : (
              <ol className="space-y-1.5">
                {falling.map((r, i) => (
                  <li key={r.category} className="flex items-center justify-between text-sm">
                    <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground-muted hover:text-accent">
                      {i + 1}. {r.category}
                    </Link>
                    <span className="font-medium text-critical">{formatPercent(r.trend.comparison.percent ?? 0, 0)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <CalculationNote
        source="Quantidade vendida no período atual vs mesmo tamanho de janela no período anterior"
        formula="Crescendo: variação > +20%. Caindo: variação < -20%. Entre esses limites: estável. Sem venda no período anterior: 'novo'."
        period={`${periodCaption} vs ${previousPeriodCaption}`}
        recordsUsed={`${rankings.length} categoria(s) com venda no período atual`}
        limitations="Limiar de ±20% é uma regra fixa e documentada, não um julgamento de negócio — períodos muito curtos (ex.: 'hoje') tornam a variação percentual instável."
      />

      {/* 5. Combinações */}
      <Card>
        <CardHeader>
          <CardTitle>Combinações mais frequentes ({combinations.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {combinations.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma ordem do período teve 2+ serviços diferentes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Combinação</th>
                    <th className="pb-2 font-medium">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {combinations.map((c) => (
                    <tr key={c.categories.join("+")} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">
                        {c.categories[0]} + {c.categories[1]}
                      </td>
                      <td className="py-2 font-medium text-foreground">{c.count}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="jumppark_service_order_items agrupados por ordem, no período selecionado"
              formula="Pares de categorias distintas que aparecem na MESMA ordem — contagem de ordens onde os dois apareceram juntos"
              period={periodCaption}
              recordsUsed={`${overview.distinctOrders} ordem(ns) com serviço`}
              limitations="Só considera pares (2 a 2) — não combinações de 3+ serviços juntos."
            />
          </div>
        </CardContent>
      </Card>

      {/* 6. Cross-sell e Upsell */}
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades de cross-sell ({crossSellOpportunities.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ServiceOpportunitiesTable opportunities={crossSellOpportunities} />
          <div className="mt-3">
            <CalculationNote
              source="Combinações reais mais frequentes (acima) cruzadas com o histórico vitalício de cada cliente"
              formula="Cliente com 2+ ocorrências de um serviço de um par frequente, mas nunca contratou o outro serviço do mesmo par"
              period="Histórico vitalício (não restrito ao período selecionado)"
              recordsUsed={`Top 8 combinações mais frequentes da base, até 10 clientes por combinação`}
              limitations="Nunca sugere uma combinação que não tenha sido observada de verdade na base — não é uma regra de negócio inventada."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Oportunidades de upsell ({upsellOpportunities.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ServiceOpportunitiesTable opportunities={upsellOpportunities} />
          <div className="mt-3">
            <CalculationNote
              source="Histórico vitalício de cada cliente, cruzado com o ticket médio real de cada categoria"
              formula="Cliente recorrente (3+ visitas) cujo histórico inteiro fica em categorias de ticket médio até a mediana da base, e que nunca contratou a categoria de MAIOR ticket médio real"
              period="Histórico vitalício (não restrito ao período selecionado)"
              recordsUsed={`${overview.distinctCustomers} cliente(s) com serviço identificado`}
              limitations="Usa sempre o maior ticket médio JÁ OBSERVADO na base — nunca inventa um serviço 'premium' hipotético."
            />
          </div>
        </CardContent>
      </Card>

      {/* 7. Sem saída */}
      <Card>
        <CardHeader>
          <CardTitle>Serviços sem saída</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Nunca vendido (cadastrado no catálogo, sem correspondência exata no histórico de ordens) — {neverSoldFromCatalog.length}</p>
            {neverSoldFromCatalog.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Todo serviço do catálogo tem correspondência exata no histórico.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {neverSoldFromCatalog.map((s) => (
                  <li key={s.name}>
                    <Badge variant="outline">{s.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Sem venda no período selecionado (mas já vendido antes) — {noSaleInPeriod.length}</p>
            {noSaleInPeriod.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Todos os serviços já vendidos alguma vez tiveram venda também neste período.</p>
            ) : (
              <DrillDownDialog trigger={`Ver ${noSaleInPeriod.length} serviço(s)`} title="Sem venda no período" description={periodCaption}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                        <th className="pb-2 pr-3 font-medium">Serviço</th>
                        <th className="pb-2 pr-3 font-medium">Última venda</th>
                        <th className="pb-2 font-medium">Dias sem vender</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noSaleInPeriod.map((s) => (
                        <tr key={s.category} className="border-b border-border-subtle last:border-0">
                          <td className="py-2 pr-3">
                            <Link href={`/ordens/servicos/${s.slug}`} className="text-foreground hover:text-accent">
                              {s.category}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(s.lastSoldDate)}</td>
                          <td className="py-2 text-foreground-muted">{s.daysSinceLastSale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DrillDownDialog>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Deixou de vender (60+ dias sem nenhuma venda) — {stoppedSelling.length}</p>
            {stoppedSelling.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum serviço com 60+ dias sem venda.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {stoppedSelling.map((s) => (
                  <li key={s.category}>
                    <Link href={`/ordens/servicos/${s.slug}`}>
                      <Badge variant="critical">
                        {s.category} — {s.daysSinceLastSale}d
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CalculationNote
            source="services (catálogo real, comparação por nome exato) + jumppark_service_order_items (histórico realizado)"
            formula="Nunca vendido: nome do catálogo sem correspondência exata (case/acento insensível) entre as categorias já realizadas. Sem venda no período: categoria já vendida alguma vez, mas com 0 vendas no período selecionado. Deixou de vender: 60+ dias corridos desde a última venda."
            period={periodCaption}
            recordsUsed="19 serviço(s) no catálogo real; todas as categorias já realizadas na base"
            limitations="O mapeamento formal entre nome do catálogo e categoria realizada (jumppark_service_mappings) está 0% confirmado na base — a comparação usa só nome exato, nunca aproximação."
          />
        </CardContent>
      </Card>

      {/* 8. Recorrência */}
      <Card>
        <CardHeader>
          <CardTitle>Recorrência por serviço</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recurrence.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Sem dados suficientes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Clientes distintos</th>
                    <th className="pb-2 pr-3 font-medium">Repetiram</th>
                    <th className="pb-2 pr-3 font-medium">% de repetição</th>
                    <th className="pb-2 font-medium">Intervalo médio até repetir</th>
                  </tr>
                </thead>
                <tbody>
                  {recurrence.slice(0, 15).map((r) => (
                    <tr key={r.category} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/servicos/${r.slug}`} className="text-foreground hover:text-accent">
                          {r.category}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{r.distinctCustomers}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{r.repeatCustomers}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatPercent(r.repeatRate, 1)}</td>
                      <td className="py-2 text-foreground-muted">{r.averageIntervalDays !== null ? `${r.averageIntervalDays} dia(s)` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="jumppark_service_order_items, histórico vitalício (não restrito ao período selecionado)"
              formula="% de repetição = clientes que compraram a categoria 2+ vezes ÷ total de clientes distintos que já compraram. Intervalo médio = média dos intervalos, em dias, entre repetições do mesmo cliente na mesma categoria."
              period="Histórico vitalício"
              recordsUsed={`${recurrence.reduce((s, r) => s + r.distinctCustomers, 0)} vínculo(s) cliente-categoria`}
            />
          </div>
        </CardContent>
      </Card>

      {/* 9. Normalização */}
      <Card>
        <CardHeader>
          <CardTitle>Auditoria de nomenclatura — possíveis duplicatas ({possibleDuplicates.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {possibleDuplicates.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum par de nomes com sobreposição relevante encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Nome A</th>
                    <th className="pb-2 pr-3 font-medium">Nome B</th>
                    <th className="pb-2 pr-3 font-medium">Similaridade</th>
                    <th className="pb-2 font-medium">Palavras em comum</th>
                  </tr>
                </thead>
                <tbody>
                  {possibleDuplicates.map((p) => (
                    <tr key={`${p.a}-${p.b}`} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{p.a}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.b}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatPercent(p.similarity, 0)}</td>
                      <td className="py-2 text-foreground-subtle">{p.sharedWords.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-warning">
            Varredura léxica automática, só para revisão humana — nenhuma fusão é feita automaticamente. Pares de tiers deliberadamente distintos (ex.: Lavação Gold/Silver/Bronze) podem aparecer
            aqui só por compartilharem a palavra &quot;Lavação&quot;.
          </p>
          <div className="mt-2">
            <CalculationNote
              source="Nomes de categoria já realizados na base (histórico vitalício)"
              formula="Similaridade de Jaccard entre os conjuntos de palavras de cada nome (dígitos e stopwords ignorados) — pares com 30%+ de sobreposição são listados"
              period="Histórico vitalício"
              recordsUsed="Todas as categorias distintas já realizadas"
              limitations="O mapeamento formal (jumppark_service_mappings) existe mas está 0% confirmado na base — esta varredura é a única fonte disponível hoje, e é best-effort, não exaustiva."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
