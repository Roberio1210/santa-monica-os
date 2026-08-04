import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { InventoryItemView, MovementType, StockMovement } from "@/lib/inventory/types";

export type PurchaseSuggestionStatus = "sugerida" | "sem_necessidade" | "dados_insuficientes";

export interface PurchaseSuggestion {
  item: InventoryItemView;
  status: PurchaseSuggestionStatus;
  suggestedQuantity: number | null;
  /** Consumo médio real observado no livro-razão, em unidade/dia. Null quando não há histórico suficiente. */
  consumptionPerDay: number | null;
  /** Projeção de dias até o saldo atingir zero, no ritmo de consumo observado. Null sem consumptionPerDay. */
  daysUntilStockout: number | null;
  /** Prazo médio real entre compras anteriores deste produto (gap médio entre entradas/compras). Null com menos de 2 compras registradas. */
  averageLeadTimeDays: number | null;
  /** Explicação em linguagem direta de como o número foi calculado (ou por que não foi). */
  reason: string;
}

/** Tipos de movimento tratados como consumo real (saída de estoque por uso, perda ou baixa) para fins de previsão de compra. */
const CONSUMPTION_TYPES: MovementType[] = ["saida", "consumo_interno", "consumo_teste_calibracao", "perda", "avaria", "vencimento", "descarte"];
const PURCHASE_TYPES: MovementType[] = ["entrada", "compra"];

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function averageGapDays(dates: string[]): number | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 2) return null;
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGap += daysBetween(sorted[i - 1], sorted[i]);
  }
  return totalGap / (sorted.length - 1);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Exportada para teste unitário direto, sem depender do repositório. */
export function computePurchaseSuggestion(item: InventoryItemView, movements: StockMovement[]): PurchaseSuggestion {
  if (item.minimumStock === null) {
    return {
      item,
      status: "dados_insuficientes",
      suggestedQuantity: null,
      consumptionPerDay: null,
      daysUntilStockout: null,
      averageLeadTimeDays: null,
      reason: "Dados insuficientes para prever a compra — estoque mínimo ainda não configurado para este produto.",
    };
  }

  const consumptionMovements = movements.filter((m) => CONSUMPTION_TYPES.includes(m.type));
  const purchaseMovements = movements.filter((m) => PURCHASE_TYPES.includes(m.type));

  const consumptionDates = [...new Set(consumptionMovements.map((m) => m.date))];
  const totalConsumed = consumptionMovements.reduce((sum, m) => sum + m.quantity, 0);
  const periodDays = consumptionDates.length >= 2 ? daysBetween(consumptionDates[0], consumptionDates[consumptionDates.length - 1]) : 0;

  if (consumptionDates.length < 2 || periodDays <= 0 || totalConsumed <= 0) {
    return {
      item,
      status: "dados_insuficientes",
      suggestedQuantity: null,
      consumptionPerDay: null,
      daysUntilStockout: null,
      averageLeadTimeDays: null,
      reason: "Dados insuficientes para prever a compra — sem histórico de consumo real registrado para este produto (é preciso ao menos duas movimentações de saída/consumo em datas diferentes).",
    };
  }

  const consumptionPerDay = totalConsumed / periodDays;
  const daysUntilStockout = consumptionPerDay > 0 ? item.currentQuantity / consumptionPerDay : null;
  const averageLeadTimeDays = averageGapDays(purchaseMovements.map((m) => m.date));

  const belowMinimum = item.currentQuantity <= item.minimumStock;
  const projectedToRunOutBeforeNextPurchase = averageLeadTimeDays !== null && daysUntilStockout !== null && daysUntilStockout <= averageLeadTimeDays;

  if (!belowMinimum && !projectedToRunOutBeforeNextPurchase) {
    return {
      item,
      status: "sem_necessidade",
      suggestedQuantity: null,
      consumptionPerDay: round(consumptionPerDay),
      daysUntilStockout: daysUntilStockout !== null ? Math.floor(daysUntilStockout) : null,
      averageLeadTimeDays: averageLeadTimeDays !== null ? round(averageLeadTimeDays, 1) : null,
      reason:
        averageLeadTimeDays !== null
          ? `Consumo médio observado de ${round(consumptionPerDay)} ${item.unit}/dia — projeção de ${Math.floor(daysUntilStockout ?? 0)} dias até esgotar, acima do prazo médio entre compras (${round(averageLeadTimeDays, 1)} dias). Sem necessidade de compra agora.`
          : `Consumo médio observado de ${round(consumptionPerDay)} ${item.unit}/dia — saldo atual (${item.currentQuantity} ${item.unit}) ainda acima do mínimo (${item.minimumStock} ${item.unit}). Sem necessidade de compra agora.`,
    };
  }

  const target = item.idealStock ?? item.minimumStock;
  const bufferDuringLeadTime = averageLeadTimeDays !== null ? consumptionPerDay * averageLeadTimeDays : 0;
  const suggestedQuantity = Math.max(0, round(target - item.currentQuantity + bufferDuringLeadTime, 1));

  const reasonParts = [
    `Saldo atual (${item.currentQuantity} ${item.unit}) ${belowMinimum ? "está no ou abaixo do mínimo" : "deve atingir o mínimo antes da próxima compra prevista"} (${item.minimumStock} ${item.unit}).`,
    `Consumo médio observado: ${round(consumptionPerDay)} ${item.unit}/dia, com base em ${consumptionMovements.length} movimentações de saída/consumo entre ${consumptionDates[0]} e ${consumptionDates[consumptionDates.length - 1]}.`,
    averageLeadTimeDays !== null
      ? `Prazo médio real entre compras anteriores: ${round(averageLeadTimeDays, 1)} dias — sugestão inclui margem de consumo durante esse prazo.`
      : "Sem histórico de ao menos duas compras anteriores deste produto — sugestão não inclui margem de tempo de entrega.",
    `Meta: repor até o estoque ${item.idealStock !== null ? "ideal" : "mínimo (estoque ideal não configurado)"} (${target} ${item.unit}).`,
  ];

  return {
    item,
    status: "sugerida",
    suggestedQuantity,
    consumptionPerDay: round(consumptionPerDay),
    daysUntilStockout: daysUntilStockout !== null ? Math.floor(daysUntilStockout) : null,
    averageLeadTimeDays: averageLeadTimeDays !== null ? round(averageLeadTimeDays, 1) : null,
    reason: reasonParts.join(" "),
  };
}

/**
 * Compras sugeridas (Fase C, seção 10; recalculada na Missão 25) — cálculo real a partir de
 * saldo atual, estoque mínimo/ideal (cadastrados manualmente) e consumo médio comprovável,
 * derivado do próprio livro-razão de movimentações (nunca de um número inventado). O prazo médio
 * entre compras também é derivado do histórico real de entradas/compras deste produto, não de um
 * campo de "lead time" configurado à mão (que não existe no schema). Quando falta dado real
 * suficiente para calcular com segurança, a linha diz exatamente isso — nunca cai silenciosamente
 * em um cálculo com número inventado.
 */
export async function fetchPurchaseSuggestions(): Promise<PurchaseSuggestion[]> {
  const repo = getInventoryRepository();
  const [rawItems, allMovements] = await Promise.all([repo.listItems(), repo.listMovements()]);
  const items = rawItems.map(toItemView);

  const movementsByItem = new Map<string, StockMovement[]>();
  for (const movement of allMovements) {
    const list = movementsByItem.get(movement.itemId);
    if (list) list.push(movement);
    else movementsByItem.set(movement.itemId, [movement]);
  }

  return items.map((item) => computePurchaseSuggestion(item, movementsByItem.get(item.id) ?? []));
}
