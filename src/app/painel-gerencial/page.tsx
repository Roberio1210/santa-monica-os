import { DollarSign, Users, Car, ClipboardCheck, Ticket, Wallet, Receipt, TrendingDown, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { PeriodSelector } from "@/components/operations/period-selector";
import { RefreshButton } from "@/components/operations/refresh-button";
import { StatCard } from "@/components/cards/stat-card";
import { OrdersTable } from "@/components/painel-gerencial/orders-table";
import { CustomersSection } from "@/components/painel-gerencial/customers-section";
import { ServicesSection } from "@/components/painel-gerencial/services-section";
import { ExpensesSection } from "@/components/painel-gerencial/expenses-section";
import { FindingsSection } from "@/components/painel-gerencial/findings-section";
import { OrderRowsDrilldown } from "@/components/painel-gerencial/order-rows-drilldown";
import { ExpenseRowsDrilldown } from "@/components/painel-gerencial/expense-rows-drilldown";
import { CalculationNote } from "@/components/shared/calculation-note";
import { fetchPainelGerencial } from "@/lib/painel-gerencial/service";
import { parsePeriodParams, SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { comparisonToTrend } from "@/lib/utils/comparison";

// Consulta dados reais (JumpPark + Contas a Pagar) a cada acesso — nunca serve HTML desatualizado.
export const dynamic = "force-dynamic";

function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default async function PainelGerencialPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchPainelGerencial(period);
  const { indicators, comparison, previousPeriod } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(previousPeriod.from)} a ${formatDateBR(previousPeriod.to)} (mesma duração, período imediatamente anterior)`;

  const operationalResultReasonParts: string[] = [];
  if (!result.jumpparkConfigured) operationalResultReasonParts.push("faturamento indisponível (JumpPark não configurado)");
  else if (result.jumpparkError) operationalResultReasonParts.push(`faturamento indisponível (${result.jumpparkError})`);
  if (!result.expenses.summary.hasData) operationalResultReasonParts.push("nenhuma despesa registrada no período");
  const operationalResultReason = result.operationalResultCalculable ? null : `Resultado ainda não calculável — ${operationalResultReasonParts.join(" e ")}.`;

  const ordersCalcNote = (
    <CalculationNote
      source="Ordens de serviço da JumpPark (consulta ao vivo à API, sem persistência própria neste módulo)"
      formula="Soma de valores de todas as ordens com saída registrada (finalizadas) no período"
      period={periodCaption}
      recordsUsed={`${indicators.ordersCount} ordem(ns) finalizada(s)`}
      recordsIgnored="Ordens sem saída registrada (ainda em andamento) não entram nesta contagem"
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Gerencial"
        description="Visão gerencial com dados reais da JumpPark e do Financeiro — vendas, clientes, serviços, despesas e pontos de atenção."
        actions={
          <div className="flex items-center gap-2">
            {result.jumpparkConfigured && !result.jumpparkError ? (
              <Badge variant="positive">
                <Wifi className="h-3 w-3" />
                JumpPark
              </Badge>
            ) : null}
            <RefreshButton />
          </div>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">Atualizado às {formatGeneratedAt(result.generatedAt)}</p>
      </div>

      {!result.jumpparkConfigured ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="JumpPark não configurado neste ambiente — indicadores de venda indisponíveis. Despesas seguem disponíveis abaixo." />
          </CardContent>
        </Card>
      ) : result.jumpparkError ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label={result.jumpparkError} />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-foreground-subtle">
        Comparado com <span className="font-medium text-foreground-muted">{previousPeriodCaption}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Faturamento bruto"
          value={formatCurrency(indicators.grossRevenue)}
          icon={DollarSign}
          trend={comparisonToTrend(comparison.grossRevenue)}
          detail={
            <div className="space-y-4">
              {ordersCalcNote}
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard label="Descontos" value={formatCurrency(indicators.discountTotal)} icon={TrendingDown} />
        <StatCard
          label="Faturamento líquido"
          value={formatCurrency(indicators.netRevenue)}
          icon={DollarSign}
          trend={comparisonToTrend(comparison.netRevenue)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Ordens de serviço da JumpPark (consulta ao vivo à API)"
                formula="Faturamento bruto menos descontos concedidos, somado por ordem finalizada no período"
                period={periodCaption}
                recordsUsed={`${indicators.ordersCount} ordem(ns) finalizada(s)`}
                recordsIgnored="Ordens sem saída registrada (ainda em andamento)"
              />
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard
          label="Ticket médio"
          value={indicators.averageTicket !== null ? formatCurrency(indicators.averageTicket) : "—"}
          icon={Ticket}
          trend={comparisonToTrend(comparison.averageTicket)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Ordens de serviço da JumpPark (consulta ao vivo à API)"
                formula="Faturamento líquido do período dividido pela quantidade de ordens finalizadas"
                period={periodCaption}
                recordsUsed={`${indicators.ordersCount} ordem(ns) finalizada(s)`}
                limitations="Média simples — não pondera por cliente nem remove valores atípicos (ex.: um contrato de frota com valor muito alto ou muito baixo pode deslocar a média)"
              />
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard
          label="Atendimentos"
          value={String(indicators.ordersCount)}
          icon={ClipboardCheck}
          trend={comparisonToTrend(comparison.ordersCount)}
          detail={
            <div className="space-y-4">
              {ordersCalcNote}
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard
          label="Veículos atendidos"
          value={String(indicators.vehiclesCount)}
          icon={Car}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Ordens de serviço da JumpPark (consulta ao vivo à API)"
                formula="Contagem de veículos distintos (por identificador interno) entre as ordens finalizadas no período"
                period={periodCaption}
                recordsUsed={`${indicators.ordersCount} ordem(ns) finalizada(s)`}
                recordsIgnored="Ordens sem placa/veículo identificável não entram na contagem"
              />
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard
          label="Clientes atendidos"
          value={String(indicators.customersCount)}
          icon={Users}
          trend={comparisonToTrend(comparison.customersCount)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Ordens de serviço da JumpPark (consulta ao vivo à API)"
                formula="Contagem de clientes distintos (por identidade derivada de telefone/nome) entre as ordens finalizadas no período"
                period={periodCaption}
                recordsUsed={`${indicators.customersCount} cliente(s) identificável(is) em ${indicators.ordersCount} ordem(ns)`}
                recordsIgnored="Ordens sem telefone nem nome não podem ser atribuídas a nenhum cliente"
              />
              <OrderRowsDrilldown orders={result.orders} />
            </div>
          }
        />
        <StatCard label="Valor recebido" value={formatCurrency(indicators.receivedAmount)} icon={Wallet} />
        {indicators.pendingAmount > 0 ? <StatCard label="Valor pendente" value={formatCurrency(indicators.pendingAmount)} icon={Wallet} /> : null}
        <StatCard
          label="Despesas registradas"
          value={formatCurrency(result.expenses.summary.total)}
          icon={Receipt}
          trend={comparisonToTrend(comparison.expensesTotal)}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Contas a Pagar (Financeiro), filtradas por data de competência no período"
                formula="Soma do valor original de todas as contas a pagar com competência no período"
                period={periodCaption}
                recordsUsed={`${result.expenses.summary.count} despesa(s)`}
                limitations="Não inclui gastos fora do Contas a Pagar (ex.: caixa pequeno sem lançamento formal)"
              />
              <ExpenseRowsDrilldown rows={result.expenses.rows} />
            </div>
          }
        />
        <StatCard
          label="Resultado operacional com dados registrados"
          value={result.operationalResultCalculable ? formatCurrency(result.operationalResult) : "Ainda não calculável"}
          icon={!result.operationalResultCalculable ? Wallet : result.operationalResult >= 0 ? DollarSign : TrendingDown}
          hint={result.operationalResultCalculable ? "Faturamento líquido menos despesas registradas — não é lucro contábil" : (operationalResultReason ?? undefined)}
          trend={result.operationalResultCalculable ? comparisonToTrend(comparison.operationalResult) : undefined}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Ordens da JumpPark (faturamento) + Contas a Pagar (despesas)"
                formula="Faturamento líquido do período menos o total de despesas com competência no período"
                period={periodCaption}
                recordsUsed={`${indicators.ordersCount} ordem(ns) + ${result.expenses.summary.count} despesa(s)`}
                limitations={
                  result.operationalResultCalculable
                    ? 'Não é o resultado contábil oficial (ver DRE em Financeiro > DRE) — não considera impostos, depreciação nem despesas fora do Contas a Pagar. "Com dados registrados" significa: só o que já está lançado no sistema.'
                    : `Resultado não apresentado como número porque ${operationalResultReason?.toLowerCase()} — faturamento menos despesa ausente pareceria um resultado real quando na verdade é ausência de dado, não zero.`
                }
              />
              {result.operationalResultCalculable ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border-subtle p-3">
                    <p className="text-xs text-foreground-subtle">Faturamento líquido</p>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(indicators.netRevenue)}</p>
                  </div>
                  <div className="rounded-lg border border-border-subtle p-3">
                    <p className="text-xs text-foreground-subtle">Despesas registradas</p>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(result.expenses.summary.total)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">{operationalResultReason}</p>
              )}
            </div>
          }
        />
      </div>

      <FindingsSection findings={result.findings} />

      <OrdersTable orders={result.orders} period={period} />

      <CustomersSection customers={result.customers} />

      <ServicesSection services={result.services} />

      <ExpensesSection expenses={result.expenses} />
    </div>
  );
}
