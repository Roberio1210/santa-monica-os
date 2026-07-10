export type {
  InventoryCategory,
  InventoryUnit,
  InventoryCondition,
  InventoryStatus,
  InventoryItem,
  InventoryItemView,
  MovementType,
  StockMovement,
} from "@/lib/inventory/types";
export { inventoryCategories } from "@/lib/inventory/types";
export { computeStatus, computeFillPercent, computeStockValue, toItemView } from "@/lib/inventory/status";
export { fetchInventoryOverview, computeInventorySummary, type InventorySummary } from "@/lib/inventory/service";
export type { InventoryRepository } from "@/lib/inventory/repository";
