"use server";

import { revalidatePath } from "next/cache";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { AccountTransferType, CashMovementNature, CashMovementType, CreateCashMovementInput, RecordAccountTransferInput } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
  success?: string | null;
}

const MOVEMENT_TYPES: CashMovementType[] = ["entrada", "saida"];
const MOVEMENT_NATURES: CashMovementNature[] = ["receita", "despesa", "ajuste", "estorno", "taxa_bancaria", "tarifa", "juros"];
const TRANSFER_TYPES: AccountTransferType[] = ["transferencia", "reposicao_caixa", "aporte_socios", "retirada"];

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const initialState: FormActionState = { error: null };

export async function createCashMovementAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) return { error: "Data inválida." };

  const typeRaw = String(formData.get("type") ?? "");
  if (!(MOVEMENT_TYPES as string[]).includes(typeRaw)) return { error: "Tipo inválido." };
  const type = typeRaw as CashMovementType;

  const natureRaw = String(formData.get("nature") ?? "");
  const nature = (MOVEMENT_NATURES as string[]).includes(natureRaw) ? (natureRaw as CashMovementNature) : null;

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descrição é obrigatória." };

  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Valor deve ser um número maior que zero." };

  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  if (!financialAccountId) return { error: "Conta financeira é obrigatória." };

  const competenceDate = parseOptionalString(formData.get("competenceDate"));
  if (competenceDate && !isValidDate(competenceDate)) return { error: "Competência inválida." };

  const input: CreateCashMovementInput = {
    date,
    type,
    nature,
    amount,
    description,
    categoryId: parseOptionalString(formData.get("categoryId")),
    costCenterId: parseOptionalString(formData.get("costCenterId")),
    financialAccountId,
    partnerId: parseOptionalString(formData.get("partnerId")),
    supplierId: parseOptionalString(formData.get("supplierId")),
    responsibleName: parseOptionalString(formData.get("responsibleName")),
    documentRef: parseOptionalString(formData.get("documentRef")),
    competenceDate,
    notes: parseOptionalString(formData.get("notes")),
  };

  try {
    await getFinanceRepository().createCashMovement(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar lançamento." };
  }

  revalidatePath("/financeiro/fluxo-de-caixa");
  return { error: null, success: "Lançamento registrado." };
}

export async function recordAccountTransferAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const typeRaw = String(formData.get("type") ?? "");
  if (!(TRANSFER_TYPES as string[]).includes(typeRaw)) return { error: "Tipo de transferência inválido." };
  const type = typeRaw as AccountTransferType;

  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) return { error: "Data inválida." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descrição é obrigatória." };

  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Valor deve ser um número maior que zero." };

  const fromAccountId = parseOptionalString(formData.get("fromAccountId"));
  const toAccountId = parseOptionalString(formData.get("toAccountId"));

  if (type === "aporte_socios" && !toAccountId) return { error: "Aporte de sócios precisa de uma conta de destino." };
  if (type === "retirada" && !fromAccountId) return { error: "Retirada precisa de uma conta de origem." };
  if ((type === "transferencia" || type === "reposicao_caixa") && (!fromAccountId || !toAccountId)) {
    return { error: "Transferência/reposição precisa de conta de origem e de destino." };
  }
  if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
    return { error: "Conta de origem e destino não podem ser a mesma." };
  }

  const input: RecordAccountTransferInput = {
    type,
    fromAccountId,
    toAccountId,
    amount,
    date,
    description,
    responsibleName: parseOptionalString(formData.get("responsibleName")),
    documentRef: parseOptionalString(formData.get("documentRef")),
    notes: parseOptionalString(formData.get("notes")),
  };

  try {
    await getFinanceRepository().recordAccountTransfer(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar transferência." };
  }

  revalidatePath("/financeiro/fluxo-de-caixa");
  return { error: null, success: "Transferência registrada." };
}

export async function informAccountBalanceAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  if (!financialAccountId) return { error: "Conta financeira não identificada." };

  const informedBalanceRaw = String(formData.get("informedBalance") ?? "").replace(",", ".");
  const informedBalance = Number(informedBalanceRaw);
  if (!Number.isFinite(informedBalance)) return { error: "Saldo informado deve ser um número." };

  try {
    await getFinanceRepository().informAccountBalance({ financialAccountId, informedBalance });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar saldo informado." };
  }

  revalidatePath("/financeiro/fluxo-de-caixa");
  return { error: null, success: "Saldo informado registrado." };
}

export { initialState as cashFlowInitialState };
