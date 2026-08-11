import { REDUCAO_TYPES } from "@/lib/inventory/stockAnalytics";
import { addDaysIso } from "@/lib/utils/timezone";
import type { InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

export type YieldConfidence = "tecnico" | "em_calibracao" | "calibrado";

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

/**
 * Escolhe a receita deste item com a maior confiança disponível: aprovada com mediana real
 * ("calibrado") > qualquer receita ativa com mediana real de pelo menos 1 amostra
 * ("em_calibracao") > referência técnica inicial sem nenhuma amostra ("tecnico"). Nunca inventa
 * um valor — cada nível só aparece quando o dado correspondente realmente existe.
 */
function pickReference(itemRecipes: Recipe[], unit: InventoryUnit): { value: number; confidence: YieldConfidence } | null {
  const sameUnit = itemRecipes.filter((r) => r.unit === unit);

  const approved = sameUnit.find((r) => r.status === "aprovada" && r.quantityPerService !== null && r.quantityPerService > 0);
  if (approved) return { value: approved.quantityPerService as number, confidence: "calibrado" };

  const calibrating = sameUnit.find((r) => r.status !== "suspensa" && r.sampleCount > 0 && r.quantityPerService !== null && r.quantityPerService > 0);
  if (calibrating) return { value: calibrating.quantityPerService as number, confidence: "em_calibracao" };

  const technical = sameUnit.find((r) => r.status !== "suspensa" && r.sampleCount === 0 && r.technicalReferenceQuantity !== null && r.technicalReferenceQuantity > 0);
  if (technical) return { value: technical.technicalReferenceQuantity as number, confidence: "tecnico" };

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
