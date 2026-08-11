"use server";

import { revalidatePath } from "next/cache";
import { processAutomaticConsumption } from "@/lib/jumppark-orders/automatic-consumption";
import { saoPauloDateISO } from "@/lib/utils/timezone";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

/**
 * Disparo manual do consumo automático (Missão de Automação JumpPark → Consumo, seção 14) —
 * mesma função usada pela sincronização quando `INVENTORY_CONSUMPTION_MODE=automatic`, chamada
 * aqui explicitamente por um humano, sempre para o dia de hoje, nunca retroativo.
 */
export async function processAutomaticConsumptionNowAction(): Promise<FormActionState> {
  const today = saoPauloDateISO();
  try {
    const summary = await processAutomaticConsumption(today, today);
    revalidatePath("/estoque/consumo-automatico");
    revalidatePath("/estoque/ordens");
    revalidatePath("/estoque/consumos");
    revalidatePath("/estoque");
    return {
      error: null,
      success: `Processamento concluído: ${summary.ordersConsumed} ordem(ns) consumida(s), ${summary.totalLinesConsumed} linha(s), ${summary.ordersUnmapped} não mapeada(s), ${summary.ordersWithoutApprovedRecipe} sem receita, ${summary.ordersFailed} falha(s).`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao processar consumo automático.", success: null };
  }
}
