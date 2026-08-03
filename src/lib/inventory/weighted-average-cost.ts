/**
 * Custo médio ponderado (Missão 22 — Estoque Inteligente) — recalculado automaticamente a cada
 * entrada manual com preço pago informado. Quando o item ainda não tem custo cadastrado, o novo
 * custo é o próprio preço pago (nada para ponderar contra). Nunca decide sozinho quando não há
 * quantidade/preço válidos — o chamador (`manual-entry.ts`) só invoca esta função quando ambos
 * existem.
 */
export function computeWeightedAverageCost(params: { currentQuantity: number; currentUnitCost: number | null; enteredQuantity: number; unitPricePaid: number }): number {
  const { currentQuantity, currentUnitCost, enteredQuantity, unitPricePaid } = params;

  if (currentUnitCost === null || currentQuantity <= 0) {
    return round2(unitPricePaid);
  }

  const totalValue = currentQuantity * currentUnitCost + enteredQuantity * unitPricePaid;
  const totalQuantity = currentQuantity + enteredQuantity;
  return round2(totalValue / totalQuantity);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
