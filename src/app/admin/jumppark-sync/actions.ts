"use server";

import { revalidatePath } from "next/cache";
import { syncJumpParkServiceOrders } from "@/lib/integrations/jumppark/sync";
import { runHistoricalBackfill, type BackfillRunResult } from "@/lib/integrations/jumppark/backfill";
import { saoPauloDateISO, addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";

/**
 * Server Action da tela `/admin/jumppark-sync` (Missão 26, Fase 1) — único ponto de entrada para
 * disparar a sincronização manual de Service Orders. Mesmo padrão de
 * `financeiro/stone-conciliacao/actions.ts` (useActionState, sem sincronização automática/cron
 * nesta primeira entrega).
 */

export interface JumpParkSyncActionState {
  error: string | null;
  success: string | null;
}

export async function syncJumpParkServiceOrdersAction(_prevState: JumpParkSyncActionState, formData: FormData): Promise<JumpParkSyncActionState> {
  const today = saoPauloDateISO();
  const fromDateRaw = String(formData.get("fromDate") ?? "");
  const toDateRaw = String(formData.get("toDate") ?? "");
  const fromDate = isValidIsoDate(fromDateRaw) ? fromDateRaw : addDaysIso(today, -7);
  const toDate = isValidIsoDate(toDateRaw) ? toDateRaw : today;

  if (fromDate > toDate) return { error: "Data inicial não pode ser depois da data final.", success: null };

  const result = await syncJumpParkServiceOrders(fromDate, toDate);

  if (result.status === "not_configured") return { error: result.errorMessage, success: null };
  if (result.status === "error") return { error: result.errorMessage, success: null };

  revalidatePath("/admin/jumppark-sync");
  const customersSummary = result.customersRefresh
    ? ` Clientes/Veículos recalculados: ${result.customersRefresh.customersUpserted} cliente(s), ${result.customersRefresh.vehiclesUpserted} veículo(s), ${result.customersRefresh.ordersLinked} ordem(ns) vinculada(s).`
    : " Recálculo de Clientes/Veículos não foi concluído — ver logs.";
  return {
    error: null,
    success: `Sincronização concluída (${fromDate} a ${toDate}): ${result.ordersFetched} ordem(ns) buscada(s) na JumpPark, ${result.ordersInserted} nova(s), ${result.ordersUpdated} atualizada(s), em ${result.durationMs}ms.${customersSummary}`,
  };
}

/**
 * Server Action do painel de Backfill Histórico (Missão 27) — cada clique roda
 * `runHistoricalBackfill` dentro de um orçamento de ~50s e devolve o progresso real (consultado
 * direto no banco). Clicar de novo com as mesmas datas continua exatamente de onde parou: lotes
 * já concluídos com sucesso nunca são refeitos.
 */
export interface JumpParkBackfillActionState {
  error: string | null;
  result: BackfillRunResult | null;
}

export async function runJumpParkBackfillAction(_prevState: JumpParkBackfillActionState, formData: FormData): Promise<JumpParkBackfillActionState> {
  const overallStart = String(formData.get("overallStart") ?? "");
  const overallEnd = String(formData.get("overallEnd") ?? "");
  const batchDaysRaw = Number.parseInt(String(formData.get("batchDays") ?? "14"), 10);
  const batchDays = Number.isFinite(batchDaysRaw) && batchDaysRaw > 0 ? batchDaysRaw : 14;

  if (!isValidIsoDate(overallStart) || !isValidIsoDate(overallEnd)) {
    return { error: "Datas inválidas — use o formato do seletor de data.", result: null };
  }
  if (overallStart > overallEnd) {
    return { error: "Data inicial não pode ser depois da data final.", result: null };
  }

  const result = await runHistoricalBackfill({ overallStart, overallEnd, batchDays, maxDurationMs: 50_000 });
  revalidatePath("/admin/jumppark-sync");
  return { error: null, result };
}
