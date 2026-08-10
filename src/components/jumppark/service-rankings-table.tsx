"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import type { CategoryRanking } from "@/lib/integrations/jumppark/servicesQuery";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

type SortKey = "quantity" | "revenue" | "averageTicket" | "distinctCustomers" | "lastSoldDate";

const trendVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  crescendo: "positive",
  caindo: "critical",
  estavel: "outline",
  novo: "outline",
  sem_venda: "outline",
};
const trendLabel: Record<string, string> = {
  crescendo: "Crescendo",
  caindo: "Caindo",
  estavel: "Estável",
  novo: "Novo no período",
  sem_venda: "Sem venda",
};

export function ServiceRankingsTable({ rankings }: { rankings: CategoryRanking[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("quantity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query ? rankings.filter((r) => r.category.toLowerCase().includes(query)) : rankings;
    return [...base].sort((a, b) => {
      const diff = sortKey === "lastSoldDate" ? (a.lastSoldDate ?? "").localeCompare(b.lastSoldDate ?? "") : (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [rankings, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar serviço" className={cn(fieldClasses, "w-full max-w-sm")} aria-label="Buscar serviço" />

      {rankings.length === 0 ? (
        <EmptyState title="Nenhum serviço no período selecionado." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum resultado para a busca." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                <th className="pb-2 pr-3 font-medium">Serviço</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("quantity")}>
                  Qtd. {sortKey === "quantity" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("revenue")}>
                  Faturamento {sortKey === "revenue" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Participação</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("averageTicket")}>
                  Ticket médio {sortKey === "averageTicket" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("distinctCustomers")}>
                  Clientes {sortKey === "distinctCustomers" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Veículos</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("lastSoldDate")}>
                  Última venda {sortKey === "lastSoldDate" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 font-medium">Tendência</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.category} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                  <td className="py-2 pr-3">
                    <Link href={`/ordens/servicos/${r.slug}`} className="font-medium text-foreground hover:text-accent">
                      {r.category}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-foreground-muted">{r.quantity}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(r.revenue)}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{formatPercent(r.share, 1)}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(r.averageTicket)}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{r.distinctCustomers}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{r.distinctVehicles}</td>
                  <td className="py-2 pr-3 text-foreground-muted">{r.lastSoldDate ? formatDateBR(r.lastSoldDate) : "—"}</td>
                  <td className="py-2">
                    <Badge variant={trendVariant[r.trend.direction] ?? "outline"}>{trendLabel[r.trend.direction] ?? r.trend.direction}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-foreground-subtle">
        {filtered.length} de {rankings.length} serviço(s)
      </p>
    </div>
  );
}
