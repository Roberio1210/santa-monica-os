import "server-only";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import type { ProcessStep, RecipeResolution, VehicleCategory } from "@/lib/recipes/types";

/**
 * Missão do Protocolo Operacional V1 — mecanismo de resolução em 3 passos, construído e testado
 * mas NÃO usado por nenhum caminho de consumo automático real ainda (findApplicableRecipe/
 * computeExpectedConsumption em service.ts continuam exatamente como estão, chamados só por
 * classifyOrderForAutomaticConsumption). Fica pronto para uma missão futura ativá-lo.
 *
 * Ordem de resolução:
 *   1. receita específica (serviceId+vehicleCategory+processStep+itemId) — reaproveita
 *      findActiveRecipe sem alterá-la.
 *   2. o serviço não declara a etapa em service_operational_steps → para aqui. Uma etapa que o
 *      serviço não executa nunca "herda" produto de outro serviço.
 *   3. o serviço declara a etapa → busca receita COMPARTILHADA (serviceId nulo) para a mesma
 *      categoria+etapa+produto.
 *
 * Nunca aplica o multiplicador de porte de veículo (getVehicleSizeMultiplier) — essa função só
 * decide QUAL linha de receita se aplica; a matemática de quantidade continua exatamente onde
 * está hoje (classifyOrderForAutomaticConsumption), intocada.
 */
export async function resolveRecipe(serviceId: string, vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<RecipeResolution> {
  const repo = getRecipeRepository();

  const specific = await repo.findActiveRecipe(serviceId, vehicleCategory, processStep, itemId);
  if (specific) return { source: "specific", recipe: specific };

  const declaresStep = await repo.serviceUsesOperationalStep(serviceId, processStep);
  if (!declaresStep) return { source: "none", reason: "step_not_declared_for_service" };

  const shared = await repo.findSharedRecipe(vehicleCategory, processStep, itemId);
  if (shared) return { source: "shared", recipe: shared };

  return { source: "none", reason: "no_match" };
}

/** Wrapper de conveniência sobre repo.declareOperationalStep — usado pelo script de população e pelos testes. */
export async function declareOperationalStep(
  serviceId: string,
  processStep: ProcessStep,
  options: { externalId?: string | null; notes?: string | null } = {},
): Promise<{ created: boolean }> {
  const repo = getRecipeRepository();
  return repo.declareOperationalStep({ serviceId, processStep, externalId: options.externalId ?? null, notes: options.notes ?? null });
}
