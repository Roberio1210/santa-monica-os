import "server-only";
import { isJumpParkConfigured, isStoneConfigured } from "@/lib/config/env";
import { fetchOperationalOrders, type OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";
import { addDaysIso } from "@/lib/utils/timezone";
import { fetchNormalizedConciliations, successfulNormalizedConciliations, type DayFetchResult } from "@/lib/integrations/stone/multiDay";
import { reconcileStoneWithJumppark, type JumpparkOrderForReconciliation, type ReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliation";
import { deriveDivergencesFromConciliationDays, deriveDivergencesFromDayFetchResults, deriveDivergencesFromReconciliation, type Divergence } from "@/lib/integrations/stone/divergences";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";

/**
 * Único ponto de entrada público da Conciliação Stone × JumpPark (Sprint 7.0, Z3) — orquestra
 * `jumppark/operations-summary.ts` (já existente, reaproveitado sem alteração) +
 * `multiDay.ts`/`jumpparkReconciliation.ts`/`divergences.ts`. Nenhum outro módulo deve buscar
 * pedido JumpPark ou arquivo Stone diretamente para fins de conciliação — sempre por aqui.
 */
export interface JumpparkReconciliationResult {
  status: StoneResultStatus;
  error: string | null;
  limitations: string[];
  results: ReconciliationResult[];
  divergences: Divergence[];
}

/** Exportado (Z4) — reaproveitado por `persistence/importRun.ts` para não duplicar a construção do intervalo de datas. */
export function datesBetween(fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  let cursor = fromIso;
  let guard = 0;
  while (cursor <= toIso && guard < 366) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return dates;
}

function toReconciliationOrder(order: OperationalOrder): JumpparkOrderForReconciliation {
  return {
    externalReference: order.code ?? order.externalId,
    occurredAt: order.exitDateTime ?? order.entryDateTime ?? order.date,
    amount: order.totalAmount,
    paymentMethod: order.paymentMethodCategory,
    // O modelo de dado real do JumpPark não registra quantidade de parcelas — nunca inventado.
    expectedInstallments: null,
  };
}

export async function reconcileStoneWithJumpparkForPeriod(fromIso: string, toIso: string, now: Date = new Date()): Promise<JumpparkReconciliationResult> {
  if (!isStoneConfigured()) {
    return { status: "not_configured", error: "Integração Stone não configurada neste ambiente.", limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."], results: [], divergences: [] };
  }
  if (!isJumpParkConfigured()) {
    return { status: "not_configured", error: "JumpPark não configurado neste ambiente.", limitations: ["Credenciais JumpPark ausentes — clima/CRM/outras integrações nunca são consultadas para preencher esta lacuna."], results: [], divergences: [] };
  }

  const dates = datesBetween(fromIso, toIso);
  const [jumpparkResult, stoneDayResults] = await Promise.all([fetchOperationalOrders(fromIso, toIso), fetchNormalizedConciliations(dates)]);

  if (jumpparkResult.error) {
    return { status: "temporary_failure", error: jumpparkResult.error, limitations: ["Falha ao consultar o JumpPark — nenhuma divergência é inventada na ausência do dado."], results: [], divergences: [] };
  }

  const stoneDays: DayFetchResult[] = stoneDayResults;
  const successfulDays = successfulNormalizedConciliations(stoneDays);

  const chargedBackSaleRefs = new Set(successfulDays.flatMap((d) => d.chargebacks.map((cb) => cb.saleExternalReference)));
  const jumpparkOrders = jumpparkResult.orders.map(toReconciliationOrder);
  const stoneSales = successfulDays.flatMap((d) => d.sales);

  const results = reconcileStoneWithJumppark(jumpparkOrders, stoneSales, chargedBackSaleRefs, now);

  const divergences = [...deriveDivergencesFromReconciliation(results), ...deriveDivergencesFromConciliationDays(successfulDays), ...deriveDivergencesFromDayFetchResults(stoneDays)];

  const failedDaysCount = stoneDays.length - successfulDays.length;
  const limitations: string[] = [];
  if (failedDaysCount > 0) limitations.push(`${failedDaysCount} de ${stoneDays.length} dia(s) do período não tinham arquivo Stone disponível — a conciliação pode estar incompleta para esses dias, nunca tratado como divergência automática além do que já está em "arquivo_stone_ausente_ou_defasado".`);
  limitations.push("Correspondência exata depende de um identificador forte não confirmado no JumpPark hoje — a maioria das correspondências reais tende a ser probable_match, nunca certeza absoluta.");

  return { status: "ok", error: null, limitations, results, divergences };
}
