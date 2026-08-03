import type { InventoryItemView } from "@/lib/inventory/types";

/** Decisão desta sprint (Missão 22) — "sem movimentação" pedido pelo negócio, não uma regra recebida com um número específico. */
export const STALE_MOVEMENT_THRESHOLD_DAYS = 180;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `lastMovementDate` null = nunca teve nenhuma movimentação registrada além da carga inicial — conta como parado. */
export function isStaleItem(lastMovementDate: string | null, referenceDate: Date, thresholdDays: number = STALE_MOVEMENT_THRESHOLD_DAYS): boolean {
  if (lastMovementDate === null) return true;
  const daysSince = Math.floor((referenceDate.getTime() - Date.parse(lastMovementDate)) / 86_400_000);
  return daysSince >= thresholdDays;
}

export interface TotalStockValueResult {
  /** Soma só dos itens com custo médio cadastrado — nunca estima o valor de um item sem custo. */
  knownValue: number;
  /** Quantos itens ativos não entram em `knownValue` por não terem custo cadastrado ainda. */
  itemsWithoutCost: number;
}

/**
 * "Valor total do estoque" (Missão 22) — soma real, nunca inventada. Como nenhum dos 65 produtos
 * reais tem custo médio cadastrado ainda (só populado a partir da 1ª entrada manual com preço),
 * `knownValue` pode ficar bem abaixo do valor real até que as entradas comecem a alimentar o
 * custo médio — por isso `itemsWithoutCost` é sempre exposto junto, nunca escondido.
 */
export function computeTotalStockValue(items: Pick<InventoryItemView, "stockValue">[]): TotalStockValueResult {
  let knownValue = 0;
  let itemsWithoutCost = 0;
  for (const item of items) {
    if (item.stockValue === null) {
      itemsWithoutCost += 1;
    } else {
      knownValue += item.stockValue;
    }
  }
  return { knownValue: round2(knownValue), itemsWithoutCost };
}
