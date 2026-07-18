import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { listServiceMappings } from "@/lib/orders/service-mapping";
import { getVehicleCategory } from "@/lib/orders/vehicle-category";
import { computeConsumptionPreview, type ConsumptionPreview, type PreviewItem, type PreviewServiceMapping } from "@/lib/orders/preview";
import type { EligibleOrder } from "@/lib/orders/types";
import type { Recipe } from "@/lib/recipes/types";

/** Reúne mapeamentos, receitas e saldos reais e delega o julgamento a computeConsumptionPreview (pura). */
export async function fetchOrderPreview(order: EligibleOrder): Promise<ConsumptionPreview> {
  const [mappings, allRecipes, allItems, vehicleCategory] = await Promise.all([
    listServiceMappings(),
    getRecipeRepository().listRecipes(),
    getInventoryRepository().listItems(),
    getVehicleCategory(order.plateNormalized),
  ]);

  const serviceMappings = new Map<string, PreviewServiceMapping>();
  for (const m of mappings) {
    serviceMappings.set(m.jumpparkServiceName, { canonicalServiceId: m.canonicalServiceId, canonicalServiceName: m.canonicalServiceName, status: m.status });
  }

  const recipesByService = new Map<string, Recipe[]>();
  for (const recipe of allRecipes) {
    if (!recipe.isActiveVersion) continue;
    const key = `${recipe.serviceId}:${recipe.vehicleCategory}`;
    const list = recipesByService.get(key) ?? [];
    list.push(recipe);
    recipesByService.set(key, list);
  }

  const itemsById = new Map<string, PreviewItem>();
  for (const item of allItems) {
    itemsById.set(item.id, { id: item.id, name: item.name, unit: item.unit, currentQuantity: item.currentQuantity, unitCost: item.unitCost });
  }

  return computeConsumptionPreview({
    externalId: order.externalId,
    services: order.services,
    vehicleCategory,
    activeConfirmationId: order.activeConfirmationId,
    serviceMappings,
    recipesByService,
    itemsById,
  });
}
