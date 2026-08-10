import Link from "next/link";
import { DollarSign, Receipt, Package, Building2, Tags, Ticket, CalendarClock, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { PurchaseRowsDrilldown } from "@/components/inventory/purchase-rows-drilldown";
import { PurchasesDetailTable } from "@/components/inventory/purchases-detail-table";
import { PurchasesEvolutionSection } from "@/components/inventory/purchases-evolution-section";
import { fetchPurchasesGerencial } from "@/lib/inventory/purchasesQuery";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-elevated">
      <div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
    </div>
  );
}

const OPPORTUNITY_LABEL: Record<string, string> = {
  preco_menor_no_passado: "Preço menor no passado",
  preco_subiu: "Preço subiu",
  concentracao_fornecedor: "Concentração de fornecedor",
  compra_muito_frequente: "Compra muito frequente",
};

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchPurchasesGerencial(period);
  const { overview, comparison, productStats, categoryStats, evolutionDaily, evolutionWeekly, evolutionMonthly, economyOpportunities, dataQuality, financialCrossReference, rows } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(result.previousPeriod.from)} a ${formatDateBR(result.previousPeriod.to)}`;
  const topByValue = [...productStats].filter((p) => p.purchaseCount > 0).slice(0, 15);
  const recurringProducts = productStats.filter((p) => p.estimate !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos/Compras"
        description="Compras reais de produtos — derivadas de Movimentações de Estoque (tipo compra). Contas a Pagar de 'Produtos e insumos' aparece em seção própria, sem nunca ser somada ao mesmo total."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/entradas">Registrar compra</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/produtos">Produtos</Link>
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

      {!result.hasAnyPurchase ? (
        <Card className="border-warning/40">
          <CardContent className="pt-6 text-sm text-foreground-muted">
            <p className="font-medium text-foreground">Nenhuma compra cadastrada.</p>
            <p className="mt-1 text-xs">Nenhuma movimentação de estoque do tipo &quot;compra&quot; foi registrada ainda. Os números abaixo não foram inventados — refletem exatamente essa ausência de dado.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* 1. Visão geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Compras no período"
          value={String(overview.purchaseCount)}
          icon={Receipt}
          trend={comparisonToTrend(comparison.purchaseCount)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque (inventory_movements), tipo compra"
                formula="Contagem de movimentações de compra com data no período selecionado"
                period={periodCaption}
                recordsUsed={`${overview.purchaseCount} movimentação(ões) de compra`}
              />
              <PurchaseRowsDrilldown rows={rows} />
            </div>
          }
        />
        <StatCard label="Produtos distintos comprados" value={String(overview.distinctProducts)} icon={Package} />
        <StatCard label="Fornecedores identificados" value={String(overview.distinctSuppliers)} icon={Building2} hint="Só compras com fornecedor informado" />
        <StatCard
          label="Valor total disponível"
          value={formatCurrency(overview.totalValue)}
          icon={DollarSign}
          trend={comparisonToTrend(comparison.totalValue)}
          hint={`${overview.purchasesWithKnownValue} de ${overview.purchaseCount} com preço informado`}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque (inventory_movements), tipo compra"
                formula="Soma de quantidade × preço unitário pago, só das compras com preço informado"
                period={periodCaption}
                recordsUsed={`${overview.purchasesWithKnownValue} de ${overview.purchaseCount} compra(s) com preço informado`}
                recordsIgnored="Compras sem preço pago informado nunca entram nesta soma (nunca tratadas como custo zero)"
              />
              <PurchaseRowsDrilldown rows={rows} />
            </div>
          }
        />
        <StatCard label="Ticket médio por compra" value={overview.averageTicket !== null ? formatCurrency(overview.averageTicket) : "Sem dado"} icon={Ticket} hint="Só entre compras com preço" />
        <StatCard label="Gasto médio diário" value={formatCurrency(overview.averageDailySpend)} icon={CalendarClock} hint="Valor do período ÷ dias do período" />
        <StatCard label="Projeção de gasto mensal" value={formatCurrency(overview.averageMonthlySpend)} icon={TrendingDown} hint="Gasto médio diário × 30 — projeção, não meta" />
        <StatCard label="Categorias com compra" value={String(categoryStats.length)} icon={Tags} />
      </div>

      {/* 2. Produtos mais comprados */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos mais comprados (vitalício, top {topByValue.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {topByValue.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma compra registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Compras</th>
                    <th className="pb-2 pr-3 font-medium">Qtd. total</th>
                    <th className="pb-2 pr-3 font-medium">Valor total</th>
                    <th className="pb-2 pr-3 font-medium">Último preço</th>
                    <th className="pb-2 font-medium">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {topByValue.map((p) => (
                    <tr key={p.itemId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/compras/${p.itemId}`} className="font-medium text-foreground hover:text-accent">
                          {p.itemName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.category}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.purchaseCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {p.totalQuantity} {p.unit}
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground">{p.purchasesWithKnownValue > 0 ? formatCurrency(p.totalValue) : "Sem dado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.lastPrice !== null ? formatCurrency(p.lastPrice) : "Sem dado"}</td>
                      <td className="py-2 text-foreground-muted">{p.lastDate ? formatDateBR(p.lastDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque (inventory_movements), tipo compra — agregado por produto, histórico vitalício"
              formula="Ranking por valor total comprado (soma de quantidade × preço, só compras com preço conhecido). Compras sem preço contam na quantidade mas não no valor."
              period="Histórico vitalício (não restrito ao período selecionado acima)"
              recordsUsed={`${topByValue.length} produto(s) com pelo menos 1 compra`}
              limitations="Produtos comprados só uma vez aparecem igualmente — não há distinção entre recorrência e compra pontual nesta lista (ver seção 'Compras recorrentes' abaixo para isso)."
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Categorias */}
      <Card>
        <CardHeader>
          <CardTitle>Compras por categoria ({categoryStats.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {categoryStats.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma compra no período.</p>
          ) : (
            categoryStats.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <DrillDownDialog
                    trigger={`${c.category} (${c.purchaseCount})`}
                    title={c.category}
                    description={`${periodCaption} — ${formatPercent(c.share, 1)} do valor comprado com preço conhecido`}
                  >
                    <PurchaseRowsDrilldown rows={rows.filter((r) => r.category === c.category)} />
                  </DrillDownDialog>
                  <span className="font-medium text-foreground">
                    {c.purchasesWithKnownValue > 0 ? formatCurrency(c.totalValue) : "Sem dado"} <span className="text-xs text-foreground-subtle">({formatPercent(c.share, 1)})</span>
                  </span>
                </div>
                <ShareBar share={c.share} />
              </div>
            ))
          )}
          <CalculationNote
            source="Movimentações de Estoque (inventory_movements), tipo compra"
            formula="Soma por categoria do produto (categoria cadastrada no item), só das compras com preço conhecido; participação = valor da categoria ÷ valor total do período com preço conhecido"
            period={periodCaption}
            recordsUsed={`${categoryStats.reduce((s, c) => s + c.purchaseCount, 0)} compra(s) em ${categoryStats.length} categoria(s)`}
          />
        </CardContent>
      </Card>

      {/* 4. Evolução */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução das compras</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <PurchasesEvolutionSection daily={evolutionDaily} weekly={evolutionWeekly} monthly={evolutionMonthly} />
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque (inventory_movements), tipo compra"
              formula="Quantidade = nº de compras no bucket de tempo; valor = soma de quantidade × preço, só compras com preço conhecido"
              period="Diário/semanal: período selecionado acima. Mensal: últimos 12 meses, sempre, independente do período selecionado."
              recordsUsed={`${rows.length} compra(s) no período selecionado (visão diária/semanal)`}
              limitations="Meses/dias/semanas sem nenhuma compra aparecem com total zero — nunca omitidos do gráfico."
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Compras recorrentes */}
      <Card>
        <CardHeader>
          <CardTitle>Compras recorrentes — próxima compra estimada ({recurringProducts.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recurringProducts.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Nenhum produto tem 3 ou mais compras em datas distintas ainda — evidência insuficiente para estimar recorrência. Nenhuma previsão foi inventada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Intervalo médio</th>
                    <th className="pb-2 pr-3 font-medium">Última compra</th>
                    <th className="pb-2 font-medium">Próxima compra estimada</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringProducts.map((p) => (
                    <tr key={p.itemId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/compras/${p.itemId}`} className="text-foreground hover:text-accent">
                          {p.itemName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.estimate?.averageIntervalDays} dia(s)</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.lastDate ? formatDateBR(p.lastDate) : "—"}</td>
                      <td className="py-2 font-medium text-foreground">{p.estimate ? formatDateBR(p.estimate.estimatedDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs italic text-foreground-subtle">
            Estimativa puramente estatística baseada no intervalo médio real entre compras — nunca uma previsão real ou um compromisso. Regra: exige 3+ compras em datas distintas; próxima data = última
            compra + intervalo médio observado.
          </p>
        </CardContent>
      </Card>

      {/* 6. Oportunidades de economia */}
      <Card>
        <CardHeader>
          <CardTitle>Oportunidades de economia ({economyOpportunities.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {economyOpportunities.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma oportunidade identificada com os critérios atuais. Nenhum valor de economia potencial é estimado nesta seção — só evidências reais.</p>
          ) : (
            <ul className="space-y-2">
              {economyOpportunities.map((o, i) => (
                <li key={`${o.itemId}-${o.kind}-${i}`} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/estoque/compras/${o.itemId}`} className="font-medium text-foreground hover:text-accent">
                      {o.itemName}
                    </Link>
                    <span className="text-xs text-foreground-subtle">{OPPORTUNITY_LABEL[o.kind] ?? o.kind}</span>
                  </div>
                  <p className="mt-1 text-foreground-muted">{o.description}</p>
                  <p className="mt-1 text-xs text-foreground-subtle">Evidência: {o.evidence}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-foreground-subtle">
            Baseado só em evidência real (histórico de preço, intervalo entre compras). Nenhuma economia em R$ é estimada — a decisão de agir sobre cada caso é gerencial.
          </p>
        </CardContent>
      </Card>

      {/* 7. Relação com Despesas (Contas a Pagar) */}
      <Card>
        <CardHeader>
          <CardTitle>Relação com Despesas — Contas a Pagar de &quot;Produtos e insumos&quot; ({financialCrossReference.payables.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {financialCrossReference.payables.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum lançamento de Contas a Pagar na categoria &quot;Produtos e insumos&quot; no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Competência</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {financialCrossReference.payables.map((p) => (
                    <tr key={p.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">
                        <Link href={`/financeiro/contas-a-pagar/${p.id}`} className="hover:text-accent">
                          {formatDateBR(p.competenceDate)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.description}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.supplierId ? "Identificado" : "Não informado"}</td>
                      <td className="py-2 font-medium text-foreground">{formatCurrency(p.originalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Contas a Pagar (accounts_payable), filtradas pela categoria 'Produtos e insumos' e competência no período — mesma fonte já usada em Despesas"
              formula={`Soma de originalAmount = ${formatCurrency(financialCrossReference.total)}`}
              period={periodCaption}
              recordsUsed={`${financialCrossReference.payables.length} lançamento(s)`}
              limitations="Fonte estruturalmente separada das Movimentações de Estoque acima (não há vínculo de ID entre as duas hoje) — este valor NUNCA é somado ao 'Valor total disponível' da visão geral, para não contar a mesma compra duas vezes. As duas seções podem legitimamente representar a mesma compra real vista por dois ângulos (físico e financeiro), sem que isso seja duplicidade."
            />
          </div>
        </CardContent>
      </Card>

      {/* 8. Preparação para Estoque (documentação, sem implementar) */}
      <Card>
        <CardHeader>
          <CardTitle>Preparação para o módulo de Estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm text-foreground-muted">
          <p>
            <span className="font-medium text-foreground">Já disponível a partir de Compras:</span> entrada de estoque (movimentação tipo compra), custo médio ponderado (recalculado automaticamente a
            cada entrada com preço), quantidade recebida por evento, data da última compra por produto, fornecedor da última compra conhecida (quando informado) e histórico de preço por produto.
          </p>
          <p>
            <span className="font-medium text-foreground">Ainda não coberto por este módulo</span> (fora do escopo desta missão, propositalmente não implementado aqui): saída/consumo por serviço
            realizado, registro de perda/avaria, ajuste de inventário, contagem física, e cálculo de estoque mínimo por giro real. O cadastro do item já tem campos para estoque mínimo/ideal
            (<code>minimumStock</code>/<code>idealStock</code>), mas o preenchimento e a lógica de alerta por giro são do módulo de Estoque, não deste.
          </p>
        </CardContent>
      </Card>

      {/* 9. Fluxo de cadastro de compra */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo de cadastro de compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm text-foreground-muted">
          <p>
            O Santa Monica OS já possui um fluxo de registro de compra em <Link href="/estoque/entradas" className="text-accent hover:underline">Entradas</Link>, que valida quantidade maior que zero e
            preço maior ou igual a zero antes de salvar, e nunca permite gravar uma compra com total matematicamente inconsistente (o valor total é sempre calculado a partir de quantidade × preço
            unitário, nunca digitado separadamente). Nesta missão, o campo de fornecedor desse formulário passou a sugerir nomes do cadastro real de Fornecedores (com opção de digitar um nome novo),
            para melhorar o vínculo entre Compras e Fornecedores sem duplicar cadastro.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/estoque/entradas">Ir para Entradas</Link>
          </Button>
        </CardContent>
      </Card>

      {/* 10. Filtros + Lista completa */}
      <Card>
        <CardHeader>
          <CardTitle>Lista completa de compras do período ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <PurchasesDetailTable rows={rows} />
        </CardContent>
      </Card>

      {/* 11. Qualidade dos dados */}
      <Card>
        <CardHeader>
          <CardTitle>Qualidade dos dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Nomes de produto possivelmente semelhantes ({dataQuality.possibleDuplicateProductNames.length}) — nunca fundidos automaticamente</p>
            {dataQuality.possibleDuplicateProductNames.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum par de nomes com sobreposição relevante encontrado entre os produtos com compra registrada.</p>
            ) : (
              <ul className="space-y-1.5">
                {dataQuality.possibleDuplicateProductNames.map((p) => (
                  <li key={`${p.a}-${p.b}`} className="text-sm text-foreground-muted">
                    <span className="font-medium text-foreground">{p.a}</span> ↔ <span className="font-medium text-foreground">{p.b}</span> — {formatPercent(p.similarity, 0)} de sobreposição (palavras
                    em comum: {p.sharedWords.join(", ")})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Compras sem quantidade válida</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.purchasesWithoutQuantity}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Compras sem fornecedor identificado</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.purchasesWithoutSupplier}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Compras sem preço informado</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.purchasesWithoutPrice}</p>
            </div>
          </div>
          <CalculationNote
            source="Movimentações de Estoque (inventory_movements), tipo compra — todas, histórico vitalício"
            formula="Nomes semelhantes: varredura léxica (Jaccard sobre palavras, mesma técnica de Serviços/Fornecedores), só para revisão humana. Sem fornecedor/preço: campo correspondente nulo na movimentação."
            period="Sem período — auditoria estrutural de todas as compras já registradas"
            recordsUsed="Todas as movimentações de tipo compra da base"
            limitations="Nenhuma fusão ou correção é feita automaticamente — toda divergência listada aqui exige revisão humana antes de qualquer ajuste no cadastro."
          />
        </CardContent>
      </Card>
    </div>
  );
}
