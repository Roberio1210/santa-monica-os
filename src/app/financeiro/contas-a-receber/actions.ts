"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { ReceivableOverpaymentError } from "@/lib/finance/status";
import type { CreateAccountsReceivableInput, FinancePaymentMethod, UpdateAccountsReceivableInput } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
}

const PAYMENT_METHODS: FinancePaymentMethod[] = ["dinheiro", "debito", "credito", "pix", "boleto", "transferencia", "outro", "desconhecido"];

function parsePaymentMethod(value: FormDataEntryValue | null): FinancePaymentMethod {
  const str = String(value ?? "");
  return (PAYMENT_METHODS as string[]).includes(str) ? (str as FinancePaymentMethod) : "desconhecido";
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseOptionalAmount(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return null;
  const amount = Number(str);
  return Number.isFinite(amount) ? amount : null;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Validação server-side — nunca confia em validação só do lado do cliente. */
function validateAccountsReceivableForm(formData: FormData): { error: string | null; data: CreateAccountsReceivableInput | null } {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descrição é obrigatória.", data: null };

  const competenceDate = String(formData.get("competenceDate") ?? "");
  if (!isValidDate(competenceDate)) return { error: "Competência inválida.", data: null };

  const dueDate = String(formData.get("dueDate") ?? "");
  if (!isValidDate(dueDate)) return { error: "Vencimento inválido.", data: null };

  const expectedAmountRaw = String(formData.get("expectedAmount") ?? "").replace(",", ".");
  const expectedAmount = Number(expectedAmountRaw);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return { error: "Valor previsto deve ser um número maior que zero.", data: null };
  }

  const installmentTotalRaw = String(formData.get("installmentTotal") ?? "1");
  const installmentTotal = Number(installmentTotalRaw) || 1;
  if (installmentTotal < 1 || installmentTotal > 60) {
    return { error: "Número de parcelas deve ser entre 1 e 60.", data: null };
  }

  const issueDate = parseOptionalString(formData.get("issueDate"));
  if (issueDate && !isValidDate(issueDate)) return { error: "Data de emissão inválida.", data: null };

  return {
    error: null,
    data: {
      description,
      partnerId: parseOptionalString(formData.get("partnerId")),
      categoryId: parseOptionalString(formData.get("categoryId")),
      costCenterId: parseOptionalString(formData.get("costCenterId")),
      financialAccountId: parseOptionalString(formData.get("financialAccountId")),
      competenceDate,
      issueDate,
      dueDate,
      expectedAmount,
      invoiceNumber: parseOptionalString(formData.get("invoiceNumber")),
      invoiceIssued: formData.get("invoiceIssued") === "on",
      notes: parseOptionalString(formData.get("notes")),
      responsibleName: parseOptionalString(formData.get("responsibleName")),
      approverName: parseOptionalString(formData.get("approverName")),
      installmentTotal,
    },
  };
}

export async function createAccountsReceivableAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const { error, data } = validateAccountsReceivableForm(formData);
  if (error || !data) return { error };

  let createdId: string;
  try {
    const created = await getFinanceRepository().createAccountsReceivable(data);
    createdId = created[0].id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar conta a receber." };
  }

  revalidatePath("/financeiro/contas-a-receber");
  redirect(`/financeiro/contas-a-receber/${createdId}`);
}

export async function updateAccountsReceivableAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Identificador da conta ausente." };

  const { error, data } = validateAccountsReceivableForm(formData);
  if (error || !data) return { error };

  const input: UpdateAccountsReceivableInput = {
    id,
    description: data.description,
    partnerId: data.partnerId,
    categoryId: data.categoryId,
    costCenterId: data.costCenterId,
    financialAccountId: data.financialAccountId,
    competenceDate: data.competenceDate,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    expectedAmount: data.expectedAmount,
    invoiceNumber: data.invoiceNumber,
    invoiceIssued: data.invoiceIssued,
    notes: data.notes,
    responsibleName: data.responsibleName,
    approverName: data.approverName,
  };

  try {
    await getFinanceRepository().updateAccountsReceivable(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao editar conta a receber." };
  }

  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath(`/financeiro/contas-a-receber/${id}`);
  redirect(`/financeiro/contas-a-receber/${id}`);
}

export async function recordReceivablePaymentAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const accountsReceivableId = String(formData.get("accountsReceivableId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  const paidAt = String(formData.get("paidAt") ?? "");
  const allowOverpayment = formData.get("allowOverpayment") === "on";

  if (!accountsReceivableId) return { error: "Conta a receber não identificada." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Valor do recebimento deve ser maior que zero." };
  if (!isValidDate(paidAt)) return { error: "Data de recebimento inválida." };

  try {
    await getFinanceRepository().recordReceivablePayment({
      accountsReceivableId,
      amount,
      paidAt,
      method: parsePaymentMethod(formData.get("method")),
      financialAccountId: parseOptionalString(formData.get("financialAccountId")),
      feeAmount: parseOptionalAmount(formData.get("feeAmount")),
      notes: parseOptionalString(formData.get("notes")),
      allowOverpayment,
    });
  } catch (err) {
    if (err instanceof ReceivableOverpaymentError) {
      return { error: `${err.message} Marque "confirmar recebimento acima do saldo" para prosseguir mesmo assim.` };
    }
    return { error: err instanceof Error ? err.message : "Falha ao registrar recebimento." };
  }

  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath(`/financeiro/contas-a-receber/${accountsReceivableId}`);
  redirect(`/financeiro/contas-a-receber/${accountsReceivableId}`);
}

export async function reverseReceivableSettlementAction(formData: FormData): Promise<void> {
  const settlementId = String(formData.get("settlementId") ?? "");
  const accountsReceivableId = String(formData.get("accountsReceivableId") ?? "");
  if (!settlementId) throw new Error("Recebimento não identificado.");

  await getFinanceRepository().reverseReceivableSettlement(settlementId);

  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath(`/financeiro/contas-a-receber/${accountsReceivableId}`);
  redirect(`/financeiro/contas-a-receber/${accountsReceivableId}`);
}

export async function cancelAccountsReceivableAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta a receber não identificada.");

  await getFinanceRepository().cancelAccountsReceivable(id);

  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath(`/financeiro/contas-a-receber/${id}`);
  redirect(`/financeiro/contas-a-receber/${id}`);
}

export async function deleteAccountsReceivableAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta a receber não identificada.");

  await getFinanceRepository().deleteAccountsReceivable(id);

  revalidatePath("/financeiro/contas-a-receber");
  redirect("/financeiro/contas-a-receber");
}
