"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ConsumptionConfirmationView } from "@/lib/orders/consumption-history";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

type StatusFilter = "all" | "confirmada" | "parcial" | "estornada";
type DivergenceFilter = "all" | "com_divergencia";

export function ConsumptionsView({ confirmations }: { confirmations: ConsumptionConfirmationView[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [divergenceFilter, setDivergenceFilter] = useState<DivergenceFilter>("all");
  const [search, setSearch] = useState("");

  const hasDivergence = (c: ConsumptionConfirmationView) => c.lines.some((l) => l.difference !== null && Math.abs(l.difference) > 0.001);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return confirmations.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (divergenceFilter === "com_divergencia" && !hasDivergence(c)) return false;
      if (query) {
        const haystack = `${c.jumpparkOrderExternalId} ${c.responsibleName} ${c.lines.map((l) => l.itemName).join(" ")}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [confirmations, statusFilter, divergenceFilter, search]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={fieldClasses} aria-label="Filtrar por status">
            <option value="all">Todos os status</option>
            <option value="confirmada">Confirmada</option>
            <option value="parcial">Parcial</option>
            <option value="estornada">Estornada</option>
          </select>
          <select value={divergenceFilter} onChange={(e) => setDivergenceFilter(e.target.value as DivergenceFilter)} className={fieldClasses} aria-label="Filtrar por divergência">
            <option value="all">Com ou sem divergência</option>
            <option value="com_divergencia">Só com divergência</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ordem, responsável ou produto"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Buscar"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Consumos — {filtered.length} de {confirmations.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum consumo encontrado." description="Nenhuma confirmação de consumo para os filtros selecionados." />
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/estoque/ordens/${c.jumpparkOrderExternalId}`} className="font-medium text-foreground hover:text-accent hover:underline">
                    Ordem {c.jumpparkOrderExternalId} — v{c.version}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-foreground-subtle">
                    {formatDateBR(c.confirmedAt.slice(0, 10))} · {c.responsibleName}
                    <Badge variant={c.status === "estornada" ? "outline" : c.status === "parcial" ? "warning" : "positive"}>{c.status}</Badge>
                    {hasDivergence(c) ? <Badge variant="warning">Divergência</Badge> : null}
                  </span>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-foreground-subtle">
                        <th className="pb-1 pr-3 font-medium">Produto</th>
                        <th className="pb-1 pr-3 font-medium">Esperado</th>
                        <th className="pb-1 pr-3 font-medium">Confirmado</th>
                        <th className="pb-1 pr-3 font-medium">Diferença</th>
                        <th className="pb-1 font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.lines.map((l) => (
                        <tr key={l.id} className="border-b border-border-subtle/50 last:border-0">
                          <td className="py-1 pr-3 text-foreground-muted">
                            {l.itemName}
                            {l.isExtra ? " (extra)" : ""}
                          </td>
                          <td className="py-1 pr-3 text-foreground-muted">{l.expectedQuantity !== null ? `${l.expectedQuantity} ${l.unit}` : "—"}</td>
                          <td className="py-1 pr-3 text-foreground-muted">
                            {l.confirmedQuantity} {l.unit}
                          </td>
                          <td className={cn("py-1 pr-3", l.difference !== null && Math.abs(l.difference) > 0.001 ? "text-warning" : "text-foreground-muted")}>
                            {l.difference !== null ? `${l.difference > 0 ? "+" : ""}${l.difference} ${l.unit}` : "—"}
                          </td>
                          <td className="py-1 text-foreground-muted">{l.knownCost !== null ? formatCurrency(l.knownCost) : "Não informado"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.status === "estornada" ? (
                  <p className="mt-2 text-xs text-foreground-subtle">
                    Estornado por {c.reversedBy} em {c.reversedAt ? formatDateBR(c.reversedAt.slice(0, 10)) : ""} — {c.reversalReason}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
