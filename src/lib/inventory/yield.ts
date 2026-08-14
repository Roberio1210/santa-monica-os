import { REDUCAO_TYPES } from "@/lib/inventory/stockAnalytics";
import { addDaysIso } from "@/lib/utils/timezone";
import type { InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

/**
 * Missão do Modelo de Consumo Médio Gerencial V1 — "gerencial" inserido entre "em_calibracao" e
 * "tecnico": uma média gerencial derivada de volume de compra/operação real é mais confiável que
 * uma referência técnica nunca verificada operacionalmente, mas menos confiável que qualquer
 * amostra física real (mesmo que ainda não aprovada).
 */
export type YieldConfidence = "tecnico" | "em_calibracao" | "gerencial" | "calibrado";

export interface ItemYieldEstimate {
  currentQuantity: number;
  unit: InventoryUnit;
  /** Consumo de referência por serviço, na confiança mais alta disponível — null quando nenhuma receita tem qualquer valor configurado ainda. */
  technicalConsumption: number | null;
  confidence: YieldConfidence | null;
  /** floor(currentQuantity / technicalConsumption) — null quando technicalConsumption é null ou <= 0. */
  estimatedServicesRemaining: number | null;
  consumption7d: number;
  consumption30d: number;
  /** consumption30d / 30 — sempre calculável (0 quando não houve consumo). */
  avgDailyConsumption: number;
  /** currentQuantity / avgDailyConsumption — null quando avgDailyConsumption é 0 (sem base para prever, nunca "infinito" inventado). */
  forecastDays: number | null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface RecipeReference {
  value: number;
  confidence: YieldConfidence;
}

/**
 * Nível de confiança do valor de UMA receita: aprovada com mediana real ("calibrado") >
 * qualquer receita ativa com mediana real de pelo menos 1 amostra ("em_calibracao") >
 * baseline gerencial administrativo ("gerencial", Missão do Modelo de Consumo Médio Gerencial
 * V1) > referência técnica inicial sem nenhuma amostra ("tecnico"). Nunca inventa um valor —
 * null quando a receita não tem nenhum dos quatro. Reaproveitada tanto pelo rendimento de
 * estoque quanto pelo cálculo de consumo teórico histórico (Missão de Histórico Retroativo) —
 * a mesma regra de confiança nos dois lugares, nunca duas heurísticas divergentes. Uma receita
 * pode ter os três trilhos (`technicalReferenceQuantity`, `managerialBaselineQuantity`,
 * `quantityPerService`) preenchidos simultaneamente — nenhum é apagado pelos outros; esta
 * função só escolhe qual usar, na ordem de prioridade acima.
 */
export function pickRecipeReference(recipe: Recipe): RecipeReference | null {
  if (recipe.status === "suspensa") return null;
  if (recipe.status === "aprovada" && recipe.quantityPerService !== null && recipe.quantityPerService > 0) {
    return { value: recipe.quantityPerService, confidence: "calibrado" };
  }
  if (recipe.sampleCount > 0 && recipe.quantityPerService !== null && recipe.quantityPerService > 0) {
    return { value: recipe.quantityPerService, confidence: "em_calibracao" };
  }
  if (recipe.managerialBaselineQuantity !== null && recipe.managerialBaselineQuantity > 0) {
    return { value: recipe.managerialBaselineQuantity, confidence: "gerencial" };
  }
  if (recipe.sampleCount === 0 && recipe.technicalReferenceQuantity !== null && recipe.technicalReferenceQuantity > 0) {
    return { value: recipe.technicalReferenceQuantity, confidence: "tecnico" };
  }
  return null;
}

/** Prioriza por NÍVEL de confiança em todas as receitas do item (não pela ordem do array) — um "aprovada" sempre vence um "em_calibracao", mesmo que apareça depois. */
function pickReference(itemRecipes: Recipe[], unit: InventoryUnit): RecipeReference | null {
  const candidates = itemRecipes.filter((r) => r.unit === unit).map(pickRecipeReference).filter((r): r is RecipeReference => r !== null);
  const order: YieldConfidence[] = ["calibrado", "em_calibracao", "gerencial", "tecnico"];
  for (const tier of order) {
    const match = candidates.find((c) => c.confidence === tier);
    if (match) return match;
  }
  return null;
}

/**
 * Rendimento de estoque (Missão de Automação JumpPark → Consumo, seção 9) — pura, sem I/O.
 * `today` sempre recebido do chamador (nunca `new Date()` aqui, para permanecer testável).
 */
export function computeItemYield(item: Pick<InventoryItem, "currentQuantity" | "unit">, movements: StockMovement[], itemRecipes: Recipe[], today: string): ItemYieldEstimate {
  const since7 = addDaysIso(today, -7);
  const since30 = addDaysIso(today, -30);

  let consumption7d = 0;
  let consumption30d = 0;
  for (const m of movements) {
    if (!REDUCAO_TYPES.includes(m.type)) continue;
    if (m.date >= since30 && m.date <= today) consumption30d += m.quantity;
    if (m.date >= since7 && m.date <= today) consumption7d += m.quantity;
  }

  const avgDailyConsumption = round(consumption30d / 30, 4);
  const forecastDays = avgDailyConsumption > 0 ? Math.floor(item.currentQuantity / avgDailyConsumption) : null;

  const reference = pickReference(itemRecipes, item.unit);
  const estimatedServicesRemaining = reference && reference.value > 0 ? Math.floor(item.currentQuantity / reference.value) : null;

  return {
    currentQuantity: item.currentQuantity,
    unit: item.unit,
    technicalConsumption: reference?.value ?? null,
    confidence: reference?.confidence ?? null,
    estimatedServicesRemaining,
    consumption7d: round(consumption7d, 3),
    consumption30d: round(consumption30d, 3),
    avgDailyConsumption,
    forecastDays,
  };
}

export interface ManagerialYieldEstimate {
  /** floor(packageCapacity / managerialBaselineQuantity) — null quando faltar qualquer um dos dois, ou quando managerialBaselineQuantity <= 0. Nunca uma promessa exata. */
  expectedServicesPerPackage: number | null;
  /** Rótulo fixo para uso em qualquer interface/relatório — nunca "rendimento real"/"garantido"/"comprovado" (Missão do Modelo de Consumo Médio Gerencial V1, seção 6). */
  label: "RENDIMENTO GERENCIAL ESTIMADO";
}

/**
 * Missão do Modelo de Consumo Médio Gerencial V1, seção 6/7 — estimativa administrativa de
 * quantos serviços uma embalagem deveria render, a partir do baseline gerencial (nunca de
 * `quantityPerService`/calibração real, que tem seu próprio conceito de rendimento via
 * `computeItemYield`/`estimatedServicesRemaining`). Pura, sem I/O — nunca inventa `packageCapacity`
 * nem `managerialBaselineQuantity`; ambos vêm de quem chama.
 */
export function computeManagerialYield(packageCapacity: number | null, managerialBaselineQuantity: number | null): ManagerialYieldEstimate {
  const expectedServicesPerPackage = packageCapacity !== null && managerialBaselineQuantity !== null && managerialBaselineQuantity > 0 ? Math.floor(packageCapacity / managerialBaselineQuantity) : null;
  return { expectedServicesPerPackage, label: "RENDIMENTO GERENCIAL ESTIMADO" };
}
