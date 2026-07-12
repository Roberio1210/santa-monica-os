"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, DollarSign, ListChecks, Plus, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AccountsPayableStatus, AccountsPayableView as AccountsPayableViewItem } from "@/lib/finance/types";
import type { AccountsPayableSummary } from "@/lib/finance/service";

type QuickFilter = "none" | "pendente" | "vencida" | "paga_no_mes" | "7_dias" | "30_dias" | "vence_hoje" | "vence_amanha";

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isSameMonth(dateIso: string, referenceIso: string): boolean {
  return dateIso.slice(0, 7) === referenceIso.slice(0, 7);
}

const statusLabels: Record<AccountsPayableStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  parcialmente_paga: "Parcialmente paga",
  paga: "Paga",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

const statusVariant: Record<AccountsPayableStatus, "outline" | "warning" | "positive" | "critical" | "default"> = {
  rascunho: "outline",
  pendente: "default",
  parcialmente_paga: "warning",
  paga: "positive",
  vencida: "critical",
  cancelada: "outline",
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface AccountsPayableViewProps {
  items: AccountsPayableViewItem[];
  summary: AccountsPayableSummary;
  asOfDate: string;
}

export function AccountsPayableListView({ items, summary, asOfDate }: AccountsPayableViewProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | AccountsPayableStatus>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [costCenterFilter, setCostCenterFilter] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");

  function toggleQuickFilter(next: QuickFilter) {
    setQuickFilter((current) => (current === next ? "none" : next));
  }

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.supplierName) set.add(item.supplierName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) set.add(item.categoryName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const costCenterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.costCenterName) set.add(item.costCenterName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const tomorrow = addDaysIso(asOfDate, 1);
    const in7Days = addDaysIso(asOfDate, 7);
    const in30Days = addDaysIso(asOfDate, 30);

    return items.filter((item) => {
      if (statusFilter !== "all" && item.computedStatus !== statusFilter) return false;
      if (supplierFilter !== "all" && item.supplierName !== supplierFilter) return false;
      if (categoryFilter !== "all" && item.categoryName !== categoryFilter) return false;
      if (costCenterFilter !== "all" && item.costCenterName !== costCenterFilter) return false;
      if (dueFrom && item.dueDate < dueFrom) return false;
      if (dueTo && item.dueDate > dueTo) return false;
      if (query) {
        const haystack = [item.description, item.supplierName ?? "", item.documentNumber ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      switch (quickFilter) {
        case "vencida":
          if (item.computedStatus !== "vencida") return false;
          break;
        case "vence_hoje":
          if (item.dueDate !== asOfDate) return false;
          break;
        case "vence_amanha":
          if (item.dueDate !== tomorrow) return false;
          break;
        case "7_dias":
          if (!(item.dueDate >= asOfDate && item.dueDate <= in7Days && (item.computedStatus === "pendente" || item.computedStatus === "parcialmente_paga"))) return false;
          break;
        case "30_dias":
          if (!(item.dueDate >= asOfDate && item.dueDate <= in30Days && (item.computedStatus === "pendente" || item.computedStatus === "parcialmente_paga"))) return false;
          break;
        case "pendente":
          if (!(item.computedStatus === "pendente" || item.computedStatus === "parcialmente_paga" || item.computedStatus === "vencida")) return false;
          break;
        case "paga_no_mes":
          if (!(item.paidAmount > 0 && isSameMonth(item.updatedAt.slice(0, 10), asOfDate))) return false;
          break;
        case "none":
        default:
          break;
      }

      return true;
    });
  }, [items, statusFilter, supplierFilter, categoryFilter, costCenterFilter, dueFrom, dueTo, search, quickFilter, asOfDate]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total pendente"
          value={formatCurrency(summary.totalPending)}
          icon={DollarSign}
          onClick={() => toggleQuickFilter("pendente")}
          active={quickFilter === "pendente"}
        />
        <StatCard
          label="Total vencido"
          value={formatCurrency(summary.totalOverdue)}
          icon={AlertTriangle}
          onClick={() => toggleQuickFilter("vencida")}
          active={quickFilter === "vencida"}
        />
        <StatCard
          label="Pago no mês"
          value={formatCurrency(summary.totalPaidThisMonth)}
          icon={CheckCircle2}
          onClick={() => toggleQuickFilter("paga_no_mes")}
          active={quickFilter === "paga_no_mes"}
        />
        <StatCard
          label="Vencendo em 7 dias"
          value={String(summary.upcoming7Count)}
          icon={CalendarClock}
          onClick={() => toggleQuickFilter("7_dias")}
          active={quickFilter === "7_dias"}
        />
        <StatCard
          label="Vencendo em 30 dias"
          value={String(summary.upcoming30Count)}
          icon={Receipt}
          onClick={() => toggleQuickFilter("30_dias")}
          active={quickFilter === "30_dias"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={quickFilter === "vencida" ? "default" : "outline"}
          onClick={() => toggleQuickFilter("vencida")}
        >
          Vencidas
        </Button>
        <Button variant={quickFilter === "vence_hoje" ? "default" : "outline"} onClick={() => toggleQuickFilter("vence_hoje")}>
          Vencem hoje
        </Button>
        <Button variant={quickFilter === "vence_amanha" ? "default" : "outline"} onClick={() => toggleQuickFilter("vence_amanha")}>
          Vencem amanhã
        </Button>
        <Button variant={quickFilter === "7_dias" ? "default" : "outline"} onClick={() => toggleQuickFilter("7_dias")}>
          Próximos 7 dias
        </Button>
        <Button variant={quickFilter === "30_dias" ? "default" : "outline"} onClick={() => toggleQuickFilter("30_dias")}>
          Próximos 30 dias
        </Button>
        <Button variant={quickFilter === "paga_no_mes" ? "default" : "outline"} onClick={() => toggleQuickFilter("paga_no_mes")}>
          Pagas no mês
        </Button>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/financeiro/contas-a-pagar/gerar-recorrentes">
            <ListChecks className="h-4 w-4" />
            Gerar contas recorrentes
          </Link>
        </Button>
        <Button asChild>
          <Link href="/financeiro/contas-a-pagar/novo">
            <Plus className="h-4 w-4" />
            Nova conta a pagar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AccountsPayableStatus)} className={fieldClasses} aria-label="Filtrar por status">
            <option value="all">Todos os status</option>
            {(Object.keys(statusLabels) as AccountsPayableStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>

          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por fornecedor">
            <option value="all">Todos os fornecedores</option>
            {supplierOptions.map((name) => (
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

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, fornecedor ou documento"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Busca livre"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Contas a pagar — {filtered.length} de {items.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma conta encontrada" description="Não há contas a pagar para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Vencimento</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Centro de custo</th>
                    <th className="pb-2 pr-3 font-medium">Valor original</th>
                    <th className="pb-2 pr-3 font-medium">Valor pago</th>
                    <th className="pb-2 pr-3 font-medium">Saldo</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={cn("border-b border-border-subtle last:border-0", item.computedStatus === "vencida" && "bg-critical-bg/40")}
                    >
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(item.dueDate)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {item.description}
                        {item.pendingData ? (
                          <Badge variant="warning" className="ml-2">
                            Dados pendentes
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.supplierName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.categoryName}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.costCenterName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground">{formatCurrency(item.originalAmount)}</td>
                      <td className="py-2 pr-3 text-foreground">{formatCurrency(item.paidAmount)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(item.outstandingAmount)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant[item.computedStatus]}>{statusLabels[item.computedStatus]}</Badge>
                      </td>
                      <td className="py-2">
                        <Link href={`/financeiro/contas-a-pagar/${item.id}`} className="text-xs text-accent hover:underline">
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

      <p className="text-xs text-foreground-subtle">Referência de &ldquo;hoje&rdquo; para vencidos e próximos vencimentos: {formatDateBR(asOfDate)}.</p>
    </div>
  );
}
