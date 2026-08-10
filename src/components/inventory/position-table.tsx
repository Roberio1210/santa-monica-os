"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { PositionRow } from "@/lib/inventory/stockAnalytics";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<string, "positive" | "critical" | "warning" | "outline"> = {
  NORMAL: "positive",
  BAIXO: "warning",
  CRITICO: "critical",
  ZERADO: "critical",
  SEM_MOVIMENTACAO: "outline",
};
const STATUS_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  BAIXO: "Baixo",
  CRITICO: "Crítico",
  ZERADO: "Zerado",
  SEM_MOVIMENTACAO: "Sem movimentação",
};

type SortKey = "name" | "quantity" | "value" | "days";

/**
 * Tabela gerencial de "Posição Atual" (seção 2) — filtros combináveis aplicados no cliente e
 * paginação no cliente (65 produtos hoje; ver Limitações do relatório final sobre o plano de
 * migrar para paginação/filtros no banco quando o volume crescer).
 */
export function PositionTable({ rows }: { rows: PositionRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (query && !r.itemName.toLowerCase().includes(query)) return false;
      if (category && r.category !== category) return false;
      if (status && r.status !== status) return false;
      return true;
    });
    return [...base].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.itemName.localeCompare(b.itemName, "pt-BR");
      else if (sortKey === "quantity") diff = a.currentQuantity - b.currentQuantity;
      else if (sortKey === "value") diff = (a.stockValue ?? -1) - (b.stockValue ?? -1);
      else diff = (a.daysSinceLastMovement ?? -1) - (b.daysSinceLastMovement ?? -1);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [rows, search, category, status, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar produto"
          className={cn(fieldClasses, "w-full max-w-xs")}
          aria-label="Buscar produto"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className={fieldClasses}
          aria-label="Filtrar por categoria"
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={fieldClasses}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum produto cadastrado." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum resultado para os filtros combinados." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("name")}>
                    Produto {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Categoria</th>
                  <th className="pb-2 pr-3 font-medium">Unidade</th>
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("quantity")}>
                    Saldo {sortKey === "quantity" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Mínimo</th>
                  <th className="pb-2 pr-3 font-medium">Custo médio</th>
                  <th className="pb-2 pr-3 font-medium">Último custo</th>
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("value")}>
                    Valor em estoque {sortKey === "value" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Última entrada</th>
                  <th className="pb-2 pr-3 font-medium">Última saída</th>
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("days")}>
                    Dias sem mov. {sortKey === "days" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Fornecedor (última compra)</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.itemId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                    <td className="py-2 pr-3">
                      <Link href={`/estoque/produtos/${row.itemId}`} className="font-medium text-foreground hover:text-accent">
                        {row.itemName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.unit}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.currentQuantity}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.minimumStock ?? "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.averageCost !== null ? formatCurrency(row.averageCost) : "Sem dado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.lastCost !== null ? formatCurrency(row.lastCost) : "Sem dado"}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{row.stockValue !== null ? formatCurrency(row.stockValue) : "Sem dado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.lastEntryDate ? formatDateBR(row.lastEntryDate) : "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.lastExitDate ? formatDateBR(row.lastExitDate) : "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.daysSinceLastMovement ?? "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.lastPurchaseSupplier ?? "Não informado"}</td>
                    <td className="py-2">
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-foreground-subtle">
            <span>
              {filtered.length} de {rows.length} produto(s) — página {currentPage} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
