"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { inventoryCategories } from "@/lib/inventory/types";
import type { InventoryCategory, InventoryItemView, InventoryStatus, PhysicalState, QuantityStatus } from "@/lib/inventory/types";

const statusMeta: Record<InventoryStatus, { label: string; variant: "positive" | "warning" | "critical" | "outline" }> = {
  ok: { label: "OK", variant: "positive" },
  atencao: { label: "Atenção", variant: "warning" },
  comprar: { label: "Comprar", variant: "critical" },
  sem_minimo: { label: "Sem mínimo definido", variant: "outline" },
};

type SortKey = "nome" | "saldo" | "ultima_movimentacao" | "status";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface ProductsViewProps {
  items: InventoryItemView[];
  itemsWithMovement: string[];
  itemsWithRecipe: string[];
  lastMovementByItem: Record<string, string>;
  initialStatus?: InventoryStatus;
  initialQuantityStatus?: QuantityStatus;
}

export function ProductsView({ items, itemsWithMovement, itemsWithRecipe, lastMovementByItem, initialStatus, initialQuantityStatus }: ProductsViewProps) {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | InventoryCategory>("all");
  const [physicalStateFilter, setPhysicalStateFilter] = useState<"all" | PhysicalState>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InventoryStatus>(initialStatus ?? "all");
  const [quantityStatusFilter, setQuantityStatusFilter] = useState<"all" | QuantityStatus>(initialQuantityStatus ?? "all");
  const [withoutMinimum, setWithoutMinimum] = useState(false);
  const [withoutCost, setWithoutCost] = useState(false);
  const [withoutMovement, setWithoutMovement] = useState(false);
  const [usedInRecipe, setUsedInRecipe] = useState(false);
  const [withoutRecipe, setWithoutRecipe] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("nome");

  const movementSet = useMemo(() => new Set(itemsWithMovement), [itemsWithMovement]);
  const recipeSet = useMemo(() => new Set(itemsWithRecipe), [itemsWithRecipe]);
  const brandOptions = useMemo(() => Array.from(new Set(items.map((i) => i.brand))).sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      if (physicalStateFilter !== "all" && item.physicalState !== physicalStateFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (quantityStatusFilter !== "all" && item.quantityStatus !== quantityStatusFilter) return false;
      if (withoutMinimum && item.minimumStock !== null) return false;
      if (withoutCost && item.unitCost !== null) return false;
      if (withoutMovement && movementSet.has(item.id)) return false;
      if (usedInRecipe && !recipeSet.has(item.id)) return false;
      if (withoutRecipe && recipeSet.has(item.id)) return false;
      if (query && !`${item.name} ${item.brand}`.toLowerCase().includes(query)) return false;
      return true;
    });

    const statusRank: Record<InventoryStatus, number> = { comprar: 0, atencao: 1, sem_minimo: 2, ok: 3 };
    const sorted = [...result];
    switch (sortKey) {
      case "saldo":
        sorted.sort((a, b) => b.currentQuantity - a.currentQuantity);
        break;
      case "ultima_movimentacao":
        sorted.sort((a, b) => (lastMovementByItem[b.id] ?? "").localeCompare(lastMovementByItem[a.id] ?? ""));
        break;
      case "status":
        sorted.sort((a, b) => statusRank[a.status] - statusRank[b.status]);
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    return sorted;
  }, [
    items,
    search,
    brandFilter,
    categoryFilter,
    physicalStateFilter,
    statusFilter,
    quantityStatusFilter,
    withoutMinimum,
    withoutCost,
    withoutMovement,
    usedInRecipe,
    withoutRecipe,
    sortKey,
    movementSet,
    recipeSet,
    lastMovementByItem,
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por produto ou marca"
              className={cn(fieldClasses, "min-w-[220px] flex-1")}
              aria-label="Buscar por produto ou marca"
            />
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por marca">
              <option value="all">Todas as marcas</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | InventoryCategory)} className={fieldClasses} aria-label="Filtrar por categoria">
              <option value="all">Todas as categorias</option>
              {inventoryCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select value={physicalStateFilter} onChange={(e) => setPhysicalStateFilter(e.target.value as "all" | PhysicalState)} className={fieldClasses} aria-label="Filtrar por estado físico">
              <option value="all">Líquidos, massas e peças</option>
              <option value="liquido">Líquidos</option>
              <option value="massa">Massas</option>
              <option value="peca">Peças</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | InventoryStatus)} className={fieldClasses} aria-label="Filtrar por status">
              <option value="all">Todos os status</option>
              {(Object.keys(statusMeta) as InventoryStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusMeta[status].label}
                </option>
              ))}
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={fieldClasses} aria-label="Ordenar por">
              <option value="nome">Ordenar por nome</option>
              <option value="saldo">Ordenar por saldo</option>
              <option value="ultima_movimentacao">Ordenar por última movimentação</option>
              <option value="status">Ordenar por status</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-foreground-muted">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={quantityStatusFilter === "measurement_pending"} onChange={(e) => setQuantityStatusFilter(e.target.checked ? "measurement_pending" : "all")} />
              Medição pendente
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={withoutMinimum} onChange={(e) => setWithoutMinimum(e.target.checked)} />
              Sem estoque mínimo
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={withoutCost} onChange={(e) => setWithoutCost(e.target.checked)} />
              Sem custo
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={withoutMovement} onChange={(e) => setWithoutMovement(e.target.checked)} />
              Sem movimentação
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={usedInRecipe} onChange={(e) => setUsedInRecipe(e.target.checked)} />
              Usado em receita
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={withoutRecipe} onChange={(e) => setWithoutRecipe(e.target.checked)} />
              Sem receita
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Produtos — {filtered.length} de {items.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado" description="Não há itens para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Marca</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Saldo</th>
                    <th className="pb-2 pr-3 font-medium">Embalagem</th>
                    <th className="pb-2 pr-3 font-medium">Medição</th>
                    <th className="pb-2 pr-3 font-medium">Mínimo</th>
                    <th className="pb-2 pr-3 font-medium">Custo médio</th>
                    <th className="pb-2 pr-3 font-medium">Última movimentação</th>
                    <th className="pb-2 pr-3 font-medium">Localização</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0 align-top hover:bg-background-elevated/50">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/produtos/${item.id}`} className="font-medium text-foreground hover:text-accent hover:underline">
                          {item.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.brand}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.category}</td>
                      <td className="py-2 pr-3 text-foreground">
                        {item.currentQuantity} {item.unit}
                        {item.fillPercent !== null ? <span className="ml-1 text-xs text-foreground-subtle">({item.fillPercent}%)</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.packageCapacity !== null ? `${item.packageCapacity} ${item.unit} × ${item.packageCount ?? 1}` : "Não informado"}
                      </td>
                      <td className="py-2 pr-3">
                        {item.quantityStatus === "measurement_pending" ? <Badge variant="warning">Pendente</Badge> : <span className="text-xs text-foreground-subtle">Confirmada</span>}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.minimumStock !== null ? `${item.minimumStock} ${item.unit}` : "Estoque mínimo ainda não configurado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.unitCost !== null ? formatCurrency(item.unitCost) : "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{lastMovementByItem[item.id] ? formatDateBR(lastMovementByItem[item.id]) : "Sem movimentação"}</td>
                      <td className="py-2 pr-3 text-foreground-subtle">Não informado</td>
                      <td className="py-2">
                        <Badge variant={statusMeta[item.status].variant}>{statusMeta[item.status].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
