import "server-only";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { fetchProductConsumptionStartDates } from "@/lib/inventory/product-consumption-start-date";
import { getManagerialServicesRealized, type ManagerialVehicleCategoryBucket } from "@/lib/jumppark-orders/managerial-services-realized";
import { getManagerialStockWindow } from "@/lib/inventory/managerial-stock-window";
import { computeManagerialYield } from "@/lib/inventory/yield";
import { computeApparentConsumption, computeConsumptionVariance, computeExpectedManagerialConsumption } from "@/lib/inventory/managerial-consumption-variance";
import type { ExpectedConsumptionCell } from "@/lib/inventory/managerial-consumption-variance";
import type { ConsumptionVarianceStatus } from "@/lib/inventory/managerial-consumption-variance";
import type { Recipe, VehicleCategory } from "@/lib/recipes/types";

/**
 * Missão de Wiring do Consumo Gerencial V1 — só os 3 pacotes com etapas/receitas declaradas.
 * Nunca hardcoded em outro lugar do módulo — um único ponto de verdade aqui.
 */
const MANAGERIAL_PACKAGE_NAMES = ["Bronze", "Silver", "Gold"];

/**
 * "indeterminado" (nome sem NENHUM sufixo de porte reconhecível, ex. "Lavagem Gold") só é
 * traduzido para "sedan" NESTE PONTO — nunca na contagem (`getManagerialServicesRealized`, que
 * preserva o bucket honestamente separado). "sedan" é o fator neutro da camada gerencial, mesma
 * escolha já usada em `FALLBACK_RECIPE_CATEGORY` no motor de consumo teórico histórico — nunca
 * inventamos que o carro "era" sedan, só usamos o fator neutro para o cálculo agregado poder
 * rodar mesmo sem saber o porte real.
 *
 * "suv_sedan_combinado" (Missão de Estoque Gerencial V2, seção 1 — "SUV/SEDAN" no JumpPark) é
 * traduzido para "sedan" também, mas por um motivo DIFERENTE e mais forte: não é uma "categoria
 * desconhecida" — é uma decisão de negócio EXPLÍCITA do gestor de que SUV e Sedan são a MESMA
 * categoria de referência gerencial (`MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.sedan ===
 * MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.suv === 1.00`). Por isso mapear para "sedan" aqui é
 * matematicamente IDÊNTICO a mapear para "suv" — a escolha é inofensiva, nunca arbitrária no
 * sentido que importa (o resultado numérico não muda).
 */
export function toRecipeVehicleCategory(bucket: ManagerialVehicleCategoryBucket): VehicleCategory {
  return bucket === "indeterminado" || bucket === "suv_sedan_combinado" ? "sedan" : bucket;
}

export type ManagerialDataQuality = "RELIABLE" | "PARTIAL" | "INSUFFICIENT";

export interface ManagerialConsumptionAnalysisLine {
  itemId: string;
  itemName: string;
  brand: string | null;
  unit: string;
  periodStart: string;
  periodEnd: string;
  effectivePeriodStart: string;
  servicesRealized: number;
  expectedConsumption: number | null;
  apparentConsumption: number | null;
  varianceAbsolute: number | null;
  variancePercentage: number | null;
  tolerancePercentage: number | null;
  status: ConsumptionVarianceStatus;
  dataQuality: ManagerialDataQuality;
  /** RENDIMENTO GERENCIAL ESTIMADO — nunca "real"/"garantido". Null quando faltar embalagem ou baseline. */
  expectedServicesPerPackage: number | null;
  /** Combinações (serviço,porte) STANDARD que alimentaram expectedConsumption, e quantas ficaram fora por serem alternative/conditional ou sem baseline. */
  cellsIncluded: number;
  cellsExcludedNotStandard: number;
  cellsExcludedNoBaseline: number;
  reasons: string[];
}

export interface ManagerialConsumptionAnalysisResult {
  periodStart: string;
  periodEnd: string;
  lines: ManagerialConsumptionAnalysisLine[];
  servicesRealizedTotal: { serviceId: string; serviceName: string; vehicleCategoryBucket: ManagerialVehicleCategoryBucket; servicesRealized: number }[];
  ordersEvaluated: number;
  ordersUnmapped: number;
  unmappedDescriptions: string[];
}

export function determineDataQuality(line: Pick<ManagerialConsumptionAnalysisLine, "expectedConsumption" | "apparentConsumption" | "status">, stockAdjusted: boolean, hasIndeterminadoBucket: boolean): ManagerialDataQuality {
  if (line.expectedConsumption === null || line.apparentConsumption === null || line.status === "INSUFFICIENT_DATA") return "INSUFFICIENT";
  if (stockAdjusted || hasIndeterminadoBucket) return "PARTIAL";
  return "RELIABLE";
}

/**
 * Núcleo puro (sem I/O) — monta as células de `computeExpectedManagerialConsumption` para as
 * receitas de UM produto, a partir de um mapa `serviceId:bucket -> servicesRealized` já buscado
 * (`getManagerialServicesRealized`). Extraída para ser reaproveitada tanto pelo agregador do
 * período inteiro (`computeManagerialConsumptionAnalysis`) quanto pela análise entre duas
 * contagens (`analyzeConsumptionBetweenCounts`) — nunca duplicando esta lógica duas vezes.
 * "indeterminado" e "suv_sedan_combinado" (Missão de Estoque Gerencial V2, seção 1) são
 * atribuídos exclusivamente à receita "sedan", nunca também à "suv" — atribuir aos dois
 * duplicaria a contagem. Matematicamente seguro porque
 * `MANAGERIAL_VEHICLE_SIZE_MULTIPLIER.sedan === .suv === 1.00` desde a V2.
 */
export function buildExpectedConsumptionCellsForItem(recipes: Recipe[], servicesRealizedByKey: Map<string, number>): ExpectedConsumptionCell[] {
  return recipes.map((recipe) => {
    const matchingBuckets: ManagerialVehicleCategoryBucket[] = recipe.vehicleCategory === "sedan" ? ["sedan", "indeterminado", "suv_sedan_combinado"] : [recipe.vehicleCategory];
    let servicesRealizedForRecipe = 0;
    for (const bucket of matchingBuckets) {
      servicesRealizedForRecipe += servicesRealizedByKey.get(`${recipe.serviceId}:${bucket}`) ?? 0;
    }
    return {
      usageType: recipe.usageType,
      managerialBaselineQuantity: recipe.managerialBaselineQuantity,
      managerialSizeAdjustmentApplicable: recipe.managerialSizeAdjustmentApplicable,
      vehicleCategory: toRecipeVehicleCategory(recipe.vehicleCategory),
      servicesRealized: servicesRealizedForRecipe,
    };
  });
}

/**
 * Receitas ativas de um item, restritas a Bronze/Silver/Gold e com baseline gerencial
 * configurado — mesmo filtro usado pelo agregador do período inteiro, extraído para reuso.
 */
export async function fetchManagerialRecipesByItem(): Promise<{ recipesByItem: Map<string, Recipe[]>; managerialServiceIds: Set<string> }> {
  const db = getDb();
  const [allRecipes, allServices] = await Promise.all([getRecipeRepository().listRecipes(), db ? db.select({ id: services.id, name: services.name }).from(services) : Promise.resolve([])]);

  const managerialServiceIds = new Set(allServices.filter((s) => MANAGERIAL_PACKAGE_NAMES.includes(s.name)).map((s) => s.id));
  const recipesByItem = new Map<string, Recipe[]>();
  for (const recipe of allRecipes) {
    if (!recipe.isActiveVersion) continue;
    if (!managerialServiceIds.has(recipe.serviceId)) continue;
    if (recipe.managerialBaselineQuantity === null) continue;
    const list = recipesByItem.get(recipe.itemId) ?? [];
    list.push(recipe);
    recipesByItem.set(recipe.itemId, list);
  }
  return { recipesByItem, managerialServiceIds };
}

/**
 * Orquestra (I/O real) tudo que já existe: `getManagerialServicesRealized` (JumpPark),
 * `getManagerialStockWindow` (ledger de estoque), `computeExpectedManagerialConsumption`/
 * `computeApparentConsumption`/`computeConsumptionVariance`/`computeManagerialYield` (núcleos
 * puros da missão anterior — nunca duplicados aqui). READ-ONLY: nenhuma escrita em
 * `inventory_movements`/`inventory_items`/`historical_theoretical_consumption`/
 * `service_consumption_rules`. Nunca chama `approveRecipe`/`recalculateStatistics`/qualquer
 * caminho do motor real (`preview.ts`/`automatic-consumption.ts`/`resolution.ts`).
 */
export async function computeManagerialConsumptionAnalysis(periodStart: string, periodEnd: string): Promise<ManagerialConsumptionAnalysisResult> {
  const [servicesRealizedResult, { recipesByItem }, allItems, productStartDates] = await Promise.all([
    getManagerialServicesRealized(periodStart, periodEnd),
    fetchManagerialRecipesByItem(),
    getInventoryRepository().listItems(),
    fetchProductConsumptionStartDates(),
  ]);

  const itemById = new Map(allItems.map((i) => [i.id, i]));

  // servicesRealized indexado por "serviceId:bucket" para lookup O(1) ao montar as células.
  const servicesRealizedByKey = new Map(servicesRealizedResult.cells.map((c) => [`${c.serviceId}:${c.vehicleCategoryBucket}`, c.servicesRealized]));
  // "suv_sedan_combinado" NÃO conta como limitação de qualidade (Missão de Estoque Gerencial V2) —
  // é uma decisão de negócio confiante (SUV=Sedan=1.00), não uma lacuna de dado. Só "indeterminado"
  // (nome sem NENHUM sufixo de porte) representa incerteza real.
  const hasIndeterminadoBucket = servicesRealizedResult.cells.some((c) => c.vehicleCategoryBucket === "indeterminado");

  const lines: ManagerialConsumptionAnalysisLine[] = [];

  for (const [itemId, recipes] of recipesByItem) {
    const item = itemById.get(itemId);
    if (!item) continue;

    const effectiveDataStart = productStartDates.get(itemId) ?? null;
    const cells = buildExpectedConsumptionCellsForItem(recipes, servicesRealizedByKey);
    const expected = computeExpectedManagerialConsumption(cells);
    const stockWindow = await getManagerialStockWindow(itemId, periodStart, periodEnd, effectiveDataStart);
    const apparentConsumption = computeApparentConsumption({ openingQuantity: stockWindow.openingQuantity, entradas: stockWindow.entradas, currentQuantity: stockWindow.currentQuantity });

    // Todas as receitas de um mesmo produto compartilham a mesma tolerância (populadas juntas na missão anterior) — pega a primeira não nula.
    const tolerancePercentage = recipes.find((r) => r.managerialTolerancePercentage !== null)?.managerialTolerancePercentage ?? null;
    const variance = computeConsumptionVariance({ expectedConsumption: expected.expectedConsumption, apparentConsumption, tolerancePercentage });
    const yieldEstimate = computeManagerialYield(item.packageCapacity, recipes[0]?.managerialBaselineQuantity ?? null);

    const reasons = [...stockWindow.reasons];
    if (expected.expectedConsumption === null) {
      reasons.push(
        expected.cellsExcludedNotStandard > 0 && expected.cellsIncluded === 0
          ? "Nenhuma receita STANDARD deste produto tem contagem/baseline suficiente — produto participa só como alternative/conditional (nunca somado automaticamente)."
          : "Nenhuma célula STANDARD com baseline gerencial contribuiu para este produto no período.",
      );
    }
    if (hasIndeterminadoBucket) {
      reasons.push("Parte dos serviços realizados no período tem porte indeterminado (nome JumpPark sem nenhum sufixo de categoria, ex. 'Lavagem Gold') — tratado como neutro (sedan, fator 1.00) só para o cálculo, nunca presumido como sedan real.");
    }

    lines.push({
      itemId,
      itemName: item.name,
      brand: item.brand,
      unit: item.unit,
      periodStart,
      periodEnd,
      effectivePeriodStart: stockWindow.effectivePeriodStart,
      servicesRealized: cells.reduce((sum, c) => sum + c.servicesRealized, 0),
      expectedConsumption: expected.expectedConsumption,
      apparentConsumption,
      varianceAbsolute: variance.varianceAbsolute,
      variancePercentage: variance.variancePercentage,
      tolerancePercentage,
      status: variance.status,
      dataQuality: determineDataQuality({ expectedConsumption: expected.expectedConsumption, apparentConsumption, status: variance.status }, stockWindow.periodAdjusted, hasIndeterminadoBucket),
      expectedServicesPerPackage: yieldEstimate.expectedServicesPerPackage,
      cellsIncluded: expected.cellsIncluded,
      cellsExcludedNotStandard: expected.cellsExcludedNotStandard,
      cellsExcludedNoBaseline: expected.cellsExcludedNoBaseline,
      reasons,
    });
  }

  lines.sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR"));

  return {
    periodStart,
    periodEnd,
    lines,
    servicesRealizedTotal: servicesRealizedResult.cells,
    ordersEvaluated: servicesRealizedResult.ordersEvaluated,
    ordersUnmapped: servicesRealizedResult.ordersUnmapped,
    unmappedDescriptions: servicesRealizedResult.unmappedDescriptions,
  };
}
