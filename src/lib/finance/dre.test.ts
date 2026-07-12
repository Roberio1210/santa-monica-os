import { describe, expect, it } from "vitest";
import { computeDreReport, resolveClassification, resolveTransferClassification } from "@/lib/finance/dre";
import type { AccountsPayable, AccountsReceivable, CashMovement, ClassificationRule, FinancialClassification } from "@/lib/finance/types";

function makeAR(overrides: Partial<AccountsReceivable>): AccountsReceivable {
  return {
    id: "ar-1",
    customerId: null,
    partnerId: "iesa-nissan",
    contractId: null,
    partyName: "Grupo IESA/Nissan",
    costCenterId: "cc-estetica",
    costCenterName: "Estética Automotiva",
    categoryId: "receita-lavacao",
    categoryName: "Lavação",
    financialAccountId: null,
    financialAccountName: null,
    description: "Lavações de julho",
    competenceDate: "2026-07-01",
    issueDate: null,
    dueDate: "2026-08-10",
    expectedAmount: 900,
    receivedAmount: 0,
    outstandingAmount: 900,
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
    description: "Aluguel",
    supplierId: "fornecedor-mota",
    supplierName: "Mota Imobiliária",
    categoryId: "despesa-aluguel",
    categoryName: "Aluguel",
    costCenterId: "cc-administrativo",
    costCenterName: "Administrativo",
    financialAccountId: null,
    financialAccountName: null,
    competenceDate: "2026-07-01",
    issueDate: null,
    dueDate: "2026-07-05",
    originalAmount: 4750,
    paidAmount: 0,
    outstandingAmount: 4750,
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

function makeCM(overrides: Partial<CashMovement>): CashMovement {
  return {
    id: "cm-1",
    date: "2026-07-10",
    type: "entrada",
    nature: null,
    amount: 900,
    description: "Recebimento",
    accountsReceivableId: null,
    accountsPayableId: null,
    categoryId: "receita-lavacao",
    categoryName: "Lavação",
    costCenterId: "cc-estetica",
    costCenterName: "Estética Automotiva",
    financialAccountId: "conta-stone",
    financialAccountName: "Stone",
    paymentId: null,
    partnerId: null,
    customerId: null,
    supplierId: null,
    partyName: null,
    responsibleName: null,
    documentRef: null,
    competenceDate: null,
    balanceBefore: 0,
    balanceAfter: 900,
    source: "manual",
    externalId: null,
    notes: null,
    ...overrides,
  };
}

const emptyClassifications: FinancialClassification[] = [];
const emptyRules: ClassificationRule[] = [];

describe("DRE em regime de competência", () => {
  it("reconhece receita pelo valor integral da obrigação, independente de ter sido recebida", () => {
    const ar = makeAR({ receivedAmount: 0, outstandingAmount: 900, status: "open" });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [ar],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(900);
    expect(report.receitaBrutaEstetica.amount).toBe(900);
  });

  it("classifica despesa por categoria (aluguel) como despesa operacional", () => {
    const ap = makeAP({});
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(4750);
    expect(report.resultadoOperacional).toBe(-4750);
  });

  it("classifica produtos e insumos como custo direto (margem de contribuição)", () => {
    const ap = makeAP({ categoryName: "Produtos e insumos", originalAmount: 300 });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [makeAR({ expectedAmount: 900 })],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.custosDiretos.amount).toBe(300);
    expect(report.margemContribuicao).toBe(600);
  });

  it("nunca inclui conta cancelada na DRE", () => {
    const ar = makeAR({ status: "cancelled" });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [ar],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(0);
  });

  it("estorno gera receita bruta + dedução equivalente — reverte corretamente o efeito gerencial", () => {
    const ar = makeAR({ status: "reversed", expectedAmount: 900 });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [ar],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(900);
    expect(report.deducoes.amount).toBe(900);
    expect(report.receitaLiquida).toBe(0);
  });

  it("recebimento/pagamento parcial não afeta a competência — a obrigação inteira aparece", () => {
    const ap = makeAP({ originalAmount: 1000, paidAmount: 400, outstandingAmount: 600, status: "parcialmente_paga" });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(1000); // valor integral, não os 400 já pagos
  });

  it("parcelamento: cada parcela entra na sua própria competência (não duplica nem soma tudo de uma vez)", () => {
    const parcela1 = makeAP({ id: "p1", description: "Compra (1/3)", originalAmount: 100, competenceDate: "2026-07-01" });
    const parcela2 = makeAP({ id: "p2", description: "Compra (2/3)", originalAmount: 100, competenceDate: "2026-08-01" });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [parcela1, parcela2],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(100); // só a parcela de julho
  });

  it("empréstimo (categoria Empréstimos e financiamentos) vai para resultado financeiro, marcado como revisão necessária — nunca inventa a composição principal/juros", () => {
    const ap = makeAP({ categoryName: "Empréstimos e financiamentos", originalAmount: 1540.86 });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(0);
    expect(report.resultadoFinanceiro.amount).toBe(-1540.86);
  });

  it("reembolso a sócio não duplica a despesa original — fica fora da DRE", () => {
    const originalExpense = makeAP({ id: "orig", description: "Combustível", categoryName: "Transporte e logística", originalAmount: 150 });
    const reimbursement = makeAP({ id: "reemb", description: "Reembolso a Robério", categoryName: "Reembolso a sócios/colaboradores", originalAmount: 150 });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [originalExpense, reimbursement],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(150); // só a despesa original, uma vez
  });
});

describe("DRE em regime de caixa", () => {
  it("usa cash_movements, nunca accounts_payable/receivable", () => {
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({})],
      accountsReceivable: [makeAR({})],
      cashMovements: [makeCM({ type: "entrada", amount: 500, nature: "receita" })],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(500); // só o cash_movement, não os 4750/900 de AP/AR
  });

  it("taxa bancária/tarifa/juros manuais vão para resultado financeiro", () => {
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [makeCM({ type: "saida", amount: 15, nature: "taxa_bancaria" })],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.resultadoFinanceiro.amount).toBe(-15);
    expect(report.despesasOperacionais.amount).toBe(0);
  });

  it("nunca conta cash_movement fora da janela de competência informada", () => {
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [makeCM({ date: "2026-08-01" })],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(0);
  });
});

describe("Transferências, aportes e retiradas — sempre fora da DRE", () => {
  it("transferência entre contas nunca entra na DRE", () => {
    const resolved = resolveTransferClassification("transferencia");
    expect(resolved.includeInDre).toBe(false);
    expect(resolved.dreLine).toBe("fora_dre");
  });

  it("aporte de sócios nunca entra como receita", () => {
    const resolved = resolveTransferClassification("aporte_socios");
    expect(resolved.nature).toBe("aporte");
    expect(resolved.includeInDre).toBe(false);
  });

  it("retirada nunca entra como despesa operacional", () => {
    const resolved = resolveTransferClassification("retirada");
    expect(resolved.nature).toBe("retirada");
    expect(resolved.includeInDre).toBe(false);
  });
});

describe("Classificação — precedência manual > regra > categoria > pendente", () => {
  it("classificação manual explícita tem prioridade sobre tudo", () => {
    const explicit: FinancialClassification = {
      id: "c1",
      accountsPayableId: "ap-1",
      accountsReceivableId: null,
      cashMovementId: null,
      accountTransferId: null,
      dreLine: "custos_diretos",
      nature: "custo_direto",
      includeInDre: true,
      origin: "manual",
      reviewNeeded: false,
      classifiedBy: "Robério",
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const resolved = resolveClassification({ categoryName: "Aluguel", supplierId: null, partnerId: null, description: "x" }, explicit, []);
    expect(resolved.dreLine).toBe("custos_diretos");
    expect(resolved.origin).toBe("manual");
  });

  it("regra por fornecedor tem prioridade sobre o padrão da categoria", () => {
    const rule: ClassificationRule = {
      id: "r1",
      matchType: "fornecedor",
      supplierId: "fornecedor-mota",
      supplierName: "Mota Imobiliária",
      partnerId: null,
      partnerName: null,
      categoryId: null,
      categoryName: null,
      keyword: null,
      dreLine: "custos_diretos",
      nature: "custo_direto",
      suggestedCostCenterId: null,
      suggestedCostCenterName: null,
      includeInDre: true,
      reviewNeeded: false,
      enabled: true,
      notes: null,
    };
    const resolved = resolveClassification({ categoryName: "Aluguel", supplierId: "fornecedor-mota", partnerId: null, description: "Aluguel" }, undefined, [rule]);
    expect(resolved.dreLine).toBe("custos_diretos");
    expect(resolved.origin).toBe("herdada_fornecedor");
  });

  it("regra desabilitada (enabled=false) nunca é aplicada — cai no padrão da categoria", () => {
    const rule: ClassificationRule = {
      id: "r1",
      matchType: "fornecedor",
      supplierId: "fornecedor-mota",
      supplierName: "Mota Imobiliária",
      partnerId: null,
      partnerName: null,
      categoryId: null,
      categoryName: null,
      keyword: null,
      dreLine: "custos_diretos",
      nature: "custo_direto",
      suggestedCostCenterId: null,
      suggestedCostCenterName: null,
      includeInDre: true,
      reviewNeeded: false,
      enabled: false,
      notes: null,
    };
    const resolved = resolveClassification({ categoryName: "Aluguel", supplierId: "fornecedor-mota", partnerId: null, description: "Aluguel" }, undefined, [rule]);
    expect(resolved.dreLine).toBe("despesas_operacionais"); // padrão da categoria Aluguel
    expect(resolved.origin).toBe("herdada_categoria");
  });

  it("sem regra e sem categoria conhecida, fica pendente de revisão", () => {
    const resolved = resolveClassification({ categoryName: null, supplierId: null, partnerId: null, description: "Lançamento avulso" }, undefined, []);
    expect(resolved.origin).toBe("pendente");
    expect(resolved.reviewNeeded).toBe(true);
    expect(resolved.includeInDre).toBe(false);
  });

  it("lançamentos pendentes ficam fora dos totais da DRE, mas aparecem em naoClassificados", () => {
    const ap = makeAP({ categoryName: "Categoria inexistente", supplierId: null });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(0);
    expect(report.naoClassificados).toHaveLength(1);
  });
});

describe("Separação Estética Automotiva x Estacionamento", () => {
  it("filtra a DRE por centro de custo quando solicitado", () => {
    const arEstetica = makeAR({ id: "ar-estetica", costCenterName: "Estética Automotiva", expectedAmount: 900 });
    const arEstacionamento = makeAR({ id: "ar-estacionamento", costCenterName: "Estacionamento", categoryName: "Estacionamento", expectedAmount: 500 });
    const base = {
      regime: "competencia" as const,
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      accountsPayable: [],
      accountsReceivable: [arEstetica, arEstacionamento],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    };

    const consolidado = computeDreReport({ ...base, costCenterGroup: "consolidado" });
    expect(consolidado.receitaBruta).toBe(1400);

    const soEstetica = computeDreReport({ ...base, costCenterGroup: "estetica_automotiva" });
    expect(soEstetica.receitaBruta).toBe(900);

    const soEstacionamento = computeDreReport({ ...base, costCenterGroup: "estacionamento" });
    expect(soEstacionamento.receitaBruta).toBe(500);
  });
});

describe("Consistência de valores", () => {
  it("nunca soma pagamentos e cash_movements no mesmo total — caixa usa só cash_movements", () => {
    const ap = makeAP({ originalAmount: 4750 });
    const cm = makeCM({ type: "saida", amount: 4750, nature: "despesa", categoryName: "Aluguel" });
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap],
      accountsReceivable: [],
      cashMovements: [cm],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(4750); // uma vez só, não 9500
  });

  it("nunca produz valores com imprecisão de ponto flutuante", () => {
    const ap1 = makeAP({ id: "a", originalAmount: 333.33 });
    const ap2 = makeAP({ id: "b", originalAmount: 333.33 });
    const ap3 = makeAP({ id: "c", originalAmount: 333.34 });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [ap1, ap2, ap3],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(1000);
  });
});

describe("EBITDA", () => {
  it("sempre indisponível — sistema não registra depreciação/amortização", () => {
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
    expect(report.ebitda).toBeNull();
    expect(report.ebitdaIndisponivelMotivo).toMatch(/classificação insuficiente/);
  });
});
