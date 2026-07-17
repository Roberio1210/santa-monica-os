import "server-only";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { listServices } from "@/lib/inventory/services-catalog";
import type { CalibrationSample, Recipe } from "@/lib/recipes/types";

export interface RecipeWithNames {
  recipe: Recipe;
  serviceName: string;
  itemName: string;
  itemBrand: string;
}

/** Lista só as versões ativas — histórico de versões antigas fica disponível no detalhe de cada receita. */
export async function listRecipesWithNames(): Promise<RecipeWithNames[]> {
  const [recipes, items, services] = await Promise.all([getRecipeRepository().listRecipes(), getInventoryRepository().listItems(), listServices()]);
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const serviceMap = new Map(services.map((s) => [s.id, s.name]));

  return recipes
    .filter((r) => r.isActiveVersion)
    .map((recipe) => ({
      recipe,
      serviceName: serviceMap.get(recipe.serviceId) ?? "Serviço não encontrado",
      itemName: itemMap.get(recipe.itemId)?.name ?? "Produto não encontrado",
      itemBrand: itemMap.get(recipe.itemId)?.brand ?? "",
    }))
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR") || a.itemName.localeCompare(b.itemName, "pt-BR"));
}

export interface RecipeDetail {
  recipe: Recipe;
  samples: CalibrationSample[];
  itemId: string;
  itemName: string;
  itemBrand: string;
  itemUnit: string;
  serviceName: string;
  /** Todas as versões (ativa e antigas) da mesma combinação, em ordem — histórico nunca é apagado. */
  versionHistory: Recipe[];
}

export async function fetchRecipeDetail(id: string): Promise<RecipeDetail | null> {
  const repo = getRecipeRepository();
  const recipe = await repo.getRecipe(id);
  if (!recipe) return null;

  const [samples, items, services, allRecipes] = await Promise.all([
    repo.listSamples(id),
    getInventoryRepository().listItems(),
    listServices(),
    repo.listRecipes(),
  ]);

  const item = items.find((i) => i.id === recipe.itemId);
  const service = services.find((s) => s.id === recipe.serviceId);
  const versionHistory = allRecipes
    .filter((r) => r.serviceId === recipe.serviceId && r.vehicleCategory === recipe.vehicleCategory && r.processStep === recipe.processStep && r.itemId === recipe.itemId)
    .sort((a, b) => a.version - b.version);

  return {
    recipe,
    samples: [...samples].sort((a, b) => b.date.localeCompare(a.date)),
    itemId: recipe.itemId,
    itemName: item?.name ?? "Produto não encontrado",
    itemBrand: item?.brand ?? "",
    itemUnit: recipe.unit,
    serviceName: service?.name ?? "Serviço não encontrado",
    versionHistory,
  };
}
