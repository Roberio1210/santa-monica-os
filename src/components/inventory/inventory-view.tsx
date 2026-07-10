"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Droplets, Lock, PackageSearch, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { inventoryCategories } from "@/lib/inventory/types";
import type { InventoryCategory, InventoryCondition, InventoryItemView, InventoryStatus, InventoryUnit } from "@/lib/inventory/types";
import type { InventorySummary } from "@/lib/inventory/service";

const statusMeta: Record<InventoryStatus, { label: string; variant: "positive" | "warning" | "critical" | "outline" }> = {
  ok: { label: "OK", variant: "positive" },
  atencao: { label: "Atenção", variant: "warning" },
  comprar: { label: "Comprar", variant: "critical" },
  sem_minimo: { label: "Sem mínimo definido", variant: "outline" },
};

const conditionLabels: Record<InventoryCondition, string> = {
  lacrado: "Lacrado",
  aberto: "Aberto",
  pela_metade: "Pela metade",
  estimado: "Estimado",
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface InventoryViewProps {
  items: InventoryItemView[];
  summary: InventorySummary;
}

export function InventoryView({ items, summary }: InventoryViewProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | InventoryCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InventoryStatus>("all");
  const [unitFilter, setUnitFilter] = useState<"all" | InventoryUnit>("all");

  const unitOptions = useMemo(() => {
    const set = new Set<InventoryUnit>();
    for (const item of items) set.add(item.unit);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (unitFilter !== "all" && item.unit !== unitFilter) return false;
      if (query) {
        const haystack = `${item.name} ${item.brand}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, search, categoryFilter, statusFilter, unitFilter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Itens cadastrados" value={String(summary.totalItems)} icon={Boxes} />
        <StatCard label="Estoque baixo" value={String(summary.lowStockCount)} icon={AlertTriangle} hint="com mínimo definido" />
        <StatCard label="Próximos do fim" value={String(summary.nearEmptyCount)} icon={PackageSearch} hint="≤ 20% da embalagem" />
        <StatCard label="Itens lacrados" value={String(summary.sealedCount)} icon={Lock} />
        <StatCard
          label="Valor do estoque"
          value={summary.totalStockValue !== null ? formatCurrency(summary.totalStockValue) : "Informação indisponível"}
          icon={Droplets}
          hint={summary.totalStockValue !== null ? undefined : "nenhum custo cadastrado"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por produto ou marca"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Buscar por produto ou marca"
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as "all" | InventoryCategory)}
            className={fieldClasses}
            aria-label="Filtrar por categoria"
          >
            <option value="all">Todas as categorias</option>
            {inventoryCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | InventoryStatus)}
            className={fieldClasses}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            {(Object.keys(statusMeta) as InventoryStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusMeta[status].label}
              </option>
            ))}
          </select>

          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value as "all" | InventoryUnit)}
            className={fieldClasses}
            aria-label="Filtrar por unidade"
          >
            <option value="all">Todas as unidades</option>
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens em estoque — {filtered.length} de {items.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhum item encontrado" description="Não há itens para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Marca</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Quantidade atual</th>
                    <th className="pb-2 pr-3 font-medium">Embalagem</th>
                    <th className="pb-2 pr-3 font-medium">Condição</th>
                    <th className="pb-2 pr-3 font-medium">Mínimo</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Última contagem</th>
                    <th className="pb-2 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-foreground">{item.name}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.brand}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.category}</td>
                      <td className="py-2 pr-3 text-foreground">
                        {item.currentQuantity} {item.unit}
                        {item.fillPercent !== null ? (
                          <span className="ml-1 text-xs text-foreground-subtle">({item.fillPercent}%)</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.packageCapacity !== null
                          ? `${item.packageCapacity} ${item.unit} × ${item.packageCount ?? 1}`
                          : "Não informado"}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{conditionLabels[item.condition]}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.minimumStock !== null ? `${item.minimumStock} ${item.unit}` : "Sem mínimo definido"}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusMeta[item.status].variant}>{statusMeta[item.status].label}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.lastCountDate}</td>
                      <td className="py-2 max-w-xs text-xs text-foreground-subtle">{item.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Movimentações manuais</CardTitle>
          <Badge variant="outline">
            <ShieldAlert className="h-3 w-3" />
            Desabilitado
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-foreground-subtle">
            O registro de entrada, saída, ajuste de inventário, perda, consumo interno e compra está preparado na
            arquitetura, mas a submissão está desabilitada nesta versão: o projeto ainda não possui banco de dados
            (as movimentações não persistiriam de forma confiável em produção) nem autenticação para proteger essa
            ação. Consulte <span className="font-medium text-foreground-muted">docs/inventory-module.md</span> para o
            plano de habilitação.
          </p>
          <div className="grid grid-cols-2 gap-2 opacity-60 sm:grid-cols-3 lg:grid-cols-6">
            <select disabled className={fieldClasses} aria-label="Produto (desabilitado)">
              <option>Produto</option>
            </select>
            <select disabled className={fieldClasses} aria-label="Tipo de movimentação (desabilitado)">
              <option>Entrada</option>
              <option>Saída</option>
              <option>Ajuste de inventário</option>
              <option>Perda</option>
              <option>Consumo interno</option>
              <option>Compra</option>
            </select>
            <input disabled placeholder="Quantidade" className={fieldClasses} aria-label="Quantidade (desabilitado)" />
            <input disabled type="date" className={fieldClasses} aria-label="Data (desabilitado)" />
            <input disabled placeholder="Responsável" className={fieldClasses} aria-label="Responsável (desabilitado)" />
            <button disabled type="button" className={cn(fieldClasses, "cursor-not-allowed")}>
              Registrar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
