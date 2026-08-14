"use server";

import { revalidatePath } from "next/cache";
import { generateIesaClosingReceivable } from "@/lib/finance/iesaClosing";

/** Missão Financeiro V2 (Prioridade 3) — gera a conta a receber consolidada de um mês da parceria IESA. Nunca uma por ordem. */

export interface FormActionState {
  error: string | null;
  success?: string | null;
}

export async function generateIesaClosingAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const competenceMonth = String(formData.get("competenceMonth") ?? "");
  const totalAmount = Number(formData.get("totalAmount") ?? "");
  const dueDay = Number(formData.get("dueDay") ?? "10");
  const responsibleName = String(formData.get("responsibleName") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(competenceMonth)) return { error: "Competência inválida." };
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return { error: "Valor inválido." };
  if (!responsibleName) return { error: "Informe seu nome." };

  try {
    const result = await generateIesaClosingReceivable(competenceMonth, totalAmount, Number.isFinite(dueDay) ? dueDay : 10, responsibleName);
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/contas-a-receber");
    return { error: null, success: result.status === "created" ? "Cobrança consolidada gerada." : "Já existia uma cobrança para este mês — nenhuma duplicata criada." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao gerar o fechamento." };
  }
}
