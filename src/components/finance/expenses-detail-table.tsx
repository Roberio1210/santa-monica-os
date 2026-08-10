"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ExpenseRow } from "@/lib/painel-gerencial/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const STATUS_VARIANT: Record<string, "positive" | "critical" | "warning" | "outline"> = {
  Paga: "positive",
  Vencida: "critical",
  Pendente: "warning",
  "Parcialmente paga": "warning",
};

type SortKey = "date" | "amount";

/** Tabela filtrável de detalhamento completo — mesma linha (`ExpenseRow`) usada no Painel Gerencial, com busca local (sem nova ida ao banco). */
export function ExpensesDetailTable({ rows }: { rows: ExpenseRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query ? rows.filter((r) => [r.description, r.category, r.supplier ?? ""].join(" ").toLowerCase().includes(query)) : rows;
    const sorted = [...base].sort((a, b) => {
      const diff = sortKey === "date" ? a.date.localeCompare(b.date) : a.amount - b.amount;
      return sortDir === "asc" ? diff : -diff;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por descrição, categoria ou fornecedor"
        className={cn(fieldClasses, "w-full max-w-md")}
        aria-label="Buscar despesa"
      />

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma despesa no período selecionado." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum resultado para a busca." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("date")}>
                  Competência {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Descrição</th>
                <th className="pb-2 pr-3 font-medium">Categoria</th>
                <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("amount")}>
                  Valor {sortKey === "amount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Vencimento</th>
                <th className="pb-2 pr-3 font-medium">Situação</th>
                <th className="pb-2 font-medium">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.date)}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{row.description}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{row.supplier ?? "Não informado"}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(row.amount)}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(row.dueDate)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                  </td>
                  <td className="py-2 text-foreground-muted">{row.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-foreground-subtle">
        {filtered.length} de {rows.length} despesa(s)
      </p>
    </div>
  );
}
