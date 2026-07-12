"use server";

import { revalidatePath } from "next/cache";
import { getFinanceRepository } from "@/lib/finance/repository-factory";

export interface FormActionState {
  error: string | null;
  success?: string | null;
}

function isValidCompetenceMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export async function closeAccountingPeriodAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const competenceMonth = String(formData.get("competenceMonth") ?? "");
  const closedBy = String(formData.get("closedBy") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!isValidCompetenceMonth(competenceMonth)) return { error: "Competência inválida." };
  if (!closedBy) return { error: "Informe quem está fechando a competência." };

  try {
    await getFinanceRepository().closeAccountingPeriod({ competenceMonth, closedBy, notes: notes || null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao fechar competência." };
  }

  revalidatePath("/financeiro/fechamento");
  return { error: null, success: `Competência ${competenceMonth} fechada.` };
}

export async function reopenAccountingPeriodAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const competenceMonth = String(formData.get("competenceMonth") ?? "");
  const reopenedBy = String(formData.get("reopenedBy") ?? "").trim();
  const reopenJustification = String(formData.get("reopenJustification") ?? "").trim();

  if (!isValidCompetenceMonth(competenceMonth)) return { error: "Competência inválida." };
  if (!reopenedBy) return { error: "Informe quem está reabrindo a competência." };
  if (!reopenJustification) return { error: "Justificativa é obrigatória para reabrir uma competência." };

  try {
    await getFinanceRepository().reopenAccountingPeriod({ competenceMonth, reopenedBy, reopenJustification });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao reabrir competência." };
  }

  revalidatePath("/financeiro/fechamento");
  return { error: null, success: `Competência ${competenceMonth} reaberta.` };
}
