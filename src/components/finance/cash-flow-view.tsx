"use client";

import { useMemo, useState } from "react";
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
  CashFlowAlert,
  CashFlowDashboard,
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
};

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
};

interface CashFlowViewProps {
  dashboard: CashFlowDashboard;
  projection: CashFlowProjectionPoint[];
  alerts: CashFlowAlert[];
  ledger: CashLedgerEntry[];
  accounts: FinancialAccountBalance[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  partners: Partner[];
  suppliers: Supplier[];
  asOfDate: string;
  /** Filtros iniciais vindos de query string (ex.: card da Central de Operações). */
  initialTypeFilter?: "entrada" | "saida";
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function CashFlowView({
  dashboard,
  projection,
  alerts,
  ledger,
  accounts,
  categories,
  costCenters,
  partners,
  suppliers,
  asOfDate,
  initialTypeFilter,
  initialDateFrom,
  initialDateTo,
}: CashFlowViewProps) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [costCenterFilter, setCostCenterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "movimento" | "transferencia">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "entrada" | "saida">(initialTypeFilter ?? "all");
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
      if (accountFilter !== "all" && entry.financialAccountName !== accountFilter && entry.toAccountName !== accountFilter) return false;
      if (costCenterFilter !== "all" && entry.costCenterName !== costCenterFilter) return false;
      if (categoryFilter !== "all" && entry.categoryName !== categoryFilter) return false;
      if (partyFilter !== "all" && entry.partyName !== partyFilter) return false;
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      return true;
    });
  }, [ledger, kindFilter, typeFilter, accountFilter, costCenterFilter, categoryFilter, partyFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Saldo geral" value={formatCurrency(dashboard.saldoGeral)} icon={Wallet} />
        <StatCard label="Entradas hoje" value={formatCurrency(dashboard.entradasHoje)} icon={ArrowUpCircle} />
        <StatCard label="Saídas hoje" value={formatCurrency(dashboard.saidasHoje)} icon={ArrowDownCircle} />
        <StatCard label="Resultado do dia" value={formatCurrency(dashboard.resultadoDia)} icon={Scale} />
        <StatCard label="Resultado da semana" value={formatCurrency(dashboard.resultadoSemana)} icon={TrendingUp} />
        <StatCard label="Resultado do mês" value={formatCurrency(dashboard.resultadoMes)} icon={TrendingUp} />
        <StatCard label="Receitas previstas" value={formatCurrency(dashboard.receitasPrevistas)} icon={TrendingUp} />
        <StatCard label="Despesas previstas" value={formatCurrency(dashboard.despesasPrevistas)} icon={TrendingDown} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo por conta</CardTitle>
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
                <div className="mt-2">
                  <InformBalanceForm financialAccountId={a.financialAccountId} currentBalance={a.currentBalance} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projeção de saldo</CardTitle>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                      <Badge variant={alert.level === "saldo_negativo" || alert.level === "fluxo_negativo_futuro" ? "critical" : "warning"} className="mr-2">
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

        <div className="grid grid-cols-1 gap-4">
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
            <CardTitle>Transferência / aporte / retirada</CardTitle>
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
                    <th className="pb-2 pr-3 font-medium">Centro de custo</th>
                    <th className="pb-2 pr-3 font-medium">Cliente/Fornecedor</th>
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
                      <td className="py-2 pr-3 text-foreground-muted">{entry.costCenterName ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{entry.partyName ?? "—"}</td>
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
        Referência de &ldquo;hoje&rdquo; para os cálculos deste painel: {formatDateBR(asOfDate)}. Transferências entre contas
        próprias nunca contam como receita/despesa — só movimentos de entrada/saída entram nos totais previstos/realizados.
      </p>
    </div>
  );
}
