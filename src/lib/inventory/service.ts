import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { InventoryItemView } from "@/lib/inventory/types";

export interface InventorySummary {
  totalItems: number;
  lowStockCount: number;
  nearEmptyCount: number;
  sealedCount: number;
  /** Soma de stockValue apenas dos itens com unitCost cadastrado. Null quando nenhum item tem custo. */
  totalStockValue: number | null;
  itemsWithoutMinimum: number;
}

const NEAR_EMPTY_THRESHOLD_PERCENT = 20;

export function computeInventorySummary(items: InventoryItemView[]): InventorySummary {
  const lowStockCount = items.filter((i) => i.status === "atencao" || i.status === "comprar").length;
  const nearEmptyCount = items.filter((i) => i.fillPercent !== null && i.fillPercent <= NEAR_EMPTY_THRESHOLD_PERCENT).length;
  const sealedCount = items.filter((i) => i.condition === "lacrado").length;
  const itemsWithoutMinimum = items.filter((i) => i.status === "sem_minimo").length;

  const itemsWithCost = items.filter((i) => i.stockValue !== null);
  const totalStockValue = itemsWithCost.length > 0 ? itemsWithCost.reduce((sum, i) => sum + (i.stockValue ?? 0), 0) : null;

  return {
    totalItems: items.length,
    lowStockCount,
    nearEmptyCount,
    sealedCount,
    totalStockValue,
    itemsWithoutMinimum,
  };
}

export async function fetchInventoryOverview(): Promise<{ items: InventoryItemView[]; summary: InventorySummary }> {
  const items = await getInventoryRepository().listItems();
  const views = items.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { items: views, summary: computeInventorySummary(views) };
}
