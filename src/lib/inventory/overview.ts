import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { fetchDataQualitySummary, type DataQualitySummary } from "@/lib/inventory/data-quality";
import { toItemView } from "@/lib/inventory/status";
import type { InventoryItemView } from "@/lib/inventory/types";

export interface EstoqueOverview {
  items: InventoryItemView[];
  activeItemsCount: number;
  lowStockCount: number;
  criticalCount: number;
  monthMovementsCount: number;
  monthConsumptionCount: number;
  monthDivergenceCount: number;
  recipesInCalibration: number;
  recipesApproved: number;
  dataQuality: DataQualitySummary;
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

  const monthMovements = movements.filter((m) => isCurrentMonth(m.date, monthPrefix));
  const activeRecipes = recipes.filter((r) => r.isActiveVersion);

  return {
    items,
    activeItemsCount: items.length,
    lowStockCount: items.filter((i) => i.status === "atencao").length,
    criticalCount: items.filter((i) => i.status === "comprar").length,
    monthMovementsCount: monthMovements.length,
    monthConsumptionCount: monthMovements.filter((m) => m.type === "consumo_interno" || m.type === "consumo_teste_calibracao").length,
    monthDivergenceCount: monthMovements.filter((m) => m.type === "correcao_inventario").length,
    recipesInCalibration: activeRecipes.filter((r) => r.status === "em_calibracao").length,
    recipesApproved: activeRecipes.filter((r) => r.status === "aprovada").length,
    dataQuality,
  };
}
