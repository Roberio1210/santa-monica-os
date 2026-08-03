import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { fetchDataQualitySummary, type DataQualitySummary } from "@/lib/inventory/data-quality";
import { toItemView } from "@/lib/inventory/status";
import { computeTotalStockValue, isStaleItem, type TotalStockValueResult } from "@/lib/inventory/dashboard-metrics";
import type { InventoryItemView, StockMovement } from "@/lib/inventory/types";

const ENTRY_MOVEMENT_TYPES = new Set(["entrada", "compra"]);
const EXIT_MOVEMENT_TYPES = new Set(["saida", "perda", "consumo_interno", "avaria", "vencimento", "descarte", "outros", "consumo_teste_calibracao"]);
const RECENT_MOVEMENTS_LIMIT = 5;

export interface EstoqueOverview {
  items: InventoryItemView[];
  activeItemsCount: number;
  lowStockCount: number;
  criticalCount: number;
  /** Itens abaixo do mínimo — igual a `criticalCount`, mas a lista em si (Missão 22, card "Produtos críticos"). */
  criticalItems: InventoryItemView[];
  monthMovementsCount: number;
  monthConsumptionCount: number;
  monthDivergenceCount: number;
  recipesInCalibration: number;
  recipesApproved: number;
  dataQuality: DataQualitySummary;
  /** "Valor total do estoque" (Missão 22) — nunca estimado; sempre expõe quantos itens ficaram de fora por falta de custo. */
  totalStockValue: TotalStockValueResult;
  /** Produtos sem nenhuma movimentação (além da carga inicial) há 180+ dias (Missão 22). */
  staleItems: InventoryItemView[];
  /** Últimas entradas/compras registradas (Missão 22, card "Últimas entradas"). */
  recentEntries: StockMovement[];
  /** Últimas baixas registradas, qualquer motivo (Missão 22, card "Últimas baixas"). */
  recentExits: StockMovement[];
}

function isCurrentMonth(dateIso: string, monthPrefix: string): boolean {
  return dateIso.startsWith(monthPrefix);
}

/** Painel operacional de /estoque — tudo computado ao vivo, nada persistido além do que já existe. */
export async function fetchEstoqueOverview(): Promise<EstoqueOverview> {
  const [rawItems, movements, recipes, dataQuality] = await Promise.all([
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
    getRecipeRepository().listRecipes(),
    fetchDataQualitySummary(),
  ]);

  const items = rawItems.map(toItemView);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const now = new Date();

  const monthMovements = movements.filter((m) => isCurrentMonth(m.date, monthPrefix));
  const activeRecipes = recipes.filter((r) => r.isActiveVersion);

  const lastMovementDateByItem = new Map<string, string>();
  for (const m of movements) {
    const current = lastMovementDateByItem.get(m.itemId);
    if (!current || m.date > current) lastMovementDateByItem.set(m.itemId, m.date);
  }

  const sortedMovements = [...movements].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return {
    items,
    activeItemsCount: items.length,
    lowStockCount: items.filter((i) => i.status === "atencao").length,
    criticalCount: items.filter((i) => i.status === "comprar").length,
    criticalItems: items.filter((i) => i.status === "comprar"),
    monthMovementsCount: monthMovements.length,
    monthConsumptionCount: monthMovements.filter((m) => m.type === "consumo_interno" || m.type === "consumo_teste_calibracao").length,
    monthDivergenceCount: monthMovements.filter((m) => m.type === "correcao_inventario").length,
    recipesInCalibration: activeRecipes.filter((r) => r.status === "em_calibracao").length,
    recipesApproved: activeRecipes.filter((r) => r.status === "aprovada").length,
    dataQuality,
    totalStockValue: computeTotalStockValue(items),
    staleItems: items.filter((i) => isStaleItem(lastMovementDateByItem.get(i.id) ?? null, now)),
    recentEntries: sortedMovements.filter((m) => ENTRY_MOVEMENT_TYPES.has(m.type)).slice(0, RECENT_MOVEMENTS_LIMIT),
    recentExits: sortedMovements.filter((m) => EXIT_MOVEMENT_TYPES.has(m.type)).slice(0, RECENT_MOVEMENTS_LIMIT),
  };
}
