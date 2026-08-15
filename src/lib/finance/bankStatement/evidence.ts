import { counterpartyMatchesRegisteredName } from "@/lib/finance/bankStatement/normalization";
import type { BankStatementLineGroup } from "@/lib/finance/bankStatement/grouping";
import type { BankStatementLineType } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.2 (Fase D/E) — motor de evidências. Cada sugestão é sempre acompanhada
 * das evidências que a justificam ("por que o sistema acha que isto é X?"), nunca uma
 * classificação opaca. Regra absoluta (Fase E): EXACT exige evidência determinística; qualquer
 * outra coisa exige ≥2 evidências independentes para HIGH_CONFIDENCE — 1 evidência isolada nunca
 * passa de REVIEW. Nenhum destes tiers, exceto EXACT por regra ensinada, é efetivado sozinho no
 * razão financeiro (ver `batchActionsService.ts`).
 */
export type EvidenceKind =
  | "exact_rule_match"
  | "exact_supplier_name"
  | "supplier_name_contains"
  | "recurring_amount_match"
  | "recurrence_pattern"
  | "possible_related_account_counterparty"
  | "possible_personal_name_recurring"
  | "direction_conflicts_with_supplier_history"
  | "conflicting_supplier_candidates";

export type ConfidenceTier = "exact" | "high_confidence" | "review" | "insufficient" | "conflict";

export interface Evidence {
  kind: EvidenceKind;
  detail: string;
}

export interface EvidenceReferenceData {
  suppliers: { id: string; name: string }[];
  recurringBillTemplates: { id: string; supplierId: string | null; description: string; amount: number | null }[];
  partners: { id: string; name: string }[];
  /** Regras ativas ensinadas pelo gestor (Fase H) — checadas ANTES de qualquer heurística. */
  activeRules: {
    id: string;
    criteriaDirection: "entrada" | "saida" | null;
    criteriaCounterpartyPattern: string | null;
    criteriaDescriptionKeyword: string | null;
    resultingType: BankStatementLineType;
    categoryId: string | null;
    supplierId: string | null;
    partnerId: string | null;
  }[];
}

export interface GroupEvidenceResult {
  confidence: ConfidenceTier;
  evidences: Evidence[];
  suggestedType: BankStatementLineType | null;
  suggestedSupplierId: string | null;
  suggestedPartnerId: string | null;
  suggestedCategoryId: string | null;
  matchedRuleId: string | null;
  /** Texto humano — sempre respondível: "por que o sistema acha que isto é X?" */
  reasonSummary: string;
}

const AMOUNT_TOLERANCE_RATIO = 0.15; // 15% — recorrências reais variam (reajuste, consumo variável).
const RECURRENCE_MIN_MONTHS = 3;

function amountWithinTolerance(candidate: number, reference: number): boolean {
  if (reference === 0) return false;
  return Math.abs(candidate - reference) / reference <= AMOUNT_TOLERANCE_RATIO;
}

/** Heurística conservadora: "parece nome de pessoa física" — 2+ palavras, sem dígito, sem sufixo de empresa. Nunca decide sozinho, só apoia REVIEW (Fase O). */
function looksLikePersonalName(counterpartyKey: string): boolean {
  if (/\d/.test(counterpartyKey)) return false;
  const words = counterpartyKey.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  const companySignals = /LTDA|COMERCIO|SERVICOS|INDUSTRIA|S\.?A\.?|EIRELI|ME\b/;
  return !companySignals.test(counterpartyKey);
}

function matchesRule(group: BankStatementLineGroup, rule: EvidenceReferenceData["activeRules"][number]): boolean {
  if (rule.criteriaDirection && rule.criteriaDirection !== group.direction) return false;
  const hasCounterpartyCriteria = Boolean(rule.criteriaCounterpartyPattern);
  const hasKeywordCriteria = Boolean(rule.criteriaDescriptionKeyword);
  if (!hasCounterpartyCriteria && !hasKeywordCriteria) return false; // regra sem nenhum critério específico nunca é aplicada — ver validateRuleNotTooBroad.

  let matched = true;
  if (hasCounterpartyCriteria) matched = matched && group.counterpartyKey.toUpperCase().includes(rule.criteriaCounterpartyPattern!.toUpperCase());
  if (hasKeywordCriteria) matched = matched && group.lines.some((l) => l.description.toUpperCase().includes(rule.criteriaDescriptionKeyword!.toUpperCase()));
  return matched;
}

/**
 * Uma regra sem nenhum critério específico (só direção, por exemplo) bateria em praticamente
 * tudo — rejeitada explicitamente na criação (Fase V, teste "regra excessivamente ampla
 * rejeitada"). Exportado para ser reaproveitado na validação de criação de regra.
 */
export function validateRuleNotTooBroad(input: { criteriaCounterpartyPattern: string | null; criteriaDescriptionKeyword: string | null }): string | null {
  const pattern = input.criteriaCounterpartyPattern?.trim() ?? "";
  const keyword = input.criteriaDescriptionKeyword?.trim() ?? "";
  if (!pattern && !keyword) return "Regra precisa de um critério específico (contraparte ou palavra-chave na descrição) — direção sozinha é ampla demais.";
  if (pattern && pattern.length < 3) return "Padrão de contraparte muito curto (mínimo 3 caracteres) — bateria em lançamentos não relacionados.";
  if (keyword && keyword.length < 3) return "Palavra-chave muito curta (mínimo 3 caracteres) — bateria em lançamentos não relacionados.";
  return null;
}

export function evaluateGroupEvidence(group: BankStatementLineGroup, refs: EvidenceReferenceData): GroupEvidenceResult {
  // 1. Regra ensinada — única fonte de EXACT nesta engine (a outra fonte de EXACT, conciliação
  // de liquidação Stone, é tratada por reconciliation.ts, não aqui).
  //
  // Missão Financeiro V2.4 (achado técnico) — caso real: um grupo com contraparte ambígua (ex.:
  // "AGUAS E SANEAMENTO CASAN CELESC DISTRIBUICAO", que contém as strings de DUAS regras
  // distintas confirmadas pelo gestor — CASAN e Celesc, fornecedores genuinamente diferentes)
  // batia na primeira regra do array por `.includes()`, virando EXACT silenciosamente e
  // escondendo um CONFLICT real. Corrigido: coleta TODAS as regras que batem antes de decidir —
  // 1 regra bate = EXACT (comportamento antigo, intocado); 2+ regras com padrões distintos batem
  // = CONFLICT (mesma semântica já usada abaixo para "conflicting_supplier_candidates"), nunca a
  // primeira escolhida arbitrariamente.
  const matchingRules = refs.activeRules.filter((rule) => matchesRule(group, rule));
  const distinctRulePatterns = new Set(matchingRules.map((rule) => (rule.criteriaCounterpartyPattern ?? rule.criteriaDescriptionKeyword ?? rule.id).toUpperCase()));
  if (distinctRulePatterns.size > 1) {
    return {
      confidence: "conflict",
      evidences: [
        {
          kind: "conflicting_supplier_candidates",
          detail: `Contraparte corresponde a ${matchingRules.length} regras ensinadas distintas pelo gestor (${matchingRules.map((r) => r.criteriaCounterpartyPattern ?? r.criteriaDescriptionKeyword).join(", ")}) — ambíguo, exige decisão humana.`,
        },
      ],
      suggestedType: null,
      suggestedSupplierId: null,
      suggestedPartnerId: null,
      suggestedCategoryId: null,
      matchedRuleId: null,
      reasonSummary: "Mais de uma regra ensinada corresponde a esta contraparte — ambíguo, exige decisão humana.",
    };
  }
  if (matchingRules.length === 1) {
    const rule = matchingRules[0];
    return {
      confidence: "exact",
      evidences: [{ kind: "exact_rule_match", detail: `Regra ensinada pelo gestor aplicada (id ${rule.id}).` }],
      suggestedType: rule.resultingType,
      suggestedSupplierId: rule.supplierId,
      suggestedPartnerId: rule.partnerId,
      suggestedCategoryId: rule.categoryId,
      matchedRuleId: rule.id,
      reasonSummary: `Corresponde a uma regra confirmada anteriormente pelo gestor para este padrão exato.`,
    };
  }

  const evidences: Evidence[] = [];
  let suggestedSupplierId: string | null = null;
  const suggestedCategoryId: string | null = null;

  const supplierMatches = refs.suppliers
    .map((s) => ({ supplier: s, matchLevel: counterpartyMatchesRegisteredName(group.counterpartyKey, s.name) }))
    .filter((m) => m.matchLevel !== "none");

  if (supplierMatches.length > 1) {
    return {
      confidence: "conflict",
      evidences: [{ kind: "conflicting_supplier_candidates", detail: `Contraparte corresponde a ${supplierMatches.length} fornecedores cadastrados distintos: ${supplierMatches.map((m) => m.supplier.name).join(", ")}.` }],
      suggestedType: null,
      suggestedSupplierId: null,
      suggestedPartnerId: null,
      suggestedCategoryId: null,
      matchedRuleId: null,
      reasonSummary: "Mais de um fornecedor cadastrado corresponde a esta contraparte — ambíguo, exige decisão humana.",
    };
  }

  if (supplierMatches.length === 1) {
    const { supplier, matchLevel } = supplierMatches[0];
    if (group.direction === "entrada") {
      return {
        confidence: "conflict",
        evidences: [{ kind: "direction_conflicts_with_supplier_history", detail: `"${supplier.name}" é um fornecedor (sempre pago, nunca paga) mas este grupo é de entradas.` }],
        suggestedType: null,
        suggestedSupplierId: null,
        suggestedPartnerId: null,
        suggestedCategoryId: null,
        matchedRuleId: null,
        reasonSummary: `A contraparte corresponde ao fornecedor "${supplier.name}", mas a direção (entrada) é inconsistente com um fornecedor — revisar.`,
      };
    }

    evidences.push({ kind: matchLevel === "exact" ? "exact_supplier_name" : "supplier_name_contains", detail: `Contraparte "${group.counterpartyKey}" corresponde ao fornecedor cadastrado "${supplier.name}".` });
    suggestedSupplierId = supplier.id;

    const template = refs.recurringBillTemplates.find((t) => t.supplierId === supplier.id && t.amount !== null);
    if (template && template.amount !== null && amountWithinTolerance(group.averageAmount, template.amount)) {
      evidences.push({ kind: "recurring_amount_match", detail: `Valor médio (R$ ${group.averageAmount.toFixed(2)}) bate com a despesa recorrente "${template.description}" (R$ ${template.amount.toFixed(2)}).` });
    }

    if (group.distinctMonths >= RECURRENCE_MIN_MONTHS) {
      evidences.push({ kind: "recurrence_pattern", detail: `Padrão repetido em ${group.distinctMonths} meses distintos.` });
    }

    // Fornecedor identificado (exato ou "contém") conta como 1 evidência; HIGH_CONFIDENCE exige
    // pelo menos mais 1 evidência independente corroborando (valor recorrente OU recorrência
    // temporal) — nunca o nome do fornecedor sozinho, mesmo quando o match é exato.
    const confidence: ConfidenceTier = evidences.length >= 2 ? "high_confidence" : "review";

    return {
      confidence,
      evidences,
      suggestedType: "pagamento",
      suggestedSupplierId,
      suggestedPartnerId: null,
      suggestedCategoryId,
      matchedRuleId: null,
      reasonSummary: confidence === "high_confidence" ? `Fornecedor conhecido + valor/recorrência confirmam o padrão — ainda assim aguarda confirmação em lote (nunca EXACT sem regra ensinada).` : `Fornecedor identificado, mas sem corroboração suficiente (valor ou recorrência) — revisão recomendada.`,
    };
  }

  // Sem fornecedor conhecido — sinais mais fracos, sempre REVIEW ou INSUFFICIENT (Fase O: aporte/retirada nunca automático).
  const stoneRelatedAccount = group.lines.some((l) => /STONE INSTITUI[ÇC][ÃA]O/i.test(l.description));
  if (stoneRelatedAccount) {
    evidences.push({ kind: "possible_related_account_counterparty", detail: `Descrição menciona "Stone Instituição de Pagamento" como contraparte — pode ser transferência para outra conta Stone relacionada, mas só há evidência de um lado do movimento.` });
    return {
      confidence: "review",
      evidences,
      suggestedType: null,
      suggestedSupplierId: null,
      suggestedPartnerId: null,
      suggestedCategoryId: null,
      matchedRuleId: null,
      reasonSummary: "Possível transferência para conta própria/relacionada — não confirmável sem o outro lado do movimento.",
    };
  }

  if (looksLikePersonalName(group.counterpartyKey) && group.count >= 2) {
    evidences.push({ kind: "possible_personal_name_recurring", detail: `Contraparte com formato de nome de pessoa física, repetida ${group.count}x — pode ser aporte, retirada, prestador de serviço ou reembolso.` });
    return {
      confidence: "review",
      evidences,
      suggestedType: null,
      suggestedSupplierId: null,
      suggestedPartnerId: null,
      suggestedCategoryId: null,
      matchedRuleId: null,
      reasonSummary: "Padrão recorrente com nome de pessoa física — natureza (aporte/retirada/prestador) não pode ser presumida automaticamente.",
    };
  }

  if (group.count === 1 && group.totalAmount < 50) {
    return {
      confidence: "insufficient",
      evidences: [],
      suggestedType: null,
      suggestedSupplierId: null,
      suggestedPartnerId: null,
      suggestedCategoryId: null,
      matchedRuleId: null,
      reasonSummary: "Ocorrência única, valor baixo, nenhuma evidência disponível.",
    };
  }

  return {
    confidence: "review",
    evidences: [],
    suggestedType: null,
    suggestedSupplierId: null,
    suggestedPartnerId: null,
    suggestedCategoryId: null,
    matchedRuleId: null,
    reasonSummary: "Nenhuma evidência determinística encontrada — revisão manual necessária.",
  };
}
