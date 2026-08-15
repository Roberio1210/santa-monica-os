import { describe, expect, it } from "vitest";
import { evaluateGroupEvidence, validateRuleNotTooBroad, type EvidenceReferenceData } from "@/lib/finance/bankStatement/evidence";
import { groupBankStatementLines } from "@/lib/finance/bankStatement/grouping";
import type { BankStatementLine } from "@/lib/finance/bankStatement/types";

function line(overrides: Partial<BankStatementLine>): BankStatementLine {
  return {
    id: overrides.id ?? "line-1",
    importId: "import-1",
    rowIndex: 0,
    rawData: {},
    date: "2026-01-10",
    description: "Transferência | Pix / CELESC DISTRIBUICAO S.A",
    counterparty: null,
    direction: "saida",
    amount: 500,
    type: "pix_enviado",
    status: "a_classificar",
    categoryId: null,
    supplierId: null,
    partnerId: null,
    matchedStoneAmount: null,
    matchedStoneDivergence: null,
    linkedAccountsReceivableId: null,
    linkedAccountsPayableId: null,
    linkedCashMovementId: null,
    linkedAccountTransferId: null,
    reconciliationNote: null,
    processedBy: null,
    dedupeKey: `key-${overrides.id ?? "1"}`,
    ...overrides,
  };
}

const emptyRefs: EvidenceReferenceData = { suppliers: [], recurringBillTemplates: [], partners: [], activeRules: [] };

describe("evaluateGroupEvidence — regra absoluta: nunca EXACT/HIGH_CONFIDENCE com 1 evidência isolada", () => {
  it("regra ativa correspondente -> EXACT", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "Transferência | Pix / EMPRESA XYZ" })])[0];
    const refs: EvidenceReferenceData = {
      ...emptyRefs,
      activeRules: [{ id: "rule-1", criteriaDirection: "saida", criteriaCounterpartyPattern: "EMPRESA XYZ", criteriaDescriptionKeyword: null, resultingType: "pagamento", categoryId: "cat-1", supplierId: null, partnerId: null }],
    };
    const result = evaluateGroupEvidence(group, refs);
    expect(result.confidence).toBe("exact");
    expect(result.matchedRuleId).toBe("rule-1");
  });

  it("fornecedor conhecido (nome parcial real: 'Verisure Brasil' contém 'Verisure') + valor bate com despesa recorrente -> HIGH_CONFIDENCE (2 evidências)", () => {
    const group = groupBankStatementLines([
      line({ id: "1", date: "2026-01-08", amount: 276.11, description: "Transferência | Pix / VERISURE BRASIL" }),
      line({ id: "2", date: "2026-02-08", amount: 280.0, description: "Transferência | Pix / VERISURE BRASIL" }),
      line({ id: "3", date: "2026-03-08", amount: 270.0, description: "Transferência | Pix / VERISURE BRASIL" }),
    ])[0];
    const refs: EvidenceReferenceData = {
      suppliers: [{ id: "sup-verisure", name: "Verisure" }],
      recurringBillTemplates: [{ id: "rec-1", supplierId: "sup-verisure", description: "Verisure", amount: 276.11 }],
      partners: [],
      activeRules: [],
    };
    const result = evaluateGroupEvidence(group, refs);
    expect(result.confidence).toBe("high_confidence");
    expect(result.evidences.length).toBeGreaterThanOrEqual(2);
    expect(result.suggestedSupplierId).toBe("sup-verisure");
  });

  it("fornecedor conhecido, MAS sem corroboração de valor/recorrência -> REVIEW, nunca HIGH_CONFIDENCE", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "Transferência | Pix / STYLUS CONTABILIDADE", amount: 3.34 })])[0];
    const refs: EvidenceReferenceData = {
      suppliers: [{ id: "sup-stylus", name: "Stylus Contabilidade" }],
      recurringBillTemplates: [{ id: "rec-1", supplierId: "sup-stylus", description: "Stylus", amount: 406.6 }],
      partners: [],
      activeRules: [],
    };
    const result = evaluateGroupEvidence(group, refs);
    expect(result.confidence).toBe("review");
  });

  it("fornecedor cadastrado corresponde, mas direção é entrada -> CONFLICT (fornecedor nunca paga)", () => {
    const group = groupBankStatementLines([line({ id: "1", direction: "entrada", type: "pix_recebido", description: "Transferência | Pix / CELESC DISTRIBUICAO S.A" })])[0];
    const refs: EvidenceReferenceData = { ...emptyRefs, suppliers: [{ id: "sup-celesc", name: "Celesc" }] };
    const result = evaluateGroupEvidence(group, refs);
    expect(result.confidence).toBe("conflict");
  });

  it("contraparte corresponde a 2 fornecedores cadastrados distintos -> CONFLICT", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "Transferência | Pix / VIVO" })])[0];
    const refs: EvidenceReferenceData = { ...emptyRefs, suppliers: [{ id: "sup-1", name: "Vivo — Internet" }, { id: "sup-2", name: "Vivo — Telefonia" }] };
    const result = evaluateGroupEvidence(group, refs);
    expect(result.confidence).toBe("conflict");
  });

  it("contraparte com nome de pessoa física recorrente, sem fornecedor -> REVIEW (possível aporte/retirada/prestador), nunca classificado sozinho", () => {
    const group = groupBankStatementLines([
      line({ id: "1", description: "Transferência | Pix / ROBERIO ROCHA FILHO", direction: "entrada", type: "pix_recebido", amount: 1421 }),
      line({ id: "2", description: "Transferência | Pix / ROBERIO ROCHA FILHO", direction: "entrada", type: "pix_recebido", amount: 1450, date: "2026-03-06" }),
    ])[0];
    const result = evaluateGroupEvidence(group, emptyRefs);
    expect(result.confidence).toBe("review");
    expect(result.suggestedType).toBeNull();
  });

  it("contraparte menciona Stone Instituição de Pagamento -> REVIEW (possível conta relacionada, nunca transferência automática)", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "ROBERIO ROCHA FILHO / Transferência | Pix / STONE INSTITUIÇÃO DE" })])[0];
    const result = evaluateGroupEvidence(group, emptyRefs);
    expect(result.confidence).toBe("review");
    expect(result.suggestedType).toBeNull();
  });

  it("ocorrência única, valor baixo, sem nenhuma evidência -> INSUFFICIENT", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "Transferência | Pix / XPTO123", amount: 5 })])[0];
    const result = evaluateGroupEvidence(group, emptyRefs);
    expect(result.confidence).toBe("insufficient");
  });

  it("nenhuma sugestão automática nunca inclui suggestedType quando confidence é review/insufficient/conflict", () => {
    const group = groupBankStatementLines([line({ id: "1", description: "Transferência | Pix / ALGO DESCONHECIDO", amount: 5000 })])[0];
    const result = evaluateGroupEvidence(group, emptyRefs);
    expect(["review", "insufficient", "conflict"]).toContain(result.confidence);
    expect(result.suggestedType).toBeNull();
  });
});

describe("validateRuleNotTooBroad — Fase V, regra excessivamente ampla rejeitada", () => {
  it("regra só com direção (sem contraparte/palavra-chave) é rejeitada", () => {
    expect(validateRuleNotTooBroad({ criteriaCounterpartyPattern: null, criteriaDescriptionKeyword: null })).not.toBeNull();
  });

  it("padrão de contraparte muito curto é rejeitado", () => {
    expect(validateRuleNotTooBroad({ criteriaCounterpartyPattern: "AB", criteriaDescriptionKeyword: null })).not.toBeNull();
  });

  it("regra com contraparte específica é aceita", () => {
    expect(validateRuleNotTooBroad({ criteriaCounterpartyPattern: "EMPRESA XYZ", criteriaDescriptionKeyword: null })).toBeNull();
  });
});
