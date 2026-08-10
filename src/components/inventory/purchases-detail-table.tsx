"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { purchaseTotalValue, type PurchaseEvent } from "@/lib/inventory/purchaseAnalytics";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

type SortKey = "date" | "value" | "quantity";
type PriceFilter = "todos" | "com_preco" | "sem_preco";

/**
 * Lista completa filtrável de compras — filtros combináveis aplicados no cliente (o período já
 * veio filtrado do servidor via `rows`). Item 3 da missão: produto, categoria, fornecedor, faixa
 * de valor e status de preço, todos combináveis entre si.
 */
export function PurchasesDetailTable({ rows }: { rows: PurchaseEvent[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("todos");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const suppliers = useMemo(() => Array.from(new Set(rows.filter((r) => r.supplierText).map((r) => r.supplierText as string))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const min = minValue.trim() ? Number(minValue.replace(",", ".")) : null;
    const max = maxValue.trim() ? Number(maxValue.replace(",", ".")) : null;

    const base = rows.filter((r) => {
      if (query && !r.itemName.toLowerCase().includes(query)) return false;
      if (category && r.category !== category) return false;
      if (supplier && r.supplierText !== supplier) return false;
      if (priceFilter === "com_preco" && r.unitPricePaid === null) return false;
      if (priceFilter === "sem_preco" && r.unitPricePaid !== null) return false;
      const total = purchaseTotalValue(r);
      if (min !== null && (total === null || total < min)) return false;
      if (max !== null && (total === null || total > max)) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      let diff = 0;
      if (sortKey === "date") diff = a.orderDate.localeCompare(b.orderDate);
      else if (sortKey === "quantity") diff = a.quantity - b.quantity;
      else diff = (purchaseTotalValue(a) ?? -1) - (purchaseTotalValue(b) ?? -1);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [rows, search, category, supplier, priceFilter, minValue, maxValue, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por produto" className={cn(fieldClasses, "w-full max-w-xs")} aria-label="Buscar produto" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClasses} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={fieldClasses} aria-label="Filtrar por fornecedor">
          <option value="">Todos os fornecedores</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value as PriceFilter)} className={fieldClasses} aria-label="Filtrar por status de preço">
          <option value="todos">Preço: todos</option>
          <option value="com_preco">Com preço informado</option>
          <option value="sem_preco">Sem preço informado</option>
        </select>
        <input type="text" inputMode="decimal" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="Valor mín." className={cn(fieldClasses, "w-28")} aria-label="Valor mínimo" />
        <input type="text" inputMode="decimal" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="Valor máx." className={cn(fieldClasses, "w-28")} aria-label="Valor máximo" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma compra no período selecionado." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum resultado para os filtros combinados." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("date")}>
                  Data {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Produto</th>
                <th className="pb-2 pr-3 font-medium">Categoria</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("quantity")}>
                  Quantidade {sortKey === "quantity" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3 font-medium">Preço unit.</th>
                <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("value")}>
                  Valor total {sortKey === "value" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 font-medium">Fornecedor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const total = purchaseTotalValue(row);
                return (
                  <tr key={row.movementId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(row.orderDate)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.itemName}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.category}</td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {row.quantity} {row.unit}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{row.unitPricePaid !== null ? formatCurrency(row.unitPricePaid) : "Sem dado"}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{total !== null ? formatCurrency(total) : "Sem dado"}</td>
                    <td className="py-2 text-foreground-muted">{row.supplierText ?? "Não informado"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-foreground-subtle">
        {filtered.length} de {rows.length} compra(s)
      </p>
    </div>
  );
}
