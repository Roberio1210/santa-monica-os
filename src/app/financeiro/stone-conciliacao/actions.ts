"use server";

import { revalidatePath } from "next/cache";
import { syncStonePeriod } from "@/lib/integrations/stone/persistence/importRun";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneReviewStatus } from "@/lib/integrations/stone/persistence/types";
import { saoPauloDateISO, addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";

/**
 * Server Actions da tela Stone Conciliação (Sprint 7.0, Z4) — única porta de entrada para
 * disparar sincronização/reprocessamento e revisar conciliação/divergências manualmente. Nunca
 * corrige dado automaticamente: toda mudança de status aqui é uma ação explícita do usuário.
 */

export interface FormActionState {
  error: string | null;
  success?: string | null;
}

const REVIEW_STATUSES: StoneReviewStatus[] = ["open", "under_review", "confirmed_issue", "resolved", "ignored", "pending_processing"];

function isReviewStatus(value: string): value is StoneReviewStatus {
  return (REVIEW_STATUSES as string[]).includes(value);
}

/** Sincronização manual — sem período informado, usa os últimos 30 dias até hoje (mesma janela padrão da Agenda Financeira, Z3). */
export async function syncStoneAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const today = saoPauloDateISO();
  const fromDateRaw = String(formData.get("fromDate") ?? "");
  const toDateRaw = String(formData.get("toDate") ?? "");
  const fromDate = isValidIsoDate(fromDateRaw) ? fromDateRaw : addDaysIso(today, -30);
  const toDate = isValidIsoDate(toDateRaw) ? toDateRaw : today;

  if (fromDate > toDate) return { error: "Data inicial não pode ser depois da data final." };

  try {
    const result = await syncStonePeriod({ fromDate, toDate, origin: "manual" });
    if (result.status === "not_configured") return { error: "Integração Stone Conciliação não configurada." };

    revalidatePath("/financeiro/stone-conciliacao");
    revalidatePath("/configuracoes");
    const failedCount = result.days.filter((d) => d.status === "failed").length;
    const successMessage = failedCount > 0
      ? `Sincronização concluída com ${failedCount} de ${result.days.length} dia(s) com falha — ${result.transactionsPersisted} transação(ões) atualizada(s).`
      : `Sincronização concluída: ${result.transactionsPersisted} transação(ões), ${result.reconciliationResultsPersisted} resultado(s) de conciliação, ${result.divergencesPersisted} divergência(s).`;
    return { error: null, success: successMessage };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao sincronizar com a Stone." };
  }
}

/** Reprocessa um único dia já importado — a confirmação em si acontece na UI (diálogo), esta action só executa. */
export async function reprocessStoneDayAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const referenceDate = String(formData.get("referenceDate") ?? "");
  if (!isValidIsoDate(referenceDate)) return { error: "Data de referência inválida." };

  try {
    const result = await syncStonePeriod({ fromDate: referenceDate, toDate: referenceDate, origin: "manual_reprocess" });
    if (result.status === "not_configured") return { error: "Integração Stone Conciliação não configurada." };
    const day = result.days[0];
    if (day?.status === "failed") return { error: `Reprocessamento falhou: ${day.error ?? "erro desconhecido"}.` };

    revalidatePath("/financeiro/stone-conciliacao");
    return { error: null, success: `Dia ${referenceDate} reprocessado: ${day?.recordCount ?? 0} transação(ões).` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao reprocessar." };
  }
}

export async function updateDivergenceReviewAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "").trim();

  if (!id) return { error: "Divergência inválida." };
  if (!isReviewStatus(status)) return { error: "Status de revisão inválido." };
  if (status === "resolved" && !resolutionNote) return { error: "Informe a resolução ao marcar como resolvida." };
  if (status === "ignored" && !resolutionNote) return { error: "Informe a justificativa ao ignorar uma divergência." };

  try {
    await getStonePersistenceRepository().updateDivergenceReview({
      id,
      status,
      assignee: assignee || undefined,
      resolutionNote: resolutionNote || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao atualizar a revisão." };
  }

  revalidatePath("/financeiro/stone-conciliacao");
  return { error: null, success: "Revisão atualizada." };
}

export async function updateReconciliationReviewAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return { error: "Resultado de conciliação inválido." };
  if (!isReviewStatus(status)) return { error: "Status de revisão inválido." };

  try {
    await getStonePersistenceRepository().updateReconciliationReviewStatus(id, status);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao atualizar a revisão." };
  }

  revalidatePath("/financeiro/stone-conciliacao");
  return { error: null, success: "Revisão atualizada." };
}
