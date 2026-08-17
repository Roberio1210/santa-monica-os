"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { CashMovementForm } from "@/components/finance/cash-movement-form";
import { AccountTransferForm } from "@/components/finance/account-transfer-form";
import { InformBalanceForm } from "@/components/finance/inform-balance-form";
import type {
  AgingBucket,
  AgingBucketSummary,
  CashFlowAlert,
  CashFlowDashboard,
  CashFlowPeriodPreset,
  CashFlowProjectionPoint,
  CashLedgerEntry,
  CostCenter,
  FinancialAccountBalance,
  FinancialCategory,
  Partner,
  Supplier,
} from "@/lib/finance/types";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const projectionLabels: Record<CashFlowProjectionPoint["window"], string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  "7_dias": "7 dias",
  "15_dias": "15 dias",
  "30_dias": "30 dias",
  "90_dias": "90 dias",
};

const alertLevelLabels: Record<CashFlowAlert["level"], string> = {
  saldo_negativo: "Saldo negativo",
  conta_zerando: "Conta zerando",
  fluxo_negativo_futuro: "Fluxo negativo futuro",
  conta_sem_movimentacao: "Conta sem movimentação",
  diferenca_saldo_informado: "Diferença saldo calculado x informado",
  concentracao_pagamentos: "Concentração de pagamentos",
  saida_excepcional: "Saída excepcionalmente alta",
  queda_entradas: "Queda de entradas",
  conta_a_pagar_vencida: "Contas a pagar vencidas",
  conta_a_receber_vencida: "Contas a receber vencidas",
  movimentacao_sem_classificacao: "Movimentações sem classificação",
};

const CRITICAL_ALERT_LEVELS = new Set<CashFlowAlert["level"]>([
  "saldo_negativo",
  "fluxo_negativo_futuro",
  "conta_a_pagar_vencida",
  "conta_a_receber_vencida",
  "concentracao_pagamentos",
]);

const movementLabelMap: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  receita: "Receita",
  despesa: "Despesa",
  ajuste: "Ajuste",
  estorno: "Estorno",
  taxa_bancaria: "Taxa bancária",
  tarifa: "Tarifa",
  juros: "Juros",
  transferencia: "Transferência",
  reposicao_caixa: "Reposição de caixa",
  aporte_socios: "Aporte de sócios",
  retirada: "Retirada",
  emprestimo_recebido: "Empréstimo recebido",
  emprestimo_devolvido: "Devolução de empréstimo",
};

const classificationStatusLabels: Record<NonNullable<CashLedgerEntry["classificationStatus"]>, string> = {
  classificado: "Classificado",
  revisao_necessaria: "Revisão necessária",
  pendente: "Pendente",
};

const agingBucketLabels: Record<AgingBucket, string> = {
  vencida: "Vencidas",
  hoje: "Vence hoje",
  "7_dias": "Próximos 7 dias",
  "15_dias": "Próximos 15 dias",
  "30_dias": "Próximos 30 dias",
  futuro: "Depois de 30 dias",
};

const periodPresetLabels: Record<CashFlowPeriodPreset, string> = {
  hoje: "Hoje",
  "7_dias": "Últimos 7 dias",
  mes_atual: "Mês atual",
  mes_anterior: "Mês anterior",
  personalizado: "Personalizado",
};

interface CashFlowViewProps {
  dashboard: CashFlowDashboard;
  projection: CashFlowProjectionPoint[];
  alerts: CashFlowAlert[];
  ledger: CashLedgerEntry[];
  accounts: FinancialAccountBalance[];
  receivablesAging: AgingBucketSummary[];
  payablesAging: AgingBucketSummary[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  partners: Partner[];
  suppliers: Supplier[];
  asOfDate: string;
  /** Filtros iniciais vindos de query string (ex.: card da Central de Operações). */
  initialTypeFilter?: "entrada" | "saida";
  initialDateFrom?: string;
  initialDateTo?: string;
  periodPreset: CashFlowPeriodPreset;
  periodFrom: string;
  periodTo: string;
}

export function CashFlowView({
  dashboard,
  projection,
  alerts,
  ledger,
  accounts,
  receivablesAging,
  payablesAging,
  categories,
  costCenters,
  partners,
  suppliers,
  asOfDate,
  initialTypeFilter,
  initialDateFrom,
  initialDateTo,
  periodPreset,
  periodFrom,
  periodTo,
}: CashFlowViewProps) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [costCenterFilter, setCostCenterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "movimento" | "transferencia">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "entrada" | "saida">(initialTypeFilter ?? "all");
  const [operationalFilter, setOperationalFilter] = useState<"all" | "operacional" | "nao_operacional">("all");
  const [classificationFilter, setClassificationFilter] = useState<"all" | "classificado" | "revisao_necessaria" | "pendente">("all");
  const [dateFrom, setDateFrom] = useState(initialDateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialDateTo ?? "");

  const accountOptions = useMemo(() => Array.from(new Set(ledger.map((e) => e.financialAccountName).filter(Boolean))) as string[], [ledger]);
  const costCenterOptions = useMemo(() => Array.from(new Set(ledger.map((e) => e.costCenterName).filter(Boolean))) as string[], [ledger]);
  const categoryOptions = useMemo(() => Array.from(new Set(ledger.map((e) => e.categoryName).filter(Boolean))) as string[], [ledger]);
  const partyOptions = useMemo(() => Array.from(new Set(ledger.map((e) => e.partyName).filter(Boolean))) as string[], [ledger]);

  const filtered = useMemo(() => {
    return ledger.filter((entry) => {
      if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
      if (typeFilter === "entrada" && entry.amount < 0) return false;
      if (typeFilter === "saida" && entry.amount >= 0) return false;
      if (operationalFilter === "operacional" && entry.isOperational !== true) return false;
      if (operationalFilter === "nao_operacional" && entry.isOperational !== false) return false;
      if (classificationFilter !== "all" && entry.classificationStatus !== classificationFilter) return false;
      if (accountFilter !== "all" && entry.financialAccountName !== accountFilter && entry.toAccountName !== accountFilter) return false;
      if (costCenterFilter !== "all" && entry.costCenterName !== costCenterFilter) return false;
      if (categoryFilter !== "all" && entry.categoryName !== categoryFilter) return false;
      if (partyFilter !== "all" && entry.partyName !== partyFilter) return false;
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      return true;
    });
  }, [ledger, kindFilter, typeFilter, operationalFilter, classificationFilter, accountFilter, costCenterFilter, categoryFilter, partyFilter, dateFrom, dateTo]);

  const unclassifiedCount = useMemo(() => ledger.filter((e) => e.classificationStatus === "pendente").length, [ledger]);

  const hasPartialCoverageAccount = dashboard.saldoPorConta.some((a) => a.balanceSource === "extrato_bancario");

  const projected7Days = projection.find((p) => p.window === "7_dias");
  const projected30Days = projection.find((p) => p.window === "30_dias");

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 pt-0">
          {(Object.keys(periodPresetLabels) as CashFlowPeriodPreset[])
            .filter((preset) => preset !== "personalizado")
            .map((preset) => (
              <Link
                key={preset}
                href={`/financeiro/fluxo-de-caixa?periodo=${preset}`}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  periodPreset === preset ? "border-accent bg-accent/10 text-accent" : "border-border bg-background-elevated text-foreground-muted hover:text-foreground",
                )}
              >
                {periodPresetLabels[preset]}
              </Link>
            ))}
          <form action="/financeiro/fluxo-de-caixa" method="get" className="flex items-center gap-1">
            <input type="hidden" name="periodo" value="personalizado" />
            <input type="date" name="de" defaultValue={periodPreset === "personalizado" ? periodFrom : ""} className={fieldClasses} aria-label="Período personalizado — de" />
            <span className="text-xs text-foreground-subtle">até</span>
            <input type="date" name="ate" defaultValue={periodPreset === "personalizado" ? periodTo : ""} className={fieldClasses} aria-label="Período personalizado — até" />
            <button
              type="submit"
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                periodPreset === "personalizado" ? "border-accent bg-accent/10 text-accent" : "border-border bg-background-elevated text-foreground-muted hover:text-foreground",
              )}
            >
              Aplicar
            </button>
          </form>
          <span className="text-xs text-foreground-subtle">
            {formatDateBR(periodFrom)} a {formatDateBR(periodTo)}
          </span>
        </CardContent>
      </Card>

      {/* --- REALIZADO --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-subtle">Realizado — dinheiro que efetivamente entrou ou saiu</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Saldo geral" value={formatCurrency(dashboard.saldoGeral)} icon={Wallet} />
          <StatCard label={`Entradas (${periodPresetLabels[periodPreset]})`} value={formatCurrency(dashboard.entradasPeriodo)} icon={ArrowUpCircle} />
          <StatCard label={`Saídas (${periodPresetLabels[periodPreset]})`} value={formatCurrency(dashboard.saidasPeriodo)} icon={ArrowDownCircle} />
          <StatCard label="Variação líquida no período" value={formatCurrency(dashboard.variacaoLiquidaPeriodo)} icon={Scale} />
        </div>
        {hasPartialCoverageAccount ? (
          <p className="text-xs text-foreground-subtle">
            Saldo geral inclui ao menos uma conta calculada a partir do extrato bancário importado — não representa o saldo bancário desde a abertura da conta, só desde o início do período
            efetivamente importado (ver detalhe em cada conta abaixo).
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Resultado do dia" value={formatCurrency(dashboard.resultadoDia)} icon={Scale} />
          <StatCard label="Resultado da semana" value={formatCurrency(dashboard.resultadoSemana)} icon={TrendingUp} />
          <StatCard label="Resultado do mês" value={formatCurrency(dashboard.resultadoMes)} icon={TrendingUp} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Saldo calculado/disponível por conta</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {dashboard.saldoPorConta.map((a) => (
                <div key={a.financialAccountId} className="rounded-lg border border-border bg-background-elevated p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    {a.belowThreshold ? <Badge variant="warning">Baixo</Badge> : null}
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(a.currentBalance)}</p>
                  {a.informedBalance !== null ? (
                    <p className="text-xs text-foreground-subtle">Informado: {formatCurrency(a.informedBalance)}</p>
                  ) : null}
                  {a.balanceSource === "extrato_bancario" && a.coverage ? (
                    <p className="mt-1 text-xs text-foreground-subtle">
                      Calculado a partir do extrato bancário completo ({a.coverage.totalCount} lançamentos
                      {a.coverage.importPeriodFrom && a.coverage.importPeriodTo ? `, ${formatDateBR(a.coverage.importPeriodFrom)} a ${formatDateBR(a.coverage.importPeriodTo)}` : ""}) — nunca inclui saldo
                      anterior à importação.
                      {a.coverage.classifiedPercent !== null ? (
                        <>
                          {" "}
                          {a.coverage.classifiedPercent}% já classificado ({a.coverage.classifiedCount}/{a.coverage.totalCount}
                          {a.coverage.unclassifiedAmount > 0 ? `; ${formatCurrency(a.coverage.unclassifiedAmount)} ainda não classificados` : ""}).
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-foreground-subtle">Calculado a partir dos lançamentos manuais registrados (sem extrato bancário importado para esta conta).</p>
                  )}
                  <div className="mt-2">
                    <InformBalanceForm financialAccountId={a.financialAccountId} currentBalance={a.currentBalance} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Maiores despesas</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {dashboard.maioresDespesas.length === 0 ? (
                <EmptyState title="Sem despesas registradas" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {dashboard.maioresDespesas.map((d, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-foreground-muted">{d.description}</span>
                      <span className="font-medium text-critical">{formatCurrency(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Maiores receitas</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {dashboard.maioresReceitas.length === 0 ? (
                <EmptyState title="Sem receitas registradas" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {dashboard.maioresReceitas.map((r, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-foreground-muted">{r.description}</span>
                      <span className="font-medium text-positive">{formatCurrency(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Entradas por centro de custo</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {dashboard.entradasPorCentroCusto.length === 0 ? (
                <EmptyState title="Sem dados" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {dashboard.entradasPorCentroCusto.map((c) => (
                    <li key={c.costCenterName} className="flex items-center justify-between">
                      <span className="text-foreground-muted">{c.costCenterName}</span>
                      <span className="font-medium text-foreground">{formatCurrency(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Saídas por centro de custo</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {dashboard.saidasPorCentroCusto.length === 0 ? (
                <EmptyState title="Sem dados" />
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {dashboard.saidasPorCentroCusto.map((c) => (
                    <li key={c.costCenterName} className="flex items-center justify-between">
                      <span className="text-foreground-muted">{c.costCenterName}</span>
                      <span className="font-medium text-foreground">{formatCurrency(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* --- COMPROMETIDO --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-subtle">Comprometido — já conhecido, ainda não liquidado</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Contas a receber (em aberto)" value={formatCurrency(dashboard.receitasPrevistas)} icon={TrendingUp} />
          <StatCard label="Contas a pagar (em aberto)" value={formatCurrency(dashboard.despesasPrevistas)} icon={TrendingDown} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AgingTable title="Contas a receber por vencimento" buckets={receivablesAging} tone="positive" />
          <AgingTable title="Contas a pagar por vencimento" buckets={payablesAging} tone="critical" />
        </div>
      </section>

      {/* --- PROJETADO --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-subtle">Projetado — estimativa a partir do saldo atual + comprometido</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Saldo projetado em 7 dias" value={projected7Days ? formatCurrency(projected7Days.saldoProjetado) : "—"} icon={TrendingUp} />
          <StatCard label="Saldo projetado em 30 dias" value={projected30Days ? formatCurrency(projected30Days.saldoProjetado) : "—"} icon={TrendingUp} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Projeção de saldo por janela</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Janela</th>
                    <th className="pb-2 pr-3 font-medium">Contas a receber</th>
                    <th className="pb-2 pr-3 font-medium">Contas a pagar</th>
                    <th className="pb-2 font-medium">Saldo projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((p) => (
                    <tr key={p.window} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{projectionLabels[p.window]}</td>
                      <td className="py-2 pr-3 text-positive">{formatCurrency(p.contasAReceber)}</td>
                      <td className="py-2 pr-3 text-critical">{formatCurrency(p.contasAPagar)}</td>
                      <td className={cn("py-2 font-medium", p.saldoProjetado < 0 ? "text-critical" : "text-foreground")}>
                        {formatCurrency(p.saldoProjetado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {alerts.length === 0 ? (
            <EmptyState title="Nenhum alerta no momento" />
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((alert, index) => (
                <li key={`${alert.level}-${alert.financialAccountId}-${index}`} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                  <span className="text-foreground-muted">
                    <Badge variant={CRITICAL_ALERT_LEVELS.has(alert.level) ? "critical" : "warning"} className="mr-2">
                      {alertLevelLabels[alert.level]}
                    </Badge>
                    {alert.message}
                  </span>
                  {alert.amount !== null ? <span className="font-medium text-foreground">{formatCurrency(alert.amount)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Novo lançamento manual</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <CashMovementForm financialAccounts={accounts} categories={categories} costCenters={costCenters} partners={partners} suppliers={suppliers} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transferência / aporte / retirada / empréstimo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AccountTransferForm financialAccounts={accounts} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros do Livro Caixa</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "all" | "movimento" | "transferencia")} className={fieldClasses}>
            <option value="all">Todos os tipos</option>
            <option value="movimento">Movimentos</option>
            <option value="transferencia">Transferências</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | "entrada" | "saida")} className={fieldClasses} aria-label="Filtrar por entrada ou saída">
            <option value="all">Entradas e saídas</option>
            <option value="entrada">Só entradas</option>
            <option value="saida">Só saídas</option>
          </select>
          <select value={operationalFilter} onChange={(e) => setOperationalFilter(e.target.value as "all" | "operacional" | "nao_operacional")} className={fieldClasses} aria-label="Filtrar por operacional">
            <option value="all">Operacional e não operacional</option>
            <option value="operacional">Só operacional</option>
            <option value="nao_operacional">Só não operacional</option>
          </select>
          <select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value as "all" | "classificado" | "revisao_necessaria" | "pendente")}
            className={fieldClasses}
            aria-label="Filtrar por status de classificação"
          >
            <option value="all">Toda classificação</option>
            <option value="classificado">Classificado</option>
            <option value="revisao_necessaria">Revisão necessária</option>
            <option value="pendente">Pendente</option>
          </select>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={fieldClasses}>
            <option value="all">Todas as contas</option>
            {accountOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)} className={fieldClasses}>
            <option value="all">Todos os centros de custo</option>
            {costCenterOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={fieldClasses}>
            <option value="all">Todas as categorias</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} className={fieldClasses}>
            <option value="all">Todos os clientes/fornecedores</option>
            {partyOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <label htmlFor="dateFrom" className="text-xs text-foreground-subtle">
              De
            </label>
            <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fieldClasses} />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="dateTo" className="text-xs text-foreground-subtle">
              até
            </label>
            <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={fieldClasses} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Livro Caixa — {filtered.length} de {ledger.length}
            {unclassifiedCount > 0 ? <span className="ml-2 text-xs font-normal text-foreground-subtle">({unclassifiedCount} sem classificação)</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum lançamento encontrado" description="Não há movimentos para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Conta</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Cliente/Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium">Operacional</th>
                    <th className="pb-2 pr-3 font-medium">Classificação</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Saldo posterior</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={`${entry.kind}-${entry.id}`} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(entry.date)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={entry.kind === "transferencia" ? "outline" : entry.amount < 0 ? "critical" : "positive"}>
                          {movementLabelMap[entry.label] ?? entry.label}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{entry.description}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {entry.financialAccountName ?? "—"}
                        {entry.toAccountName ? ` → ${entry.toAccountName}` : ""}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{entry.categoryName ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{entry.partyName ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {entry.isOperational === null ? "—" : <Badge variant="outline">{entry.isOperational ? "Operacional" : "Não operacional"}</Badge>}
                      </td>
                      <td className="py-2 pr-3">
                        {entry.classificationStatus === null ? (
                          "—"
                        ) : (
                          <Badge variant={entry.classificationStatus === "classificado" ? "positive" : entry.classificationStatus === "pendente" ? "critical" : "warning"}>
                            {classificationStatusLabels[entry.classificationStatus]}
                          </Badge>
                        )}
                      </td>
                      <td className={cn("py-2 pr-3 font-medium", entry.amount < 0 ? "text-critical" : "text-positive")}>
                        {formatCurrency(entry.amount)}
                      </td>
                      <td className="py-2 text-foreground-muted">{entry.balanceAfter !== null ? formatCurrency(entry.balanceAfter) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-foreground-subtle">
        Referência de &ldquo;hoje&rdquo; para vencimentos, projeção e alertas: {formatDateBR(asOfDate)}. Período selecionado para entradas/saídas realizadas e Livro Caixa:{" "}
        {formatDateBR(periodFrom)} a {formatDateBR(periodTo)}. Transferências entre contas próprias nunca contam como receita/despesa — só movimentos de entrada/saída entram nos totais
        previstos/realizados. Faturamento operacional (ex.: JumpPark) só é tratado como caixa quando há liquidação financeira correspondente (extrato/cash_movement) — nunca antes disso.
      </p>
    </div>
  );
}

function AgingTable({ title, buckets, tone }: { title: string; buckets: AgingBucketSummary[]; tone: "positive" | "critical" }) {
  const order: AgingBucket[] = ["vencida", "hoje", "7_dias", "15_dias", "30_dias", "futuro"];
  const ordered = order.map((bucket) => buckets.find((b) => b.bucket === bucket) ?? { bucket, count: 0, amount: 0 });
  const hasAny = ordered.some((b) => b.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!hasAny ? (
          <EmptyState title="Nada em aberto" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {ordered.map((b) => (
              <li key={b.bucket} className="flex items-center justify-between border-b border-border-subtle py-1 last:border-0">
                <span className="flex items-center gap-2 text-foreground-muted">
                  {b.bucket === "vencida" && b.count > 0 ? <Badge variant="critical">{agingBucketLabels[b.bucket]}</Badge> : agingBucketLabels[b.bucket]}
                  <span className="text-xs text-foreground-subtle">({b.count})</span>
                </span>
                <span className={cn("font-medium", b.bucket === "vencida" && b.count > 0 ? "text-critical" : `text-${tone}`)}>{formatCurrency(b.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
