"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, DollarSign, Plus, Receipt, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AccountsReceivableStatus, AccountsReceivableView, FinancePaymentMethod } from "@/lib/finance/types";
import type { AccountsReceivableDashboard, AccountsReceivableSummary, ReceivableAlert } from "@/lib/finance/service";

const statusLabels: Record<AccountsReceivableStatus, string> = {
  draft: "Rascunho",
  open: "Em aberto",
  partially_paid: "Parcial",
  paid: "Recebido",
  overdue: "Atrasado",
  cancelled: "Cancelado",
  reversed: "Estornado",
};

const statusVariant: Record<AccountsReceivableStatus, "outline" | "warning" | "positive" | "critical" | "default"> = {
  draft: "outline",
  open: "default",
  partially_paid: "warning",
  paid: "positive",
  overdue: "critical",
  cancelled: "outline",
  reversed: "critical",
};

const paymentMethodLabels: Record<FinancePaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
  desconhecido: "Não informado",
};

const alertLevelLabels: Record<ReceivableAlert["level"], string> = {
  vence_amanha: "Vence amanhã",
  vencida: "Vencida",
  cliente_recorrente_inadimplente: "Cliente recorrente inadimplente",
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface AccountsReceivableViewProps {
  items: AccountsReceivableView[];
  summary: AccountsReceivableSummary;
  dashboard: AccountsReceivableDashboard;
  alerts: ReceivableAlert[];
  asOfDate: string;
  /** Intervalo de vencimento inicial vindo de query string (ex.: card da Central de Operações). */
  initialDueFrom?: string;
  initialDueTo?: string;
}

export function AccountsReceivableView({ items, summary, dashboard, alerts, asOfDate, initialDueFrom, initialDueTo }: AccountsReceivableViewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | AccountsReceivableStatus>("all");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [costCenterFilter, setCostCenterFilter] = useState<string>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [dueFrom, setDueFrom] = useState(initialDueFrom ?? "");
  const [dueTo, setDueTo] = useState(initialDueTo ?? "");
  const [search, setSearch] = useState("");

  const partyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.partyName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.categoryName) set.add(item.categoryName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const costCenterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.costCenterName) set.add(item.costCenterName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.computedStatus !== statusFilter) return false;
      if (partyFilter !== "all" && item.partyName !== partyFilter) return false;
      if (categoryFilter !== "all" && item.categoryName !== categoryFilter) return false;
      if (costCenterFilter !== "all" && item.costCenterName !== costCenterFilter) return false;
      if (onlyOverdue && item.computedStatus !== "overdue") return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (query) {
        const haystack = [item.partyName, item.description, item.invoiceNumber ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, statusFilter, partyFilter, categoryFilter, costCenterFilter, onlyOverdue, dueFrom, dueTo, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total em aberto" value={formatCurrency(summary.totalOpen)} icon={DollarSign} hint="inclui parcial, vencido e estornado" />
        <StatCard label="Recebido no mês" value={formatCurrency(summary.totalReceivedThisMonth)} icon={CheckCircle2} />
        <StatCard label="Total vencido" value={formatCurrency(summary.totalOverdue)} icon={AlertTriangle} />
        <StatCard label="Próximos vencimentos" value={String(summary.upcomingCount)} icon={CalendarClock} hint="7 dias" />
        <StatCard label="Contas cadastradas" value={String(summary.count)} icon={Receipt} />
      </div>

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/financeiro/contas-a-receber/novo">
            <Plus className="h-4 w-4" />
            Nova conta a receber
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Painel de recebimentos</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DashboardStat label="Receber hoje" value={dashboard.receiveToday} />
            <DashboardStat label="Receber amanhã" value={dashboard.receiveTomorrow} />
            <DashboardStat label="Receber esta semana" value={dashboard.receiveThisWeek} />
            <DashboardStat label="Receber este mês" value={dashboard.receiveThisMonth} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownCard title="Por centro de custo" rows={dashboard.byCostCenter.map((r) => ({ label: r.costCenterName, value: r.amount }))} />
        <BreakdownCard
          title="Por forma de recebimento"
          rows={dashboard.byPaymentMethod.map((r) => ({ label: paymentMethodLabels[r.paymentMethod], value: r.amount }))}
        />
        <BreakdownCard title="Por categoria" rows={dashboard.byCategory.map((r) => ({ label: r.categoryName, value: r.amount }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes inadimplentes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {dashboard.delinquentClients.length === 0 ? (
              <EmptyState title="Nenhum cliente inadimplente" />
            ) : (
              <ul className="space-y-2 text-sm">
                {dashboard.delinquentClients.map((c) => (
                  <li key={c.partyName} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                    <span className="text-foreground">
                      {c.partyName} <span className="text-foreground-subtle">({c.overdueCount} conta{c.overdueCount > 1 ? "s" : ""})</span>
                    </span>
                    <span className="font-medium text-critical">{formatCurrency(c.overdueAmount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
                  <li key={`${alert.accountsReceivableId}-${alert.level}-${index}`} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                    <span className="text-foreground-muted">
                      <Badge variant={alert.level === "vencida" ? "critical" : "warning"} className="mr-2">
                        {alertLevelLabels[alert.level]}
                      </Badge>
                      {alert.partyName} — {alert.description}
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(alert.outstandingAmount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | AccountsReceivableStatus)}
            className={fieldClasses}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            {(Object.keys(statusLabels) as AccountsReceivableStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>

          <select value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por cliente ou parceiro">
            <option value="all">Todos os clientes/parceiros</option>
            {partyOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por categoria">
            <option value="all">Todas as categorias</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por centro de custo">
            <option value="all">Todos os centros de custo</option>
            {costCenterOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <label htmlFor="dueFrom" className="text-xs text-foreground-subtle">
              Vencimento de
            </label>
            <input id="dueFrom" type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className={fieldClasses} />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="dueTo" className="text-xs text-foreground-subtle">
              até
            </label>
            <input id="dueTo" type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className={fieldClasses} />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground-muted">
            <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            Somente vencidos
          </label>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, descrição ou nota fiscal"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Busca livre"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Contas a receber — {filtered.length} de {items.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma conta encontrada" description="Não há contas a receber para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Cliente/Parceiro</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Centro de custo</th>
                    <th className="pb-2 pr-3 font-medium">Competência</th>
                    <th className="pb-2 pr-3 font-medium">Vencimento</th>
                    <th className="pb-2 pr-3 font-medium">Valor previsto</th>
                    <th className="pb-2 pr-3 font-medium">Saldo</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "border-b border-border-subtle last:border-0",
                        item.computedStatus === "overdue" && "bg-critical-bg/40",
                      )}
                    >
                      <td className="py-2 pr-3 font-medium text-foreground">{item.partyName}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.description}
                        {item.installmentTotal ? (
                          <span className="ml-2 text-xs text-foreground-subtle">
                            {item.installmentNumber}/{item.installmentTotal}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.categoryName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.costCenterName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.competenceDate.slice(0, 7)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(item.dueDate)}</td>
                      <td className="py-2 pr-3 text-foreground">{formatCurrency(item.expectedAmount)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(item.outstandingAmount)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant[item.computedStatus]}>{statusLabels[item.computedStatus]}</Badge>
                      </td>
                      <td className="py-2">
                        <Link href={`/financeiro/contas-a-receber/${item.id}`} className="text-xs text-accent hover:underline">
                          Ver detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-foreground-subtle">
        Referência de &ldquo;hoje&rdquo; para vencidos e próximos vencimentos: {formatDateBR(asOfDate)}. Competência é o
        período a que o valor se refere — pode ser diferente da data de recebimento.
      </p>
    </div>
  );
}

function DashboardStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(value)}</p>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <EmptyState title="Sem dados" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between">
                <span className="text-foreground-muted">{row.label}</span>
                <span className="font-medium text-foreground">{formatCurrency(row.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
