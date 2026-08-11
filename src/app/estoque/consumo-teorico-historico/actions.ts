"use server";

import { revalidatePath } from "next/cache";
import { processHistoricalTheoreticalConsumption } from "@/lib/jumppark-orders/historical-theoretical-consumption";

export interface ProcessHistoricalResult {
  error: string | null;
  success: string | null;
}

/**
 * Reprocessamento manual do histórico teórico (Missão de Histórico Retroativo) — idempotente:
 * nunca duplica uma linha já gravada (external_id único). Sempre "desde o início dos dados
 * reais" até hoje, nunca escreve saldo físico.
 */
export async function processHistoricalConsumptionAction(fromDate: string, toDate: string): Promise<ProcessHistoricalResult> {
  try {
    const summary = await processHistoricalTheoreticalConsumption(fromDate, toDate);
    revalidatePath("/estoque/consumo-teorico-historico");
    return {
      error: null,
      success: `Processado: ${summary.ordersEvaluated} ordem(ns) avaliada(s), ${summary.ordersWithMatchedService} com serviço mapeado, ${summary.linesWritten} linha(s) nova(s), ${summary.linesAlreadyExisted} já existiam.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao processar histórico teórico.", success: null };
  }
}
