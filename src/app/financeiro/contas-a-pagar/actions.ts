"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { PayableOverpaymentError } from "@/lib/finance/status";
import { fetchRecurringGenerationStatus, generateAccountsPayableFromTemplate } from "@/lib/finance/service";
import type { CreateAccountsPayableInput, CreateRecurringBillTemplateInput, FinancePaymentMethod, UpdateAccountsPayableInput } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
  /** Preenchido só pelas ações que não redirecionam ao concluir (ex.: criar recorrência) — as demais continuam usando redirect(). */
  success?: string | null;
}

export interface GenerateRecurringResultItem {
  templateId: string;
  description: string;
  status: "criada" | "ja_existia" | "erro";
  accountsPayableId?: string;
  message?: string;
}

export interface GenerateRecurringState {
  error: string | null;
  success: string | null;
  results: GenerateRecurringResultItem[];
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

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Validação server-side — nunca confia em validação só do lado do cliente. */
function validateAccountsPayableForm(formData: FormData): { error: string | null; data: CreateAccountsPayableInput | null } {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descrição é obrigatória.", data: null };

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) return { error: "Categoria é obrigatória.", data: null };

  const competenceDate = String(formData.get("competenceDate") ?? "");
  if (!isValidDate(competenceDate)) return { error: "Competência inválida.", data: null };

  const dueDate = String(formData.get("dueDate") ?? "");
  if (!isValidDate(dueDate)) return { error: "Vencimento inválido.", data: null };

  const originalAmountRaw = String(formData.get("originalAmount") ?? "").replace(",", ".");
  const originalAmount = Number(originalAmountRaw);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    return { error: "Valor original deve ser um número maior que zero.", data: null };
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
      supplierId: parseOptionalString(formData.get("supplierId")),
      categoryId,
      costCenterId: parseOptionalString(formData.get("costCenterId")),
      financialAccountId: parseOptionalString(formData.get("financialAccountId")),
      competenceDate,
      issueDate,
      dueDate,
      originalAmount,
      paymentMethod: parsePaymentMethod(formData.get("paymentMethod")),
      documentNumber: parseOptionalString(formData.get("documentNumber")),
      notes: parseOptionalString(formData.get("notes")),
      pendingData: formData.get("pendingData") === "on",
      installmentTotal,
    },
  };
}

export async function createAccountsPayableAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const { error, data } = validateAccountsPayableForm(formData);
  if (error || !data) return { error };

  let createdId: string;
  try {
    const created = await getFinanceRepository().createAccountsPayable(data);
    createdId = created[0].id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar conta a pagar." };
  }

  revalidatePath("/financeiro/contas-a-pagar");
  redirect(`/financeiro/contas-a-pagar/${createdId}`);
}

export async function updateAccountsPayableAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Identificador da conta ausente." };

  const { error, data } = validateAccountsPayableForm(formData);
  if (error || !data) return { error };

  const input: UpdateAccountsPayableInput = {
    id,
    description: data.description,
    supplierId: data.supplierId,
    categoryId: data.categoryId,
    costCenterId: data.costCenterId,
    financialAccountId: data.financialAccountId,
    competenceDate: data.competenceDate,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    originalAmount: data.originalAmount,
    paymentMethod: data.paymentMethod,
    documentNumber: data.documentNumber,
    notes: data.notes,
    pendingData: data.pendingData,
  };

  try {
    await getFinanceRepository().updateAccountsPayable(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao editar conta a pagar." };
  }

  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath(`/financeiro/contas-a-pagar/${id}`);
  redirect(`/financeiro/contas-a-pagar/${id}`);
}

export async function recordPayablePaymentAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const accountsPayableId = String(formData.get("accountsPayableId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  const paidAt = String(formData.get("paidAt") ?? "");
  const allowOverpayment = formData.get("allowOverpayment") === "on";

  if (!accountsPayableId) return { error: "Conta a pagar não identificada." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Valor do pagamento deve ser maior que zero." };
  if (!isValidDate(paidAt)) return { error: "Data de pagamento inválida." };

  try {
    await getFinanceRepository().recordPayablePayment({
      accountsPayableId,
      amount,
      paidAt,
      method: parsePaymentMethod(formData.get("method")),
      financialAccountId: parseOptionalString(formData.get("financialAccountId")),
      notes: parseOptionalString(formData.get("notes")),
      allowOverpayment,
    });
  } catch (err) {
    if (err instanceof PayableOverpaymentError) {
      return { error: `${err.message} Marque "confirmar pagamento acima do saldo" para prosseguir mesmo assim.` };
    }
    return { error: err instanceof Error ? err.message : "Falha ao registrar pagamento." };
  }

  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath(`/financeiro/contas-a-pagar/${accountsPayableId}`);
  redirect(`/financeiro/contas-a-pagar/${accountsPayableId}`);
}

export async function reversePayableSettlementAction(formData: FormData): Promise<void> {
  const settlementId = String(formData.get("settlementId") ?? "");
  const accountsPayableId = String(formData.get("accountsPayableId") ?? "");
  if (!settlementId) throw new Error("Baixa não identificada.");

  await getFinanceRepository().reversePayableSettlement(settlementId);

  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath(`/financeiro/contas-a-pagar/${accountsPayableId}`);
  redirect(`/financeiro/contas-a-pagar/${accountsPayableId}`);
}

export async function cancelAccountsPayableAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta a pagar não identificada.");

  await getFinanceRepository().cancelAccountsPayable(id);

  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath(`/financeiro/contas-a-pagar/${id}`);
  redirect(`/financeiro/contas-a-pagar/${id}`);
}

export async function deleteAccountsPayableAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Conta a pagar não identificada.");

  await getFinanceRepository().deleteAccountsPayable(id);

  revalidatePath("/financeiro/contas-a-pagar");
  redirect("/financeiro/contas-a-pagar");
}

/**
 * Gera contas a pagar reais a partir dos modelos de recorrência selecionados — só cria o que foi
 * explicitamente confirmado nesta submissão (nunca todas as recorrências da competência de uma
 * vez). Idempotente: confere de novo antes de criar (mesmo lock que generateAccountsPayableFromTemplate).
 */
export async function generateRecurringAccountsPayableAction(_prevState: GenerateRecurringState, formData: FormData): Promise<GenerateRecurringState> {
  const competenceMonth = String(formData.get("competenceMonth") ?? "");
  if (!/^\d{4}-\d{2}$/.test(competenceMonth)) return { error: "Competência inválida.", success: null, results: [] };

  const responsibleName = parseOptionalString(formData.get("responsibleName"));
  const templateIds = formData.getAll("templateIds").map(String);
  if (templateIds.length === 0) return { error: "Selecione ao menos uma recorrência para gerar.", success: null, results: [] };

  const competenceDate = `${competenceMonth}-01`;
  const statusBefore = await fetchRecurringGenerationStatus(competenceMonth);
  const results: GenerateRecurringResultItem[] = [];

  for (const templateId of templateIds) {
    const statusItem = statusBefore.find((s) => s.template.id === templateId);
    const description = statusItem?.template.description ?? templateId;

    if (statusItem?.alreadyGenerated) {
      results.push({ templateId, description, status: "ja_existia", accountsPayableId: statusItem.existingAccountsPayableId ?? undefined });
      continue;
    }

    const amountRaw = parseOptionalString(formData.get(`amount_${templateId}`));
    const amountOverride = amountRaw ? Number(amountRaw.replace(",", ".")) : undefined;
    if (statusItem?.template.variableAmount && (amountOverride === undefined || !Number.isFinite(amountOverride) || amountOverride <= 0)) {
      results.push({ templateId, description, status: "erro", message: "Valor necessário — modelo de valor variável." });
      continue;
    }

    try {
      const created = await generateAccountsPayableFromTemplate(templateId, competenceDate, {
        amountOverride,
        documentNumber: parseOptionalString(formData.get(`documentNumber_${templateId}`)),
        issueDate: parseOptionalString(formData.get(`issueDate_${templateId}`)),
        notes: parseOptionalString(formData.get(`notes_${templateId}`)),
        responsibleName,
      });
      results.push({ templateId, description, status: "criada", accountsPayableId: created?.id });
    } catch (err) {
      results.push({ templateId, description, status: "erro", message: err instanceof Error ? err.message : "Falha ao gerar." });
    }
  }

  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-pagar/gerar-recorrentes");

  const createdCount = results.filter((r) => r.status === "criada").length;
  const errorCount = results.filter((r) => r.status === "erro").length;
  return {
    error: null,
    success: `${createdCount} conta(s) gerada(s).${errorCount > 0 ? ` ${errorCount} com erro.` : ""}`,
    results,
  };
}

/**
 * Missão de Instrumentação Gerencial — cadastro de um novo modelo de recorrência real (ex.: uma
 * nova assinatura, um novo aluguel). Nunca gera nenhuma conta a pagar sozinho: só cria o modelo,
 * que passa a aparecer em "Gerar contas recorrentes" para materialização explícita competência a
 * competência (fluxo já existente, idempotente).
 */
export async function createRecurringBillTemplateAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descrição é obrigatória." };

  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) return { error: "Categoria é obrigatória." };

  const variableAmount = formData.get("variableAmount") === "on";
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = variableAmount ? null : Number(amountRaw);
  if (!variableAmount && (!Number.isFinite(amount) || (amount as number) <= 0)) {
    return { error: "Valor deve ser um número maior que zero (ou marque 'valor variável')." };
  }

  const dueDayRaw = parseOptionalString(formData.get("dueDay"));
  const dueDay = dueDayRaw ? Number(dueDayRaw) : null;
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
    return { error: "Dia de vencimento deve ser um número inteiro entre 1 e 28 (ou deixe em branco quando não houver dia fixo)." };
  }

  const data: CreateRecurringBillTemplateInput = {
    description,
    supplierId: parseOptionalString(formData.get("supplierId")),
    categoryId,
    costCenterId: parseOptionalString(formData.get("costCenterId")),
    financialAccountId: parseOptionalString(formData.get("financialAccountId")),
    amount,
    variableAmount,
    dueDay,
    periodicity: "mensal",
    notes: parseOptionalString(formData.get("notes")),
  };

  try {
    await getFinanceRepository().createRecurringBillTemplate(data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar recorrência." };
  }

  revalidatePath("/financeiro/contas-a-pagar/gerar-recorrentes");
  return { error: null, success: `Recorrência "${description}" cadastrada.` };
}
