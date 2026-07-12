"use server";

import { revalidatePath } from "next/cache";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { ClassificationMatchType, ClassificationSourceKind, DreLine, FinancialNature } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
  success?: string | null;
}

const SOURCE_KINDS: ClassificationSourceKind[] = ["accounts_payable", "accounts_receivable", "cash_movement", "account_transfer"];
const DRE_LINES: DreLine[] = ["receita_bruta", "deducoes_receita", "custos_diretos", "despesas_operacionais", "resultado_financeiro", "tributos", "fora_dre"];
const NATURES: FinancialNature[] = [
  "receita_operacional",
  "deducao_receita",
  "custo_direto",
  "despesa_operacional",
  "resultado_financeiro",
  "investimento",
  "ativo",
  "passivo",
  "transferencia",
  "aporte",
  "retirada",
  "reembolso",
  "nao_classificavel",
];
const MATCH_TYPES: ClassificationMatchType[] = ["fornecedor", "parceiro", "categoria", "palavra_chave"];

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function classifyEntityAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const sourceKindRaw = String(formData.get("sourceKind") ?? "");
  const sourceId = String(formData.get("sourceId") ?? "");
  const dreLineRaw = String(formData.get("dreLine") ?? "");
  const natureRaw = String(formData.get("nature") ?? "");

  if (!(SOURCE_KINDS as string[]).includes(sourceKindRaw)) return { error: "Origem do lançamento inválida." };
  if (!sourceId) return { error: "Lançamento não identificado." };
  if (!(DRE_LINES as string[]).includes(dreLineRaw)) return { error: "Linha da DRE inválida." };
  if (!(NATURES as string[]).includes(natureRaw)) return { error: "Natureza inválida." };

  const createRuleFlag = formData.get("createRule") === "on";

  try {
    await getFinanceRepository().classifyEntity({
      sourceKind: sourceKindRaw as ClassificationSourceKind,
      sourceId,
      dreLine: dreLineRaw as DreLine,
      nature: natureRaw as FinancialNature,
      includeInDre: formData.get("includeInDre") !== "off",
      reviewNeeded: formData.get("reviewNeeded") === "on",
      classifiedBy: parseOptionalString(formData.get("classifiedBy")),
      notes: parseOptionalString(formData.get("notes")),
      createRule: createRuleFlag
        ? {
            matchType: (String(formData.get("ruleMatchType") ?? "categoria") as ClassificationMatchType),
            supplierId: parseOptionalString(formData.get("ruleSupplierId")),
            partnerId: parseOptionalString(formData.get("rulePartnerId")),
            categoryId: parseOptionalString(formData.get("ruleCategoryId")),
            keyword: parseOptionalString(formData.get("ruleKeyword")),
          }
        : undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao classificar lançamento." };
  }

  revalidatePath("/financeiro/classificacao");
  revalidatePath("/financeiro/dre");
  return { error: null, success: "Lançamento classificado." };
}

export async function createClassificationRuleAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const matchType = String(formData.get("matchType") ?? "");
  if (!(MATCH_TYPES as string[]).includes(matchType)) return { error: "Critério da regra inválido." };

  const dreLine = String(formData.get("dreLine") ?? "");
  const nature = String(formData.get("nature") ?? "");
  if (!(DRE_LINES as string[]).includes(dreLine)) return { error: "Linha da DRE inválida." };
  if (!(NATURES as string[]).includes(nature)) return { error: "Natureza inválida." };

  if (matchType === "fornecedor" && !formData.get("supplierId")) return { error: "Selecione um fornecedor." };
  if (matchType === "parceiro" && !formData.get("partnerId")) return { error: "Selecione um cliente/parceiro." };
  if (matchType === "categoria" && !formData.get("categoryId")) return { error: "Selecione uma categoria." };
  if (matchType === "palavra_chave" && !parseOptionalString(formData.get("keyword"))) return { error: "Informe a palavra-chave." };

  try {
    await getFinanceRepository().createClassificationRule({
      matchType: matchType as ClassificationMatchType,
      supplierId: parseOptionalString(formData.get("supplierId")),
      partnerId: parseOptionalString(formData.get("partnerId")),
      categoryId: parseOptionalString(formData.get("categoryId")),
      keyword: parseOptionalString(formData.get("keyword")),
      dreLine: dreLine as DreLine,
      nature: nature as FinancialNature,
      suggestedCostCenterId: parseOptionalString(formData.get("suggestedCostCenterId")),
      includeInDre: formData.get("includeInDre") !== "off",
      reviewNeeded: formData.get("reviewNeeded") === "on",
      notes: parseOptionalString(formData.get("notes")),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar regra." };
  }

  revalidatePath("/financeiro/classificacao");
  revalidatePath("/financeiro/dre");
  return { error: null, success: "Regra criada — aplica-se automaticamente a lançamentos passados e futuros que combinem com o critério." };
}

export async function deleteClassificationRuleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Regra não identificada.");
  await getFinanceRepository().deleteClassificationRule(id);
  revalidatePath("/financeiro/classificacao");
  revalidatePath("/financeiro/dre");
}
