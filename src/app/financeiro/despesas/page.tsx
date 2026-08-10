import Link from "next/link";
import { DollarSign, Receipt, CalendarDays, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { ExpenseRowsDrilldown } from "@/components/painel-gerencial/expense-rows-drilldown";
import { ExpensesEvolutionChart } from "@/components/finance/expenses-evolution-chart";
import { ExpensesDetailTable } from "@/components/finance/expenses-detail-table";
import { fetchExpensesGerencial } from "@/lib/finance/expensesGerencial";
import { buildExpenseRows } from "@/lib/painel-gerencial/expenses";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado";

function ShareBar({ share, tone = "critical" }: { share: number; tone?: "critical" | "warning" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-elevated">
      <div className={`h-full rounded-full ${tone === "critical" ? "bg-critical/60" : "bg-warning/60"}`} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
    </div>
  );
}

export default async function DespesasGerencialPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchExpensesGerencial(period);
  const { overview, comparison, byCategory, bySupplier, fixedVariable, recurringVsOneOff, topExpenses, monthlyEvolution, recurringTemplates, rows, previousPeriod } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(previousPeriod.from)} a ${formatDateBR(previousPeriod.to)}`;
  const fixedVariableTotal = fixedVariable.fixed.total + fixedVariable.variable.total;
  const recurringOneOffTotal = recurringVsOneOff.recurring.total + recurringVsOneOff.oneOff.total;
  const topExpensesRows = buildExpenseRows(topExpenses);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despesas (gerencial)"
        description="Visão gerencial completa das despesas — todo número aqui abre os lançamentos reais que o formam. Deriva 100% de Contas a Pagar, sem nenhuma fonte paralela."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/financeiro/contas-a-pagar">Contas a Pagar</Link>
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
          <CardContent className="pt-6 text-sm text-foreground-muted">Nenhuma despesa com competência em {periodCaption}.</CardContent>
        </Card>
      ) : null}

      {/* 1. Visão geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total de despesas"
          value={formatCurrency(overview.total)}
          icon={DollarSign}
          trend={comparisonToTrend(comparison.total)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Contas a Pagar (financeiro), filtradas por data de competência"
                formula="Soma do valor original (originalAmount) de todas as contas a pagar não canceladas com competência no período"
                period={periodCaption}
                recordsUsed={`${overview.count} despesa(s)`}
                recordsIgnored="Despesas com status 'cancelada' nunca entram no total"
              />
              <ExpenseRowsDrilldown rows={rows} />
            </div>
          }
        />
        <StatCard
          label="Quantidade de despesas"
          value={String(overview.count)}
          icon={Receipt}
          trend={comparisonToTrend(comparison.count)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Contas a Pagar (financeiro)"
                formula="Contagem de lançamentos não cancelados com competência no período"
                period={periodCaption}
                recordsUsed={`${overview.count} despesa(s)`}
              />
              <ExpenseRowsDrilldown rows={rows} />
            </div>
          }
        />
        <StatCard
          label="Média por despesa"
          value={formatCurrency(overview.averagePerExpense)}
          icon={TrendingDown}
          hint="Total ÷ quantidade"
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Contas a Pagar (financeiro)"
                formula="Total de despesas do período dividido pela quantidade de lançamentos"
                period={periodCaption}
                recordsUsed={`${overview.count} despesa(s)`}
                limitations="Média simples — uma despesa grande isolada (ex.: um imprevisto) desloca a média para cima."
              />
              <ExpenseRowsDrilldown rows={rows} />
            </div>
          }
        />
        <StatCard
          label="Média diária"
          value={formatCurrency(overview.averageDaily)}
          icon={CalendarDays}
          trend={comparisonToTrend(comparison.averageDaily)}
          hint="Total ÷ dias do período"
          detail={
            <CalculationNote
              source="Contas a Pagar (financeiro)"
              formula="Total de despesas do período dividido pela quantidade de dias corridos do período (não dias úteis)"
              period={periodCaption}
              recordsUsed={`${overview.count} despesa(s)`}
            />
          }
        />
      </div>

      {/* 2. Fixas x Variáveis / Recorrentes x Avulsas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fixas x Variáveis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-center justify-between text-sm">
              <DrillDownDialog trigger={`Fixas (${fixedVariable.fixed.count})`} title="Despesas fixas" description={periodCaption}>
                <ExpenseRowsDrilldown rows={buildExpenseRows(fixedVariable.fixed.items)} />
              </DrillDownDialog>
              <span className="font-medium text-foreground">{formatCurrency(fixedVariable.fixed.total)}</span>
            </div>
            <ShareBar share={fixedVariableTotal > 0 ? (fixedVariable.fixed.total / fixedVariableTotal) * 100 : 0} />
            <div className="flex items-center justify-between text-sm">
              <DrillDownDialog trigger={`Variáveis (${fixedVariable.variable.count})`} title="Despesas variáveis" description={periodCaption}>
                <ExpenseRowsDrilldown rows={buildExpenseRows(fixedVariable.variable.items)} />
              </DrillDownDialog>
              <span className="font-medium text-foreground">{formatCurrency(fixedVariable.variable.total)}</span>
            </div>
            <ShareBar share={fixedVariableTotal > 0 ? (fixedVariable.variable.total / fixedVariableTotal) * 100 : 0} tone="warning" />
            <CalculationNote
              source="Contas a Pagar + Despesas Recorrentes (financeiro)"
              formula="Fixa: despesa recorrente cujo modelo tem valor fixo (ex.: aluguel). Variável: despesa recorrente de valor variável (ex.: água/energia) OU despesa avulsa (sem modelo de recorrência)."
              period={periodCaption}
              recordsUsed={`${fixedVariable.fixed.count + fixedVariable.variable.count} despesa(s)`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recorrentes x Avulsas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-center justify-between text-sm">
              <DrillDownDialog trigger={`Recorrentes (${recurringVsOneOff.recurring.count})`} title="Despesas recorrentes" description={periodCaption}>
                <ExpenseRowsDrilldown rows={buildExpenseRows(recurringVsOneOff.recurring.items)} />
              </DrillDownDialog>
              <span className="font-medium text-foreground">{formatCurrency(recurringVsOneOff.recurring.total)}</span>
            </div>
            <ShareBar share={recurringOneOffTotal > 0 ? (recurringVsOneOff.recurring.total / recurringOneOffTotal) * 100 : 0} />
            <div className="flex items-center justify-between text-sm">
              <DrillDownDialog trigger={`Avulsas (${recurringVsOneOff.oneOff.count})`} title="Despesas avulsas" description={periodCaption}>
                <ExpenseRowsDrilldown rows={buildExpenseRows(recurringVsOneOff.oneOff.items)} />
              </DrillDownDialog>
              <span className="font-medium text-foreground">{formatCurrency(recurringVsOneOff.oneOff.total)}</span>
            </div>
            <ShareBar share={recurringOneOffTotal > 0 ? (recurringVsOneOff.oneOff.total / recurringOneOffTotal) * 100 : 0} tone="warning" />
            <CalculationNote
              source="Contas a Pagar (financeiro)"
              formula="Recorrente: despesa gerada a partir de um modelo de recorrência (recurringBillTemplateId preenchido). Avulsa: lançamento pontual, sem modelo."
              period={periodCaption}
              recordsUsed={`${recurringVsOneOff.recurring.count + recurringVsOneOff.oneOff.count} despesa(s)`}
            />
          </CardContent>
        </Card>
      </div>

      {/* 3. Evolução mensal */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {monthlyEvolution.every((p) => p.total === 0) ? (
            <p className="text-sm text-foreground-subtle">Nenhuma despesa registrada nos últimos 12 meses.</p>
          ) : (
            <ExpensesEvolutionChart points={monthlyEvolution} />
          )}
          <div className="mt-3">
            <CalculationNote
              source="Contas a Pagar (financeiro) — todas as competências, independente do período selecionado acima"
              formula="Soma do valor original das despesas não canceladas, por mês de competência"
              period={`${monthlyEvolution[0]?.month ?? "—"} a ${monthlyEvolution[monthlyEvolution.length - 1]?.month ?? "—"}`}
              recordsUsed="Todas as despesas não canceladas da base"
              limitations="Meses sem nenhum lançamento aparecem com total zero — nunca omitidos do gráfico."
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Por categoria */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas por categoria ({byCategory.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {byCategory.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma despesa no período.</p>
          ) : (
            byCategory.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <DrillDownDialog trigger={`${c.category} (${c.count})`} title={c.category} description={`${periodCaption} — ${formatPercent(c.share, 1)} do total`}>
                    <ExpenseRowsDrilldown rows={buildExpenseRows(c.items)} />
                  </DrillDownDialog>
                  <span className="font-medium text-foreground">
                    {formatCurrency(c.total)} <span className="text-xs text-foreground-subtle">({formatPercent(c.share, 1)})</span>
                  </span>
                </div>
                <ShareBar share={c.share} />
              </div>
            ))
          )}
          <CalculationNote
            source="Contas a Pagar (financeiro)"
            formula="Soma por categoria (categoryName) das despesas não canceladas do período; participação = valor da categoria ÷ total do período"
            period={periodCaption}
            recordsUsed={`${byCategory.reduce((s, c) => s + c.count, 0)} despesa(s) em ${byCategory.length} categoria(s)`}
          />
        </CardContent>
      </Card>

      {/* 5. Principais fornecedores */}
      <Card>
        <CardHeader>
          <CardTitle>Principais fornecedores ({bySupplier.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {bySupplier.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma despesa com fornecedor identificado no período.</p>
          ) : (
            bySupplier.slice(0, 15).map((s) => (
              <div key={s.supplier} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <DrillDownDialog trigger={`${s.supplier} (${s.count})`} title={s.supplier} description={`${periodCaption} — ${formatPercent(s.share, 1)} do total com fornecedor identificado`}>
                    <ExpenseRowsDrilldown rows={buildExpenseRows(s.items)} />
                  </DrillDownDialog>
                  <span className="font-medium text-foreground">
                    {formatCurrency(s.total)} <span className="text-xs text-foreground-subtle">({formatPercent(s.share, 1)})</span>
                  </span>
                </div>
                <ShareBar share={s.share} />
              </div>
            ))
          )}
          <CalculationNote
            source="Contas a Pagar (financeiro)"
            formula="Soma por fornecedor (supplierName) das despesas não canceladas do período"
            period={periodCaption}
            recordsUsed={`${bySupplier.reduce((s, x) => s + x.count, 0)} despesa(s) em ${bySupplier.length} fornecedor(es)`}
            recordsIgnored="Despesas sem fornecedor informado ficam de fora deste ranking (nunca inventamos um fornecedor)"
          />
        </CardContent>
      </Card>

      {/* 6. Maiores despesas */}
      <Card>
        <CardHeader>
          <CardTitle>Maiores despesas do período (top {topExpenses.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {topExpenses.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma despesa no período.</p>
          ) : (
            <ExpenseRowsDrilldown rows={topExpensesRows} />
          )}
        </CardContent>
      </Card>

      {/* 7. Despesas recorrentes */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas recorrentes ({recurringTemplates.length} modelo(s))</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recurringTemplates.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum modelo de recorrência cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium">Periodicidade</th>
                    <th className="pb-2 pr-3 font-medium">Dia de vencimento</th>
                    <th className="pb-2 pr-3 font-medium">Valor esperado</th>
                    <th className="pb-2 pr-3 font-medium">Última cobrança real</th>
                    <th className="pb-2 pr-3 font-medium">Variação</th>
                    <th className="pb-2 font-medium">Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringTemplates.map((rt) => (
                    <tr key={rt.template.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">
                        {rt.template.description}
                        {rt.template.pendingData ? (
                          <Badge variant="warning" className="ml-2">
                            Dado pendente
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{rt.template.supplierName ?? NOT_INFORMED}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{rt.template.periodicity}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{rt.template.dueDay ? `Dia ${rt.template.dueDay}` : "Variável"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{rt.expectedAmount !== null ? formatCurrency(rt.expectedAmount) : "Valor variável"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {rt.lastRealizedAmount !== null ? `${formatCurrency(rt.lastRealizedAmount)} (${formatDateBR(rt.lastCompetence)})` : "Nunca gerada"}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {rt.variation ? (
                          <span className={rt.variation.amount > 0 ? "text-critical" : rt.variation.amount < 0 ? "text-positive" : ""}>
                            {rt.variation.amount > 0 ? "+" : ""}
                            {formatCurrency(rt.variation.amount)}
                            {rt.variation.percent !== null ? ` (${rt.variation.percent > 0 ? "+" : ""}${formatPercent(rt.variation.percent, 1)})` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        {rt.instances.length > 0 ? (
                          <DrillDownDialog trigger={`${rt.instances.length} lançamento(s)`} title={rt.template.description} description="Histórico completo de pagamento desta recorrência">
                            <ExpenseRowsDrilldown rows={buildExpenseRows(rt.instances)} />
                          </DrillDownDialog>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 space-y-2">
            <CalculationNote
              source="Recorrências (financeiro) + Contas a Pagar geradas a partir delas"
              formula="Valor esperado vem do modelo (quando fixo); valor real é a última instância gerada. Variação = última instância menos a penúltima."
              period="Sem filtro de período — mostra o histórico completo de cada modelo"
              recordsUsed={`${recurringTemplates.length} modelo(s) de recorrência`}
              limitations="Modelos de valor variável (água/energia) não têm 'valor esperado' — o valor real só existe depois de lançado manualmente."
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/financeiro/contas-a-pagar/gerar-recorrentes">Gerar competência / ver próximas cobranças</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 8. Detalhamento completo */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento completo do período</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ExpensesDetailTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
