import "server-only";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { groupBankStatementLines, buildGroupFromLines, type BankStatementLineGroup } from "@/lib/finance/bankStatement/grouping";
import { evaluateGroupEvidence, type ConfidenceTier, type GroupEvidenceResult } from "@/lib/finance/bankStatement/evidence";
import { extractCounterpartyKey } from "@/lib/finance/bankStatement/normalization";
import { STONE_SETTLEMENT_LINE_TYPES } from "@/lib/finance/bankStatement/types";
import type { EvidenceReferenceData } from "@/lib/finance/bankStatement/evidence";
import type { BankStatementLine } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.2 (Fase C/D/T) — orquestra I/O (busca linhas + fornecedores + despesas
 * recorrentes + regras ativas) e aplica as funções puras de agrupamento/evidência. Usado tanto
 * pelo dry-run (Fase T, só leitura) quanto pela UI de revisão (Fase Q/R).
 */
export interface ClassifiedGroup {
  group: BankStatementLineGroup;
  evidence: GroupEvidenceResult;
}

async function loadReferenceData(): Promise<EvidenceReferenceData> {
  const financeRepo = getFinanceRepository();
  const bankRepo = getBankStatementRepository();
  const [suppliers, recurringBillTemplates, partners, activeRules] = await Promise.all([
    financeRepo.listSuppliers(),
    financeRepo.listRecurringBillTemplates(),
    financeRepo.listPartners(),
    bankRepo.listClassificationRules(true),
  ]);

  return {
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    recurringBillTemplates: recurringBillTemplates.map((t) => ({ id: t.id, supplierId: t.supplierId, description: t.description, amount: t.amount })),
    partners: partners.map((p) => ({ id: p.id, name: p.name })),
    activeRules: activeRules.map((r) => ({
      id: r.id,
      criteriaDirection: r.criteriaDirection,
      criteriaCounterpartyPattern: r.criteriaCounterpartyPattern,
      criteriaDescriptionKeyword: r.criteriaDescriptionKeyword,
      resultingType: r.resultingType,
      categoryId: r.categoryId,
      supplierId: r.supplierId,
      partnerId: r.partnerId,
    })),
  };
}

/**
 * Missão Financeiro V2.2 (Fase J) — Fase K/L pedem explicitamente para NUNCA misturar
 * "classificação bancária" (este motor) com "conciliação da adquirente" (`reconciliation.ts`,
 * `attemptStoneSettlementReconciliation`, Missão V2.1). `recebimento_venda_stone`/
 * `antecipacao_credito` têm seu próprio fluxo dedicado — nunca entram aqui, senão toda liquidação
 * Stone (que sempre menciona "Stone Instituição de Pagamento" como contraparte) seria
 * incorretamente sinalizada como "possível transferência para conta relacionada".
 */
function excludeStoneSettlementCandidates(lines: BankStatementLine[]): BankStatementLine[] {
  return lines.filter((l) => !STONE_SETTLEMENT_LINE_TYPES.includes(l.type));
}

/**
 * Missão Financeiro V2.2 — dois grupos de texto diferentes podem resolver para o MESMO
 * fornecedor real (ex.: "STYLUS CONTABILIDADE PAGAMENTO" x "STYLUS CONTABILIDADE STYLUS
 * CONTABILIDADE PAGAMENTO" — mesma empresa, formatação de extrato levemente diferente). Depois
 * de avaliar a evidência de cada grupo textual, funde os que apontaram para o mesmo
 * `suggestedSupplierId` (+ mesma direção) numa única sugestão — o gestor confirma UMA vez, não
 * duas. Nunca funde grupos sem fornecedor sugerido (nada a fundir com segurança).
 */
function mergeGroupsBySupplier(classified: ClassifiedGroup[], refs: EvidenceReferenceData): ClassifiedGroup[] {
  const bySupplier = new Map<string, ClassifiedGroup[]>();
  const passthrough: ClassifiedGroup[] = [];

  for (const c of classified) {
    if (!c.evidence.suggestedSupplierId) {
      passthrough.push(c);
      continue;
    }
    const key = `${c.evidence.suggestedSupplierId}|${c.group.direction}`;
    const bucket = bySupplier.get(key) ?? [];
    bucket.push(c);
    bySupplier.set(key, bucket);
  }

  const merged: ClassifiedGroup[] = [...passthrough];
  for (const bucket of bySupplier.values()) {
    if (bucket.length === 1) {
      merged.push(bucket[0]);
      continue;
    }
    const allLines = bucket.flatMap((c) => c.group.lines);
    const mergedGroup = buildGroupFromLines(allLines, `supplier|${bucket[0].evidence.suggestedSupplierId}|${bucket[0].group.direction}`);
    merged.push({ group: mergedGroup, evidence: evaluateGroupEvidence(mergedGroup, refs) });
  }

  return merged.sort((a, b) => b.group.count - a.group.count || b.group.totalAmount - a.group.totalAmount);
}

export async function classifyPendingLines(financialAccountId: string, statusFilter: "a_classificar" | "nao_conciliado" | "all" = "all"): Promise<ClassifiedGroup[]> {
  const bankRepo = getBankStatementRepository();
  const refs = await loadReferenceData();

  const rawLines =
    statusFilter === "all"
      ? [...(await bankRepo.listLines({ financialAccountId, status: "a_classificar" })), ...(await bankRepo.listLines({ financialAccountId, status: "nao_conciliado" }))]
      : await bankRepo.listLines({ financialAccountId, status: statusFilter });
  const lines = excludeStoneSettlementCandidates(rawLines);

  const groups = groupBankStatementLines(lines);
  const classified = groups.map((group) => ({ group, evidence: evaluateGroupEvidence(group, refs) }));
  return mergeGroupsBySupplier(classified, refs);
}

export interface DryRunClassificationReport {
  totalLines: number;
  totalAlreadyClassified: number;
  totalPending: number;
  /** Fase J/K — candidatos Stone (recebimento/antecipação), SEMPRE reportados separadamente, nunca misturados com a classificação bancária geral. */
  stoneCandidates: { total: number; conciliado: number; sugerido: number; naoConciliado: number };
  /** Fora dos candidatos Stone — Pix, tarifas, pagamentos, devoluções, etc. */
  byConfidence: Record<ConfidenceTier, { groups: number; lines: number; totalAmount: number }>;
  topGroups: {
    counterpartyKey: string;
    direction: string;
    type: string;
    count: number;
    totalAmount: number;
    confidence: ConfidenceTier;
    reasonSummary: string;
  }[];
}

const CONFIDENCE_TIERS: ConfidenceTier[] = ["exact", "high_confidence", "review", "insufficient", "conflict"];

/** Fase T — dry run. Nunca escreve no banco; só lê e reporta. */
export async function buildDryRunClassificationReport(financialAccountId: string): Promise<DryRunClassificationReport> {
  const bankRepo = getBankStatementRepository();
  const allLines = await bankRepo.listLines({ financialAccountId });
  const pendingLines = allLines.filter((l) => l.status === "a_classificar" || l.status === "nao_conciliado" || l.status === "sugerido");
  const classified = await classifyPendingLines(financialAccountId, "all");

  const stoneLines = allLines.filter((l) => STONE_SETTLEMENT_LINE_TYPES.includes(l.type));
  const stoneCandidates = {
    total: stoneLines.length,
    conciliado: stoneLines.filter((l) => l.status === "conciliado").length,
    sugerido: stoneLines.filter((l) => l.status === "sugerido").length,
    naoConciliado: stoneLines.filter((l) => l.status === "nao_conciliado").length,
  };

  const byConfidence = Object.fromEntries(CONFIDENCE_TIERS.map((t) => [t, { groups: 0, lines: 0, totalAmount: 0 }])) as DryRunClassificationReport["byConfidence"];
  for (const { group, evidence } of classified) {
    const bucket = byConfidence[evidence.confidence];
    bucket.groups += 1;
    bucket.lines += group.count;
    bucket.totalAmount = Math.round((bucket.totalAmount + group.totalAmount) * 100) / 100;
  }

  const topGroups = [...classified]
    .sort((a, b) => b.group.count - a.group.count || b.group.totalAmount - a.group.totalAmount)
    .slice(0, 30)
    .map(({ group, evidence }) => ({
      counterpartyKey: group.counterpartyKey,
      direction: group.direction,
      type: group.type,
      count: group.count,
      totalAmount: group.totalAmount,
      confidence: evidence.confidence,
      reasonSummary: evidence.reasonSummary,
    }));

  return {
    totalLines: allLines.length,
    totalAlreadyClassified: allLines.length - pendingLines.length,
    totalPending: pendingLines.length,
    stoneCandidates,
    byConfidence,
    topGroups,
  };
}

export { extractCounterpartyKey };
