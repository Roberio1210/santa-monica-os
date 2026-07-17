import "server-only";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { calculateConcentrateConsumed } from "@/lib/recipes/dilution";
import { computeRecipeStats } from "@/lib/recipes/stats";
import type { RecipeStats } from "@/lib/recipes/stats";
import { MIN_SAMPLES_FOR_PROVISIONAL } from "@/lib/recipes/types";
import type {
  CalibrationSample,
  NewRecipeInput,
  NewSampleInput,
  ProcessStep,
  Recipe,
  VehicleCategory,
} from "@/lib/recipes/types";

export { calculateConcentrateConsumed, type ConcentrateInput } from "@/lib/recipes/dilution";

/**
 * Cria uma receita nova em status "rascunho". Nunca cria uma segunda versão ativa para a
 * mesma combinação serviço + categoria de veículo + etapa + produto — para isso, ver
 * createNewVersion sobre uma receita já existente.
 */
export async function createRecipe(input: NewRecipeInput): Promise<Recipe> {
  const repo = getRecipeRepository();
  const existing = await repo.findActiveRecipe(input.serviceId, input.vehicleCategory, input.processStep, input.itemId);
  if (existing) {
    throw new Error(
      `Já existe uma receita ativa para esta combinação (serviço=${input.serviceId}, categoria=${input.vehicleCategory}, etapa=${input.processStep}, produto=${input.itemId}, versão=${existing.version}). Use createNewVersion para revisar.`,
    );
  }
  return repo.createRecipe(input);
}

/** Edita apenas notas/diluição-padrão de uma receita existente — nunca a combinação que a identifica. */
export async function editRecipe(id: string, patch: { notes?: string | null; dilutionRatio?: number | null }): Promise<Recipe> {
  const repo = getRecipeRepository();
  return repo.updateRecipe(id, patch);
}

/**
 * Registra uma amostra de calibração, calcula o concentrado consumido (nunca confundindo
 * solução preparada com concentrado) e recalcula as estatísticas da receita.
 */
export async function addSample(input: Omit<NewSampleInput, "concentrateConsumed">): Promise<CalibrationSample> {
  const repo = getRecipeRepository();
  const recipe = await repo.getRecipe(input.recipeId);
  if (!recipe) throw new Error(`Receita não encontrada: ${input.recipeId}`);
  if (recipe.status === "suspensa") throw new Error("Receita suspensa não aceita novas amostras — crie uma nova versão primeiro.");

  const concentrateConsumed = calculateConcentrateConsumed({
    quantityBefore: input.quantityBefore,
    quantityAfter: input.quantityAfter,
    preparedQuantity: input.preparedQuantity,
    dilutionRatio: input.dilutionRatio,
    leftoverReused: input.leftoverReused,
    discarded: input.discarded,
  });

  const sample = await repo.addSample({ ...input, concentrateConsumed });
  await recalculateStatistics(input.recipeId);
  return sample;
}

/** Exclui uma amostra do cálculo — nunca a apaga, sempre exige justificativa. */
export async function excludeSample(sampleId: string, reason: string): Promise<CalibrationSample> {
  if (!reason || reason.trim().length === 0) {
    throw new Error("Justificativa obrigatória para excluir uma amostra.");
  }
  const repo = getRecipeRepository();
  const sample = await repo.updateSample(sampleId, { status: "excluida", exclusionReason: reason.trim() });
  await recalculateStatistics(sample.recipeId);
  return sample;
}

/**
 * Recalcula mediana/mínimo/máximo/quantidade a partir das amostras válidas e persiste na
 * receita. Nunca aprova automaticamente — só avança rascunho → em_calibracao quando a
 * primeira amostra chega (bookkeeping, não aprovação).
 */
export async function recalculateStatistics(recipeId: string): Promise<Recipe> {
  const repo = getRecipeRepository();
  const recipe = await repo.getRecipe(recipeId);
  if (!recipe) throw new Error(`Receita não encontrada: ${recipeId}`);

  const samples = await repo.listSamples(recipeId);
  const stats = computeRecipeStats(samples);

  const nextStatus = recipe.status === "rascunho" && stats.validSampleCount > 0 ? "em_calibracao" : recipe.status;

  return repo.updateRecipe(recipeId, {
    quantityPerService: stats.median,
    minObserved: stats.min,
    maxObserved: stats.max,
    sampleCount: stats.validSampleCount,
    lastCalibratedAt: stats.validSampleCount > 0 ? new Date().toISOString().slice(0, 10) : recipe.lastCalibratedAt,
    status: nextStatus,
  });
}

/**
 * Aprova manualmente uma receita — exige explicitamente ao menos MIN_SAMPLES_FOR_PROVISIONAL
 * amostras válidas (nunca aprovação automática). PREFERRED_SAMPLES_FOR_APPROVAL (10) é apenas
 * recomendado, não bloqueante.
 */
export async function approveRecipe(id: string): Promise<Recipe> {
  const repo = getRecipeRepository();
  const recipe = await repo.getRecipe(id);
  if (!recipe) throw new Error(`Receita não encontrada: ${id}`);
  if (recipe.status === "suspensa") throw new Error("Receita suspensa não pode ser aprovada diretamente — crie uma nova versão primeiro.");
  if (recipe.sampleCount < MIN_SAMPLES_FOR_PROVISIONAL) {
    throw new Error(`Receita precisa de ao menos ${MIN_SAMPLES_FOR_PROVISIONAL} amostras válidas para ser aprovada (tem ${recipe.sampleCount}).`);
  }
  return repo.updateRecipe(id, { status: "aprovada" });
}

/** Suspende uma receita — deixa de ser aplicável para consumo, mas preserva histórico/amostras. */
export async function suspendRecipe(id: string): Promise<Recipe> {
  const repo = getRecipeRepository();
  return repo.updateRecipe(id, { status: "suspensa" });
}

/**
 * Cria uma nova versão de uma receita (mesma combinação serviço/categoria/etapa/produto),
 * reiniciando estatísticas e amostras — a versão anterior deixa de ser ativa mas permanece
 * no banco com seu status final preservado (histórico nunca apagado).
 */
export async function createNewVersion(recipeId: string): Promise<Recipe> {
  const repo = getRecipeRepository();
  const previous = await repo.getRecipe(recipeId);
  if (!previous) throw new Error(`Receita não encontrada: ${recipeId}`);

  await repo.updateRecipe(previous.id, { isActiveVersion: false });

  const created = await repo.createRecipe({
    serviceId: previous.serviceId,
    itemId: previous.itemId,
    vehicleCategory: previous.vehicleCategory,
    processStep: previous.processStep,
    unit: previous.unit,
    dilutionRatio: previous.dilutionRatio,
    notes: previous.notes,
  });
  return repo.updateRecipe(created.id, { version: previous.version + 1 });
}

/** Só retorna receitas com status "aprovada" — a única que pode alimentar consumo automático nas fases seguintes. */
export async function findApplicableRecipe(serviceId: string, vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<Recipe | null> {
  const repo = getRecipeRepository();
  const recipe = await repo.findActiveRecipe(serviceId, vehicleCategory, processStep, itemId);
  return recipe && recipe.status === "aprovada" ? recipe : null;
}

export interface ExpectedConsumption {
  recipeId: string;
  quantity: number;
  unit: Recipe["unit"];
  sampleCount: number;
}

/** null quando não há receita aprovada aplicável, ou quando a mediana ainda não está disponível — nunca inventa um número. */
export async function computeExpectedConsumption(
  serviceId: string,
  vehicleCategory: VehicleCategory,
  processStep: ProcessStep,
  itemId: string,
): Promise<ExpectedConsumption | null> {
  const recipe = await findApplicableRecipe(serviceId, vehicleCategory, processStep, itemId);
  if (!recipe || recipe.quantityPerService === null) return null;
  return { recipeId: recipe.id, quantity: recipe.quantityPerService, unit: recipe.unit, sampleCount: recipe.sampleCount };
}

export interface CalibrationStatusSummary {
  status: Recipe["status"];
  sampleCount: number;
  isProvisional: boolean;
  isApprovalReady: boolean;
  median: number | null;
  min: number | null;
  max: number | null;
}

export async function getCalibrationStatus(recipeId: string): Promise<CalibrationStatusSummary> {
  const repo = getRecipeRepository();
  const recipe = await repo.getRecipe(recipeId);
  if (!recipe) throw new Error(`Receita não encontrada: ${recipeId}`);
  return {
    status: recipe.status,
    sampleCount: recipe.sampleCount,
    isProvisional: recipe.sampleCount >= MIN_SAMPLES_FOR_PROVISIONAL,
    isApprovalReady: recipe.sampleCount >= MIN_SAMPLES_FOR_PROVISIONAL,
    median: recipe.quantityPerService,
    min: recipe.minObserved,
    max: recipe.maxObserved,
  };
}

export interface RecipeCombination {
  serviceId: string;
  vehicleCategory: VehicleCategory;
  processStep: ProcessStep;
  itemId: string;
}

/**
 * Recebe uma lista de combinações candidatas (o chamador decide quais combinações interessam —
 * nunca inventamos um produto cartesiano de todos os serviços × categorias × etapas × produtos,
 * o que geraria centenas de combinações sem sentido de negócio) e devolve só as que ainda não
 * têm receita ativa.
 */
export async function listCombinationsWithoutRecipe(combinations: RecipeCombination[]): Promise<RecipeCombination[]> {
  const repo = getRecipeRepository();
  const missing: RecipeCombination[] = [];
  for (const combo of combinations) {
    const existing = await repo.findActiveRecipe(combo.serviceId, combo.vehicleCategory, combo.processStep, combo.itemId);
    if (!existing) missing.push(combo);
  }
  return missing;
}

/** Receitas ativas com menos amostras que o mínimo para referência provisória — nunca inclui receitas suspensas. */
export async function listRecipesWithFewSamples(threshold: number = MIN_SAMPLES_FOR_PROVISIONAL): Promise<Recipe[]> {
  const repo = getRecipeRepository();
  const recipes = await repo.listRecipes();
  return recipes.filter((r) => r.isActiveVersion && r.status !== "suspensa" && r.sampleCount < threshold);
}

export type { RecipeStats };
