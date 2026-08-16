import { describe, expect, it } from "vitest";
import { computeDreReport } from "@/lib/finance/dre";
import { computeDreCoverage } from "@/lib/finance/service";
import type { AccountsPayable, AccountsReceivable, ClassificationRule, FinancialClassification } from "@/lib/finance/types";

/**
 * Missão Financeiro V3.0 — cobertura de classificação da DRE, por contagem E por valor. Constrói
 * o DreReport via computeDreReport (mesmo motor real) em vez de um fixture de DreReport escrito à
 * mão, para garantir que computeDreCoverage sempre reflete o formato real produzido pela DRE.
 */
function makeAR(overrides: Partial<AccountsReceivable>): AccountsReceivable {
  return {
    id: "ar-1",
    customerId: null,
    partnerId: null,
    contractId: null,
    partyName: "Cliente",
    costCenterId: null,
    costCenterName: "Estética Automotiva",
    categoryId: null,
    categoryName: "Lavação",
    financialAccountId: null,
    financialAccountName: null,
    description: "Receita",
    competenceDate: "2026-07-10",
    issueDate: null,
    dueDate: "2026-07-10",
    expectedAmount: 1000,
    receivedAmount: 0,
    outstandingAmount: 1000,
    status: "open",
    paymentMethod: "desconhecido",
    invoiceNumber: null,
    invoiceIssued: false,
    receivedAt: null,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    feeAmount: null,
    netAmount: null,
    responsibleName: null,
    approverName: null,
    source: "manual",
    externalId: null,
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAP(overrides: Partial<AccountsPayable>): AccountsPayable {
  return {
    id: "ap-1",
    description: "Despesa",
    supplierId: null,
    supplierName: null,
    categoryId: "cat-manutencao",
    categoryName: "Manutenção",
    costCenterId: null,
    costCenterName: null,
    financialAccountId: null,
    financialAccountName: null,
    competenceDate: "2026-07-10",
    issueDate: null,
    dueDate: "2026-07-10",
    originalAmount: 300,
    paidAmount: 0,
    outstandingAmount: 300,
    paymentMethod: "desconhecido",
    documentNumber: null,
    status: "pendente",
    pendingData: false,
    recurringBillTemplateId: null,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    attachmentRef: null,
    source: "manual",
    externalId: null,
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const emptyClassifications: FinancialClassification[] = [];
const emptyRules: ClassificationRule[] = [];

describe("computeDreCoverage — cobertura por contagem e por valor (Missão V3.0)", () => {
  it("100% quando não há nenhum lançamento pendente", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({})],
      accountsReceivable: [makeAR({})],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    const coverage = computeDreCoverage(report);
    expect(coverage.countTotal).toBe(2);
    expect(coverage.countClassified).toBe(2);
    expect(coverage.countPercent).toBe(100);
    expect(coverage.valueTotal).toBe(1300);
    expect(coverage.valueClassified).toBe(1300);
    expect(coverage.valuePercent).toBe(100);
  });

  it("reduz proporcionalmente quando há lançamentos sem categoria (pendente de revisão)", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({}), makeAP({ id: "ap-pendente", categoryName: "Categoria inexistente", originalAmount: 700 })],
      accountsReceivable: [makeAR({})],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    const coverage = computeDreCoverage(report);
    expect(coverage.countTotal).toBe(3);
    expect(coverage.countClassified).toBe(2);
    expect(coverage.countPercent).toBe(66.67);
    expect(coverage.valueTotal).toBe(2000);
    expect(coverage.valueClassified).toBe(1300);
    expect(coverage.valuePercent).toBe(65);
  });

  it("nunca soma naoClassificados nos totais da DRE — cobertura é só uma métrica derivada, separada", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({ categoryName: "Categoria inexistente", originalAmount: 500 })],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(0);
    const coverage = computeDreCoverage(report);
    expect(coverage.valueTotal).toBe(500);
    expect(coverage.valueClassified).toBe(0);
    expect(coverage.valuePercent).toBe(0);
  });

  it("percentuais nulos quando não há absolutamente nenhum lançamento no período (0/0 indefinido)", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    const coverage = computeDreCoverage(report);
    expect(coverage.countTotal).toBe(0);
    expect(coverage.countPercent).toBeNull();
    expect(coverage.valueTotal).toBe(0);
    expect(coverage.valuePercent).toBeNull();
  });
});
