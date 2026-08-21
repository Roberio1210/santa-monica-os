import { describe, expect, it } from "vitest";
import { computeDreReport, computeDreVariationPercent, resolveClassification, resolveTransferClassification } from "@/lib/finance/dre";
import type { JumpParkRevenueCandidateInput, StoneFeeCandidateInput } from "@/lib/finance/dre";
import type { AccountsPayable, AccountsReceivable, CashMovement, ClassificationRule, FinancialClassification, Partner } from "@/lib/finance/types";

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

function makePartner(overrides: Partial<Partner>): Partner {
  return { id: "partner-1", name: "Parceiro", type: "outro", ...overrides };
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
    // Despesa presente mas NENHUMA receita no período — resultado não pode ser apresentado como "0 - 4750" (ausência de dado ≠ zero).
    expect(report.resultadoOperacional).toBeNull();
    expect(report.resultadoOperacionalIndisponivelMotivo).toMatch(/receita/i);
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
    // Conta cancelada nunca vira candidata — sem NENHUM lançamento real de receita, o total é "não calculável", nunca 0 fabricado.
    expect(report.receitaBruta).toBeNull();
    expect(report.receitaBrutaIndisponivelMotivo).toMatch(/nenhuma receita/i);
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
    // Movimento fora da janela nunca vira candidato — sem lançamento real dentro do período, o total é "não calculável", nunca 0 fabricado.
    expect(report.receitaBruta).toBeNull();
    expect(report.receitaBrutaIndisponivelMotivo).not.toBeNull();
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

  it("empréstimo recebido de terceiros/sócios nunca entra como receita (Missão V4.0)", () => {
    const resolved = resolveTransferClassification("emprestimo_recebido");
    expect(resolved.nature).toBe("emprestimo");
    expect(resolved.includeInDre).toBe(false);
    expect(resolved.dreLine).toBe("fora_dre");
  });

  it("devolução de empréstimo a terceiros/sócios nunca entra como despesa operacional (Missão V4.0)", () => {
    const resolved = resolveTransferClassification("emprestimo_devolvido");
    expect(resolved.nature).toBe("emprestimo");
    expect(resolved.includeInDre).toBe(false);
    expect(resolved.dreLine).toBe("fora_dre");
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

/**
 * Missão DRE (Validação Final) — "ausência de dado ≠ zero". Cobre explicitamente os 10 cenários
 * pedidos: 1) receita+despesa presentes, 2) receita sem despesa, 3) despesa sem receita,
 * 4) ambos realmente zero com dados válidos, 5) período anterior sem dados,
 * 6) arrays vazios/nulos, 7) fonte sem nenhum lançamento (equivalente, nesta camada pura, a
 * "nenhum dado"), 8) margem sem denominador válido, 9) comparação percentual com base zero,
 * 10) drill-down (soma dos itens) sempre reconciliando com o total do grupo.
 */
describe("Ausência de dado ≠ zero — regra obrigatória da DRE", () => {
  it("1) receita presente + custos diretos presentes + despesas operacionais presentes -> resultado calculável normalmente", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({ categoryName: "Produtos e insumos", originalAmount: 100 }), makeAP({ id: "ap-2", originalAmount: 200 })],
      accountsReceivable: [makeAR({ expectedAmount: 900 })],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(900);
    expect(report.margemContribuicao).toBe(800); // 900 - 100 (custo direto)
    expect(report.resultadoOperacional).toBe(600); // 800 - 200 (despesa operacional)
    expect(report.resultadoOperacionalIndisponivelMotivo).toBeNull();
  });

  it("2) receita presente + nenhuma despesa cadastrada -> resultado NÃO calculável (nunca 'receita - 0')", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [makeAR({ expectedAmount: 900 })],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(900); // receita em si é real e calculável
    expect(report.margemContribuicao).toBeNull(); // sem custo direto real registrado
    expect(report.resultadoOperacional).toBeNull(); // sem despesa operacional real registrada
    expect(report.resultadoOperacionalIndisponivelMotivo).toMatch(/custo direto/i);
  });

  it("3) despesas presentes + receita ausente -> resultado NÃO calculável (nunca '0 - despesa')", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({})],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBeNull();
    expect(report.resultadoOperacional).toBeNull();
    expect(report.resultadoOperacionalIndisponivelMotivo).toMatch(/receita/i);
  });

  it("4) receita E despesa com lançamento real de valor zero -> resultado calculável e realmente 0 (não é 'sem dado')", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({ categoryName: "Produtos e insumos", originalAmount: 0 }), makeAP({ id: "ap-2", originalAmount: 0 })],
      accountsReceivable: [makeAR({ expectedAmount: 0 })],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(0);
    expect(report.receitaBrutaIndisponivelMotivo).toBeNull();
    expect(report.margemContribuicao).toBe(0);
    expect(report.resultadoOperacional).toBe(0);
    expect(report.resultadoOperacionalIndisponivelMotivo).toBeNull();
  });

  it("5) período atual calculável + período anterior sem dados -> nenhuma variação percentual é mostrada", () => {
    expect(computeDreVariationPercent(1000, null)).toBeNull();
  });

  it("6) valores nulos (nenhum lançamento em nenhuma fonte) -> todo total derivado sai null, nunca 0 fabricado", () => {
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
    expect(report.receitaBruta).toBeNull();
    expect(report.receitaLiquida).toBeNull();
    expect(report.margemContribuicao).toBeNull();
    expect(report.resultadoOperacional).toBeNull();
    expect(report.resultadoAntesTributos).toBeNull();
    expect(report.resultadoLiquido).toBeNull();
    expect(report.margemContribuicaoPercentual).toBeNull();
    expect(report.margemOperacionalPercentual).toBeNull();
    expect(report.margemLiquidaPercentual).toBeNull();
  });

  it("7) fonte sem nenhum lançamento no regime de caixa -> mesmo tratamento (não calculável, nunca 0)", () => {
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({})],
      accountsReceivable: [makeAR({})],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBeNull();
    expect(report.receitaBrutaIndisponivelMotivo).toMatch(/Movimentações de Caixa/);
  });

  it("8) margem percentual sem denominador válido (receita bruta real, mas zero) -> percentual null, não Infinity/NaN", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({ categoryName: "Produtos e insumos", originalAmount: 50 })],
      accountsReceivable: [makeAR({ expectedAmount: 0 })],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(0);
    expect(report.margemContribuicao).toBe(-50); // valor real calculável
    expect(report.margemContribuicaoPercentual).toBeNull(); // mas percentual sobre receita 0 é indefinido, nunca Infinity
  });

  it("9) comparação percentual nunca calculada quando a base anterior é literalmente zero", () => {
    expect(computeDreVariationPercent(500, 0)).toBeNull();
    expect(computeDreVariationPercent(0, 0)).toBeNull();
  });

  it("9b) comparação percentual normal quando os dois lados são calculáveis e a base não é zero", () => {
    expect(computeDreVariationPercent(1200, 1000)).toBe(20);
    expect(computeDreVariationPercent(800, 1000)).toBe(-20);
  });

  it("10) drill-down sempre reconcilia com o total: soma dos itens do grupo === amount do grupo", () => {
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [makeAP({ id: "a1", originalAmount: 500 }), makeAP({ id: "a2", originalAmount: 250, categoryName: "Energia" })],
      accountsReceivable: [makeAR({})],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    const sumOfItems = Math.round(report.despesasOperacionais.items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    expect(sumOfItems).toBe(report.despesasOperacionais.amount);
    expect(report.despesasOperacionais.items).toHaveLength(2);
  });
});

/**
 * Missão Financeiro V3.0 — DRE Gerencial Real. Regime híbrido "gerencial": usa competência quando
 * conhecida (accounts_payable/accounts_receivable, e cash_movements com `competenceDate`
 * preenchido) e cai para a data do movimento de caixa quando não há competência confirmada —
 * nunca inventa uma competência. Caso de teste explícito: Kaua Rezende da Costa Pedro, salário CLT
 * de competência 04/2026 pago em 07/05/2026 (Missão V2.8) — deve aparecer em abril, nunca em maio.
 */
describe("DRE em regime gerencial (híbrido) — Missão V3.0", () => {
  it("usa competenceDate do cash_movement quando preenchido (caso Kaua: competência 04/2026, pago em 05/2026)", () => {
    const kauaSalario = makeCM({
      id: "kaua",
      date: "2026-05-07",
      competenceDate: "2026-04-30",
      type: "saida",
      amount: 2685.02,
      categoryName: "Salários CLT",
      costCenterName: null,
      nature: null,
    });
    const abril = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-04-01",
      competenceTo: "2026-04-30",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [kauaSalario],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(abril.despesasOperacionais.amount).toBe(2685.02);

    const maio = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-05-01",
      competenceTo: "2026-05-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [kauaSalario],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    // Nunca aparece em maio, mesmo sendo a data bancária real — a competência confirmada manda.
    expect(maio.despesasOperacionais.amount).toBe(0);
  });

  it("cai para a data do movimento quando competenceDate não foi informado — nunca inventa competência", () => {
    const semCompetencia = makeCM({ date: "2026-06-15", competenceDate: null, type: "saida", amount: 300, categoryName: "Manutenção" });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-06-01",
      competenceTo: "2026-06-30",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [semCompetencia],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(300);
  });

  it("inclui accounts_payable/accounts_receivable pela competência, igual ao regime de competência puro", () => {
    const ar = makeAR({ expectedAmount: 900 });
    const report = computeDreReport({
      regime: "gerencial",
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
  });

  it("nunca duplica: cash_movement já ligado a uma accounts_receivable/payable não entra de novo pela via caixa", () => {
    const ar = makeAR({ id: "ar-liquidada", expectedAmount: 900 });
    const liquidacao = makeCM({ id: "cm-liquidacao", accountsReceivableId: "ar-liquidada", amount: 900, categoryName: "Lavação", type: "entrada" });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [ar],
      cashMovements: [liquidacao],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBe(900); // uma vez só, não 1800
  });

  it("devolução de empréstimo de parte relacionada (TES Training) — nunca entra na DRE em nenhum regime, impacto zero", () => {
    const devolucao = makeCM({ amount: 450, categoryId: null, categoryName: null, nature: null, type: "saida" });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [devolucao],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.despesasOperacionais.amount).toBe(0);
    expect(report.custosDiretos.amount).toBe(0);
    expect(report.naoClassificados).toHaveLength(1); // sem categoria -> pendente, nunca fora_dre silencioso nem despesa
  });
});

describe("Receita de Clientes/Parcerias Corporativas — segmentação por partners.type (Missão V3.0)", () => {
  it("receita de parceiro com type parceria_pos_paga/contrato_mensal cai em receitaBrutaParceriasCorporativas, não em Estética/Estacionamento/Outras", () => {
    const iesa = makePartner({ id: "iesa", name: "Grupo IESA/Nissan", type: "parceria_pos_paga" });
    const receita = makeCM({ amount: 2680, categoryName: "Lavação", costCenterName: null, partnerId: "iesa", type: "entrada" });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [receita],
      classifications: emptyClassifications,
      rules: emptyRules,
      partners: [iesa],
    });
    expect(report.receitaBrutaParceriasCorporativas.amount).toBe(2680);
    expect(report.receitaBrutaEstetica.amount).toBe(0);
    expect(report.receitaBrutaOutras.amount).toBe(0);
    expect(report.receitaBruta).toBe(2680);
    expect(report.participacaoParceriasReceita).toBe(100);
  });

  it("partner type 'outro' (ex.: WeCharge) não é tratado como parceria corporativa", () => {
    const weCharge = makePartner({ id: "wc", name: "WeCharge", type: "outro" });
    const receita = makeCM({ amount: 500, categoryName: "Lavação", costCenterName: "Estética Automotiva", partnerId: "wc", type: "entrada" });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [receita],
      classifications: emptyClassifications,
      rules: emptyRules,
      partners: [weCharge],
    });
    expect(report.receitaBrutaParceriasCorporativas.amount).toBe(0);
    expect(report.receitaBrutaEstetica.amount).toBe(500);
  });

  it("sem `partners` informado (parâmetro opcional), nenhuma linha cai em parcerias — comportamento retrocompatível", () => {
    const receita = makeCM({ amount: 100, categoryName: "Lavação", costCenterName: "Estética Automotiva", partnerId: "algum-id", type: "entrada" });
    const report = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [receita],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBrutaParceriasCorporativas.amount).toBe(0);
    expect(report.receitaBrutaEstetica.amount).toBe(100);
  });
});

describe("Mão de obra — total, operacional e percentuais (Missão V3.0)", () => {
  it("soma Salários CLT + Prestadores PJ de custosDiretos/despesasOperacionais, calcula % sobre receita líquida e bruta", () => {
    const ar = makeAR({ expectedAmount: 1000 });
    const salario = makeAP({ id: "sal", categoryName: "Salários CLT", originalAmount: 200, costCenterName: "Estética Automotiva" });
    const prestador = makeAP({ id: "pj", categoryName: "Prestadores PJ", originalAmount: 100, costCenterName: "Administrativo" });
    const report = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [salario, prestador],
      accountsReceivable: [ar],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.maoDeObraTotal).toBe(300);
    expect(report.maoDeObraOperacional).toBe(200); // só a de Estética Automotiva, não a Administrativa
    expect(report.maoDeObraPercentualReceitaLiquida).toBe(30);
    expect(report.maoDeObraPercentualReceitaBruta).toBe(30);
  });

  it("despesas/custos presentes mas nenhum é mão de obra -> total real 0, nunca 'indisponível'", () => {
    const ap = makeAP({ categoryName: "Energia", originalAmount: 100 });
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
    expect(report.maoDeObraTotal).toBe(0);
    expect(report.maoDeObraIndisponivelMotivo).toBeNull();
  });

  it("nenhum lançamento de custo/despesa no período -> mão de obra não calculável (null), nunca 0 fabricado", () => {
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
    expect(report.maoDeObraTotal).toBeNull();
    expect(report.maoDeObraOperacional).toBeNull();
    expect(report.maoDeObraIndisponivelMotivo).not.toBeNull();
  });
});

function makeJumpParkOrder(overrides: Partial<JumpParkRevenueCandidateInput>): JumpParkRevenueCandidateInput {
  return {
    externalId: "jp-1",
    orderDate: "2026-07-10",
    parkingAmount: 0,
    servicesAmount: 0,
    clientName: null,
    plateMasked: "ABC1D23",
    ...overrides,
  };
}

/**
 * Missão Financeiro V3.1 — receita real do JumpPark alimentando a DRE, regime gerencial. Caso de
 * teste central da missão: julho/2026 deve refletir o faturamento real de ordens JumpPark, nunca
 * R$0,00 (o gap de cobertura identificado ao final da V3.0).
 */
describe("Receita JumpPark no regime gerencial — Missão V3.1", () => {
  it("ordem com estacionamento e serviços gera duas linhas de receita, corretamente segmentadas", () => {
    const order = makeJumpParkOrder({ parkingAmount: 20, servicesAmount: 80 });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: [order],
    });
    expect(report.receitaBrutaEstacionamento.amount).toBe(20);
    expect(report.receitaBrutaEstetica.amount).toBe(80);
    expect(report.receitaBruta).toBe(100);
  });

  it("julho real: soma de várias ordens JumpPark nunca fica R$0,00 (fecha o gap de cobertura da V3.0)", () => {
    const orders = [
      makeJumpParkOrder({ externalId: "jp-a", orderDate: "2026-07-05", parkingAmount: 30, servicesAmount: 120 }),
      makeJumpParkOrder({ externalId: "jp-b", orderDate: "2026-07-20", parkingAmount: 0, servicesAmount: 200 }),
      makeJumpParkOrder({ externalId: "jp-c", orderDate: "2026-06-15", parkingAmount: 50, servicesAmount: 0 }), // fora da janela de julho
    ];
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: orders,
    });
    expect(report.receitaBruta).toBe(350); // 30+120+200, nunca inclui a ordem de junho
  });

  it("receita JumpPark é sempre determinística — nunca cai em pendente/não classificado", () => {
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: [makeJumpParkOrder({ servicesAmount: 50 })],
    });
    expect(report.naoClassificados).toHaveLength(0);
  });

  it("sem `jumpParkOrders` informado (parâmetro opcional), comportamento retrocompatível — nenhuma receita JumpPark", () => {
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.receitaBruta).toBeNull();
  });

  it("cash_movement (banco) e ordem JumpPark no mesmo período somam — nenhuma exclusão automática ainda existe fora da regra de IESA/desconto já aplicada na origem", () => {
    const bankRevenue = makeCM({ amount: 550, categoryName: "Estacionamento", costCenterName: "Estacionamento", type: "entrada" });
    const jumpParkOrder = makeJumpParkOrder({ parkingAmount: 100 });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [bankRevenue],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: [jumpParkOrder],
    });
    expect(report.receitaBrutaEstacionamento.amount).toBe(650); // 550 (banco) + 100 (JumpPark) — sem correspondência estrutural conhecida entre os dois
  });

  it("regime de competência/caixa puros nunca leem jumpParkOrders — só o regime gerencial usa essa fonte", () => {
    const order = makeJumpParkOrder({ servicesAmount: 999 });
    const competencia = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: [order],
    });
    expect(competencia.receitaBruta).toBeNull();

    const caixa = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      jumpParkOrders: [order],
    });
    expect(caixa.receitaBruta).toBeNull();
  });
});

function makeStoneFeeDay(overrides: Partial<StoneFeeCandidateInput>): StoneFeeCandidateInput {
  return { date: "2026-07-10", mdrAmount: 30, mdrRowsCount: 5, advanceFeeAmount: 0, advanceRowsCount: 0, ...overrides };
}

describe("Custo real Stone na DRE (resultado financeiro) — Missão V6.1", () => {
  it("MDR entra como dedução no resultado financeiro, NUNCA reduz a receita bruta", () => {
    const ar = makeAR({ expectedAmount: 1000, categoryName: "Lavação", costCenterName: "Estética Automotiva", partnerId: null });
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [ar],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [makeStoneFeeDay({ mdrAmount: 36.3, mdrRowsCount: 5 })],
    });
    expect(report.receitaBruta).toBe(1000); // receita continua bruta, intacta
    expect(report.resultadoFinanceiro.amount).toBe(-36.3); // custo Stone aparece como dedução no resultado financeiro
    expect(report.naoClassificados).toHaveLength(0); // determinístico, nunca cai em pendente
  });

  it("antecipação só aparece como linha própria quando advanceRowsCount > 0 — ausência de dado ≠ zero", () => {
    const reportSemAntecipacao = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [makeStoneFeeDay({ mdrAmount: 10, mdrRowsCount: 1, advanceFeeAmount: 0, advanceRowsCount: 0 })],
    });
    expect(reportSemAntecipacao.resultadoFinanceiro.items.some((i) => i.description.includes("Antecipação"))).toBe(false);
    expect(reportSemAntecipacao.resultadoFinanceiro.amount).toBe(-10); // só MDR

    const reportComAntecipacao = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [makeStoneFeeDay({ mdrAmount: 10, mdrRowsCount: 1, advanceFeeAmount: 4, advanceRowsCount: 1 })],
    });
    expect(reportComAntecipacao.resultadoFinanceiro.items.some((i) => i.description.includes("Antecipação"))).toBe(true);
    expect(reportComAntecipacao.resultadoFinanceiro.amount).toBe(-14); // MDR + antecipação
  });

  it("sem `stoneFeeDays` informado (parâmetro opcional), comportamento retrocompatível — nenhum custo Stone lançado", () => {
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
    });
    expect(report.resultadoFinanceiro.amount).toBe(0);
  });

  it("regime de competência/caixa puros nunca leem stoneFeeDays — só o regime gerencial usa essa fonte (mesmo padrão do JumpPark)", () => {
    const day = makeStoneFeeDay({ mdrAmount: 999, mdrRowsCount: 1 });
    const competencia = computeDreReport({
      regime: "competencia",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [day],
    });
    expect(competencia.resultadoFinanceiro.amount).toBe(0);

    const caixa = computeDreReport({
      regime: "caixa",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [day],
    });
    expect(caixa.resultadoFinanceiro.amount).toBe(0);
  });

  it("dia fora do período filtrado nunca entra no total — mesmo filtro de competência de todo o resto da DRE", () => {
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [makeStoneFeeDay({ date: "2026-06-15", mdrAmount: 999, mdrRowsCount: 1 })],
    });
    expect(report.resultadoFinanceiro.amount).toBe(0);
  });

  it("nunca duplica: cada dia gera no máximo 2 candidatos (MDR + antecipação), nunca um por parcela", () => {
    const report = computeDreReport({
      regime: "gerencial",
      competenceFrom: "2026-07-01",
      competenceTo: "2026-07-31",
      costCenterGroup: "consolidado",
      accountsPayable: [],
      accountsReceivable: [],
      cashMovements: [],
      classifications: emptyClassifications,
      rules: emptyRules,
      stoneFeeDays: [makeStoneFeeDay({ mdrAmount: 100, mdrRowsCount: 40, advanceFeeAmount: 20, advanceRowsCount: 40 })],
    });
    expect(report.resultadoFinanceiro.items.filter((i) => i.description.includes("Stone") || i.description.includes("Antecipação"))).toHaveLength(2);
  });
});
