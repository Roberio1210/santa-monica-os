"use server";

import { revalidatePath } from "next/cache";
import { syncJumpParkServiceOrders } from "@/lib/integrations/jumppark/sync";
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
  return {
    error: null,
    success: `Sincronização concluída (${fromDate} a ${toDate}): ${result.ordersFetched} ordem(ns) buscada(s) na JumpPark, ${result.ordersInserted} nova(s), ${result.ordersUpdated} atualizada(s), em ${result.durationMs}ms.`,
  };
}
