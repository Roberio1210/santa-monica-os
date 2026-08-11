import "server-only";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { listServices } from "@/lib/inventory/services-catalog";
import { listServiceMappings } from "@/lib/jumppark-orders/service-mapping";
import { computeServiceCostEstimate, type ServiceCostEstimate } from "@/lib/recipes/serviceCost";
import type { CalibrationSample, Recipe } from "@/lib/recipes/types";
import type { ServiceMapping } from "@/lib/jumppark-orders/types";

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

export interface ServiceCostSummary {
  serviceId: string;
  serviceName: string;
  estimate: ServiceCostEstimate;
}

/**
 * Missão de Instrumentação Gerencial — uma linha por serviço real do catálogo (19 hoje), sempre.
 * Soma as receitas aprovadas de TODAS as categorias de veículo do serviço (limitação documentada:
 * quando existir receita aprovada para mais de uma categoria de veículo, o custo somado pode não
 * refletir um único atendimento real — refinar por categoria quando o volume de dados justificar).
 * Hoje (0 receitas cadastradas na base) toda linha aparece com "Custo parcial", exatamente como
 * deveria — nenhum custo foi inventado só para preencher a tela.
 */
export async function listServiceCostEstimates(): Promise<ServiceCostSummary[]> {
  const [recipes, items, services] = await Promise.all([getRecipeRepository().listRecipes(), getInventoryRepository().listItems(), listServices()]);
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const itemCostById = new Map(items.map((i) => [i.id, i.unitCost]));

  const activeRecipesByService = new Map<string, Recipe[]>();
  for (const r of recipes) {
    if (!r.isActiveVersion) continue;
    const list = activeRecipesByService.get(r.serviceId) ?? [];
    list.push(r);
    activeRecipesByService.set(r.serviceId, list);
  }

  return services
    .map((service) => {
      const serviceRecipes = activeRecipesByService.get(service.id) ?? [];
      const recipeCostInputs = serviceRecipes.map((r) => ({
        itemId: r.itemId,
        itemName: itemMap.get(r.itemId)?.name ?? "Produto não encontrado",
        processStep: r.processStep,
        quantityPerService: r.quantityPerService,
        unit: r.unit,
        status: r.status,
        isActiveVersion: r.isActiveVersion,
      }));
      return { serviceId: service.id, serviceName: service.name, estimate: computeServiceCostEstimate(recipeCostInputs, itemCostById) };
    })
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR"));
}

function normalizeForExactMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface ServiceCostForCategoryResult {
  /** true quando foi possível conectar a categoria JumpPark a um serviço real do catálogo de receitas. */
  mapped: boolean;
  summary: ServiceCostSummary | null;
}

/**
 * Missão de Fechamento de Lacunas Operacionais — conecta a categoria de serviço vendida na
 * JumpPark (texto livre) ao catálogo de receitas (`services`), para mostrar o custo conhecido
 * na própria tela do serviço (`/ordens/servicos/[slug]`). Nunca adivinha: só conecta via (1) um
 * mapeamento humano já confirmado em `jumppark_service_mappings` ou (2) nome exatamente igual
 * (case/acento insensível) ao catálogo — mesmo critério já usado em `servicesQuery.ts` para
 * "nunca vendido". Auditoria real (07/08/2026): os 40 mapeamentos existentes estavam 0%
 * confirmados — "não mapeado" é o estado honesto e esperado até o usuário mapear em
 * /estoque/mapeamentos, nunca um bug desta função.
 */
export function matchServiceCostEstimateForCategory(
  category: string,
  mappings: Pick<ServiceMapping, "jumpparkServiceName" | "canonicalServiceId" | "status">[],
  estimates: ServiceCostSummary[],
): ServiceCostForCategoryResult {
  const normalizedCategory = normalizeForExactMatch(category);

  const confirmedMapping = mappings.find(
    (m) => m.status === "mapeado" && m.canonicalServiceId !== null && normalizeForExactMatch(m.jumpparkServiceName) === normalizedCategory,
  );
  if (confirmedMapping) {
    const summary = estimates.find((e) => e.serviceId === confirmedMapping.canonicalServiceId) ?? null;
    return { mapped: summary !== null, summary };
  }

  const exactNameMatch = estimates.find((e) => normalizeForExactMatch(e.serviceName) === normalizedCategory);
  if (exactNameMatch) return { mapped: true, summary: exactNameMatch };

  return { mapped: false, summary: null };
}

export async function getServiceCostEstimateForJumpParkCategory(category: string): Promise<ServiceCostForCategoryResult> {
  const [mappings, estimates] = await Promise.all([listServiceMappings(), listServiceCostEstimates()]);
  return matchServiceCostEstimateForCategory(category, mappings, estimates);
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
