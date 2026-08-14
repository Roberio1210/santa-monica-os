"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createContract, createPartner } from "@/lib/finance/service";
import type { ContractStatus, ContractType, Partner } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
}

const CONTRACT_TYPES: ContractType[] = ["parceria_pos_paga", "mensalidade"];
const CONTRACT_STATUSES: ContractStatus[] = ["ativo", "suspenso", "encerrado"];
const PARTNER_TYPES: Partner["type"][] = ["parceria_pos_paga", "contrato_mensal", "outro"];

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const num = parseOptionalNumber(value);
  return num !== null ? Math.trunc(num) : null;
}

/**
 * Missão Financeiro V2 (Prioridade 4) — cadastro real de contrato mensalista/parceria. Cria o
 * parceiro inline quando o usuário escolhe "novo parceiro" em vez de um já cadastrado — nunca
 * inventa um valor de contrato: `baseValue` só é gravado quando o usuário informa explicitamente.
 */
export async function createContractAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const title = parseOptionalString(formData.get("title"));
  const type = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "ativo") as ContractStatus;
  const baseValue = parseOptionalNumber(formData.get("baseValue"));
  const startDate = parseOptionalString(formData.get("startDate"));
  const dueDay = parseOptionalInt(formData.get("dueDay"));
  const billingClosingDay = parseOptionalInt(formData.get("billingClosingDay"));
  const notes = parseOptionalString(formData.get("notes"));

  const existingPartnerId = parseOptionalString(formData.get("partnerId"));
  const newPartnerName = parseOptionalString(formData.get("newPartnerName"));
  const newPartnerType = String(formData.get("newPartnerType") ?? "");

  const benefitDescription = parseOptionalString(formData.get("benefitDescription"));
  const benefitQuantity = parseOptionalInt(formData.get("benefitQuantity"));
  const benefitPeriodType = parseOptionalString(formData.get("benefitPeriodType")) ?? "mensal";
  const benefitCumulative = formData.get("benefitCumulative") === "on";

  if (!title) return { error: "Informe o título do contrato." };
  if (!CONTRACT_TYPES.includes(type as ContractType)) return { error: "Tipo de contrato inválido." };
  if (!CONTRACT_STATUSES.includes(status)) return { error: "Situação inválida." };

  let partnerId = existingPartnerId;
  if (!partnerId) {
    if (!newPartnerName) return { error: "Selecione um parceiro existente ou informe o nome do novo parceiro." };
    if (!PARTNER_TYPES.includes(newPartnerType as Partner["type"])) return { error: "Tipo de parceiro inválido." };
    try {
      const partner = await createPartner({ name: newPartnerName, type: newPartnerType as Partner["type"] });
      partnerId = partner.id;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao cadastrar o parceiro." };
    }
  }

  try {
    await createContract({
      partnerId,
      title,
      type: type as ContractType,
      status,
      startDate,
      dueDay,
      billingClosingDay,
      baseValue,
      notes,
      benefit: benefitDescription ? { description: benefitDescription, quantityPerPeriod: benefitQuantity, periodType: benefitPeriodType, cumulative: benefitCumulative } : null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao cadastrar o contrato." };
  }

  revalidatePath("/financeiro/contratos");
  revalidatePath("/financeiro");
  redirect("/financeiro");
}
