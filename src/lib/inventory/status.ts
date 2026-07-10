import type { InventoryItem, InventoryItemView, InventoryStatus } from "@/lib/inventory/types";

/**
 * Nunca infere um estoque mínimo. Quando minimumStock é null, o status é sempre
 * "sem_minimo" — essa é uma decisão deliberada do produto, não uma limitação técnica.
 */
export function computeStatus(item: Pick<InventoryItem, "currentQuantity" | "minimumStock">): InventoryStatus {
  if (item.minimumStock === null) return "sem_minimo";
  if (item.currentQuantity <= item.minimumStock) return "comprar";
  if (item.currentQuantity <= item.minimumStock * 1.5) return "atencao";
  return "ok";
}

export function computeFillPercent(
  item: Pick<InventoryItem, "currentQuantity" | "packageCapacity" | "packageCount">,
): number | null {
  if (item.packageCapacity === null) return null;
  const totalCapacity = item.packageCapacity * (item.packageCount ?? 1);
  if (totalCapacity <= 0) return null;
  return Math.round((item.currentQuantity / totalCapacity) * 100);
}

export function computeStockValue(item: Pick<InventoryItem, "currentQuantity" | "unitCost">): number | null {
  if (item.unitCost === null) return null;
  return item.currentQuantity * item.unitCost;
}

export function toItemView(item: InventoryItem): InventoryItemView {
  return {
    ...item,
    status: computeStatus(item),
    stockValue: computeStockValue(item),
    fillPercent: computeFillPercent(item),
  };
}
