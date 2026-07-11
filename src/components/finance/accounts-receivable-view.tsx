"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, DollarSign, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AccountsReceivableStatus, AccountsReceivableView, FinancePaymentMethod } from "@/lib/finance/types";
import type { AccountsReceivableSummary } from "@/lib/finance/service";

const statusLabels: Record<AccountsReceivableStatus, string> = {
  draft: "Rascunho",
  open: "Em aberto",
  partially_paid: "Parcialmente pago",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const statusVariant: Record<AccountsReceivableStatus, "outline" | "warning" | "positive" | "critical" | "default"> = {
  draft: "outline",
  open: "default",
  partially_paid: "warning",
  paid: "positive",
  overdue: "critical",
  cancelled: "outline",
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

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface AccountsReceivableViewProps {
  items: AccountsReceivableView[];
  summary: AccountsReceivableSummary;
  asOfDate: string;
}

export function AccountsReceivableView({ items, summary, asOfDate }: AccountsReceivableViewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | AccountsReceivableStatus>("all");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [search, setSearch] = useState("");

  const partyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.partyName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.computedStatus !== statusFilter) return false;
      if (partyFilter !== "all" && item.partyName !== partyFilter) return false;
      if (onlyOverdue && item.computedStatus !== "overdue") return false;
      if (onlyPaid && item.computedStatus !== "paid") return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (query) {
        const haystack = [item.partyName, item.description, item.invoiceNumber ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, statusFilter, partyFilter, onlyOverdue, onlyPaid, dueFrom, dueTo, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total em aberto" value={formatCurrency(summary.totalOpen)} icon={DollarSign} hint="inclui parcial e vencido" />
        <StatCard label="Recebido no mês" value={formatCurrency(summary.totalReceivedThisMonth)} icon={CheckCircle2} />
        <StatCard label="Total vencido" value={formatCurrency(summary.totalOverdue)} icon={AlertTriangle} />
        <StatCard label="Próximos vencimentos" value={String(summary.upcomingCount)} icon={CalendarClock} hint="7 dias" />
        <StatCard label="Contas cadastradas" value={String(summary.count)} icon={Receipt} />
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

          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className={fieldClasses}
            aria-label="Filtrar por cliente ou parceiro"
          >
            <option value="all">Todos os clientes/parceiros</option>
            {partyOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <label htmlFor="dueFrom" className="text-xs text-foreground-subtle">
              Vencimento de
            </label>
            <input
              id="dueFrom"
              type="date"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className={fieldClasses}
            />
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
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground-muted">
            <input type="checkbox" checked={onlyPaid} onChange={(e) => setOnlyPaid(e.target.checked)} />
            Somente pagos
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
                    <th className="pb-2 pr-3 font-medium">Competência</th>
                    <th className="pb-2 pr-3 font-medium">Vencimento</th>
                    <th className="pb-2 pr-3 font-medium">Valor previsto</th>
                    <th className="pb-2 pr-3 font-medium">Valor recebido</th>
                    <th className="pb-2 pr-3 font-medium">Saldo</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Nota fiscal</th>
                    <th className="pb-2 pr-3 font-medium">Forma de pagamento</th>
                    <th className="pb-2 font-medium">Origem</th>
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
                      <td className="py-2 pr-3 text-foreground-muted">{item.description}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.competenceDate.slice(0, 7)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.dueDate}</td>
                      <td className="py-2 pr-3 text-foreground">{formatCurrency(item.expectedAmount)}</td>
                      <td className="py-2 pr-3 text-foreground">{formatCurrency(item.receivedAmount)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(item.outstandingAmount)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant[item.computedStatus]}>{statusLabels[item.computedStatus]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.invoiceIssued ? (item.invoiceNumber ?? "Emitida, sem número informado") : "Não emitida"}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{paymentMethodLabels[item.paymentMethod]}</td>
                      <td className="py-2 text-foreground-subtle">{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-foreground-subtle">
        Referência de &ldquo;hoje&rdquo; para vencidos e próximos vencimentos: {asOfDate}. Competência é o período a
        que o valor se refere — pode ser diferente da data de recebimento (ver coluna &ldquo;Vencimento&rdquo; x data
        efetiva de recebimento em cada conta).
      </p>
    </div>
  );
}
