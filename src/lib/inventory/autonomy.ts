import type { InventoryItemView } from "@/lib/inventory/types";
import type { Recipe } from "@/lib/recipes/types";

export interface AutonomyResult {
  /** Número estimado de serviços restantes com o saldo atual — null quando não há dado confiável. */
  services: number | null;
  consumptionPerService: number | null;
  reason: string;
}

/**
 * Autonomia estimada em número de serviços — só calculada quando existe ao menos uma receita
 * aprovada (mediana real de amostras) para este produto, na mesma unidade do saldo. Nunca usa
 * receita em rascunho/calibração/suspensa, e nunca inventa um consumo médio.
 */
export function computeItemAutonomy(item: InventoryItemView, itemRecipes: Recipe[]): AutonomyResult {
  const approved = itemRecipes.filter((r) => r.status === "aprovada" && r.quantityPerService !== null && r.unit === item.unit);
  if (approved.length === 0) {
    return { services: null, consumptionPerService: null, reason: "Aguardando calibração" };
  }

  const consumptionPerService = approved[0].quantityPerService as number;
  if (consumptionPerService <= 0) {
    return { services: null, consumptionPerService: null, reason: "Sem dados suficientes" };
  }

  return { services: Math.floor(item.currentQuantity / consumptionPerService), consumptionPerService, reason: "Estimado a partir de receita aprovada" };
}
