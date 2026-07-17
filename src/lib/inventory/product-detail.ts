import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { fetchServiceNameMap } from "@/lib/inventory/services-catalog";
import { toItemView } from "@/lib/inventory/status";
import { computeItemAutonomy, type AutonomyResult } from "@/lib/inventory/autonomy";
import type { InventoryItemView, StockMovement } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

export interface ProductRecipeUsage {
  recipe: Recipe;
  serviceName: string;
}

export interface ProductDetail {
  item: InventoryItemView;
  movements: StockMovement[];
  recipes: ProductRecipeUsage[];
  /** Mesma marca + prefixo do nome — usado para nunca esconder lotes/embalagens do "mesmo" produto real, mesmo cadastrados como itens separados (ex.: Composto Polidor Extra Forte). */
  relatedItems: InventoryItemView[];
  lastEntryDate: string | null;
  lastConsumptionDate: string | null;
  autonomy: AutonomyResult;
}

function namePrefix(name: string): string {
  return name.trim().toLowerCase().split(" ").slice(0, 3).join(" ");
}

export async function fetchProductDetail(id: string): Promise<ProductDetail | null> {
  const inventoryRepo = getInventoryRepository();
  const item = await inventoryRepo.getItem(id);
  if (!item) return null;

  const [allItems, movements, allRecipes, serviceNames] = await Promise.all([
    inventoryRepo.listItems(),
    inventoryRepo.listMovements(id),
    getRecipeRepository().listRecipes(),
    fetchServiceNameMap(),
  ]);

  const sortedMovements = [...movements].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));

  const recipes: ProductRecipeUsage[] = allRecipes
    .filter((r) => r.itemId === id && r.isActiveVersion)
    .map((recipe) => ({ recipe, serviceName: serviceNames.get(recipe.serviceId) ?? "Serviço não encontrado" }));

  const prefix = namePrefix(item.name);
  const relatedItems = allItems
    .filter((i) => i.id !== id && i.brand === item.brand && namePrefix(i.name) === prefix)
    .map(toItemView);

  const entries = sortedMovements.filter((m) => m.type === "entrada" || m.type === "compra");
  const consumptions = sortedMovements.filter((m) => m.type === "consumo_interno" || m.type === "consumo_teste_calibracao");
  const itemView = toItemView(item);

  return {
    item: itemView,
    movements: sortedMovements,
    recipes,
    relatedItems,
    lastEntryDate: entries[0]?.date ?? null,
    lastConsumptionDate: consumptions[0]?.date ?? null,
    autonomy: computeItemAutonomy(
      itemView,
      recipes.map((r) => r.recipe),
    ),
  };
}
