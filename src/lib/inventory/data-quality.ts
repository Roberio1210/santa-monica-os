import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { listServices, type ServiceCatalogEntry } from "@/lib/inventory/services-catalog";
import { listSuggestions, type ProductStepSuggestion } from "@/lib/inventory/suggestions";
import { toItemView } from "@/lib/inventory/status";
import { listServiceCostEstimates, type ServiceCostSummary } from "@/lib/recipes/catalog";
import { MIN_SAMPLES_FOR_PROVISIONAL } from "@/lib/recipes/types";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

export interface DataQualitySummary {
  measurementPending: InventoryItemView[];
  withoutCost: InventoryItemView[];
  withoutMinimum: InventoryItemView[];
  withoutBrand: InventoryItemView[];
  servicesWithoutRecipe: ServiceCatalogEntry[];
  recipesWithoutSamples: Recipe[];
  recipesWithFewSamples: Recipe[];
  pendingMappings: ProductStepSuggestion[];
  /** Missão de Fechamento de Lacunas Operacionais — serviços cujo custo conhecido ainda é parcial (receita ausente ou produto sem custo). */
  servicesWithPartialCost: ServiceCostSummary[];
}

/**
 * Painel de qualidade de dados (Fase C, seção 9) — tudo calculado ao vivo a partir do que já
 * existe (Fases A/B), nada persistido, nada inventado. Fornecedor e localização passaram a
 * existir no cadastro de produto na Missão 22 (Estoque Inteligente) — ver
 * `src/app/estoque/produtos/[id]/page.tsx` para a edição desses campos.
 */
export async function fetchDataQualitySummary(): Promise<DataQualitySummary> {
  const [rawItems, recipes, services, suggestions, serviceCostEstimates] = await Promise.all([
    getInventoryRepository().listItems(),
    getRecipeRepository().listRecipes(),
    listServices(),
    listSuggestions(),
    listServiceCostEstimates(),
  ]);

  const items = rawItems.map(toItemView);
  const activeRecipes = recipes.filter((r) => r.isActiveVersion);
  const servicesWithRecipe = new Set(activeRecipes.map((r) => r.serviceId));

  return {
    measurementPending: items.filter((i) => i.quantityStatus === "measurement_pending"),
    withoutCost: items.filter((i) => i.unitCost === null),
    withoutMinimum: items.filter((i) => i.minimumStock === null),
    withoutBrand: items.filter((i) => !i.brand || i.brand === "Não informado"),
    servicesWithoutRecipe: services.filter((s) => !servicesWithRecipe.has(s.id)),
    recipesWithoutSamples: activeRecipes.filter((r) => r.sampleCount === 0 && r.status !== "suspensa"),
    recipesWithFewSamples: activeRecipes.filter((r) => r.sampleCount > 0 && r.sampleCount < MIN_SAMPLES_FOR_PROVISIONAL && r.status !== "suspensa"),
    pendingMappings: suggestions.filter((s) => s.active && !s.confirmed),
    servicesWithPartialCost: serviceCostEstimates.filter((s) => s.estimate.isPartial),
  };
}
