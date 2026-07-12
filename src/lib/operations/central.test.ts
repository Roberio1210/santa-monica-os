import { describe, expect, it } from "vitest";
import { computeConsolidatedAlerts, computeSituation, findFirstNegativeProjection, sumOutstandingDueOn, sumOutstandingDueWithin, type CentralOverview } from "@/lib/operations/central";
import type { AccountsPayableView, AccountsReceivableView, CashFlowProjectionPoint } from "@/lib/finance/types";

function baseOverview(overrides: Partial<CentralOverview> = {}): CentralOverview {
  return {
    asOfDate: "2026-07-15",
    checkedAt: "2026-07-15T10:00:00.000Z",
    jumpparkConfigured: true,
    jumppark: { data: { dailyRevenue: 500, vehicles: 4, orders: [] }, error: null },
    cashFlow: {
      data: {
        dashboard: {
          saldoGeral: 1000,
          saldoPorConta: [],
          entradasHoje: 500,
          saidasHoje: 100,
          resultadoDia: 400,
          resultadoSemana: 800,
          resultadoMes: 3000,
          receitasPrevistas: 200,
          despesasPrevistas: 200,
          maioresDespesas: [],
          maioresReceitas: [],
          entradasPorCentroCusto: [],
          saidasPorCentroCusto: [],
        },
        projection: [],
        alerts: [],
        ledger: [],
        accounts: [],
      },
      error: null,
    },
    accountsPayable: { data: { items: [], summary: { totalPending: 0, totalOverdue: 0, totalPaidThisMonth: 0, upcoming7Count: 0, upcoming30Count: 0, count: 0 }, alerts: [] }, error: null },
    accountsReceivable: { data: { items: [], summary: { totalOpen: 0, totalReceivedThisMonth: 0, totalOverdue: 0, upcomingCount: 0, count: 0 }, alerts: [] }, error: null },
    classificationPendingCount: { data: 0, error: null },
    inventory: { data: { totalItems: 10, lowStockCount: 0, nearEmptyCount: 0, itemsWithoutMinimum: 0, sealedCount: 0, totalStockValue: 0 }, error: null },
    ...overrides,
  };
}

function makeAP(overrides: Partial<AccountsPayableView>): AccountsPayableView {
  return {
    id: "ap-1",
    description: "Aluguel",
    supplierId: null,
    supplierName: null,
    categoryId: "c1",
    categoryName: "Aluguel",
    costCenterId: null,
    costCenterName: null,
    financialAccountId: null,
    financialAccountName: null,
    competenceDate: "2026-07-01",
    issueDate: null,
    dueDate: "2026-07-15",
    originalAmount: 100,
    paidAmount: 0,
    outstandingAmount: 100,
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
    computedStatus: "pendente",
    isOverdue: false,
    ...overrides,
  };
}

function makeAR(overrides: Partial<AccountsReceivableView>): AccountsReceivableView {
  return {
    id: "ar-1",
    customerId: null,
    partnerId: null,
    contractId: null,
    partyName: "Cliente",
    costCenterId: null,
    costCenterName: null,
    categoryId: null,
    categoryName: null,
    financialAccountId: null,
    financialAccountName: null,
    description: "Serviço",
    competenceDate: "2026-07-01",
    issueDate: null,
    dueDate: "2026-07-15",
    expectedAmount: 200,
    receivedAmount: 0,
    outstandingAmount: 200,
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
    computedStatus: "open",
    isOverdue: false,
    ...overrides,
  };
}

describe("sumOutstandingDueOn / sumOutstandingDueWithin", () => {
  it("soma só os itens vencendo exatamente na data informada", () => {
    const items = [makeAP({ dueDate: "2026-07-15", outstandingAmount: 100 }), makeAP({ id: "ap-2", dueDate: "2026-07-16", outstandingAmount: 200 })];
    expect(sumOutstandingDueOn(items, "2026-07-15")).toBe(100);
  });

  it("soma os itens vencendo dentro de um intervalo (inclusive)", () => {
    const items = [makeAP({ dueDate: "2026-07-15", outstandingAmount: 100 }), makeAP({ id: "ap-2", dueDate: "2026-07-20", outstandingAmount: 200 }), makeAP({ id: "ap-3", dueDate: "2026-07-25", outstandingAmount: 300 })];
    expect(sumOutstandingDueWithin(items, "2026-07-15", "2026-07-20")).toBe(300);
  });
});

describe("findFirstNegativeProjection", () => {
  it("retorna a primeira janela negativa com a data aproximada", () => {
    const projection: CashFlowProjectionPoint[] = [
      { window: "hoje", contasAReceber: 0, contasAPagar: 0, saldoProjetado: 100 },
      { window: "7_dias", contasAReceber: 0, contasAPagar: 500, saldoProjetado: -50 },
    ];
    const result = findFirstNegativeProjection(projection, "2026-07-15");
    expect(result?.point.window).toBe("7_dias");
    expect(result?.date).toBe("2026-07-22");
  });

  it("retorna null quando nenhuma janela é negativa", () => {
    const projection: CashFlowProjectionPoint[] = [{ window: "hoje", contasAReceber: 0, contasAPagar: 0, saldoProjetado: 100 }];
    expect(findFirstNegativeProjection(projection, "2026-07-15")).toBeNull();
  });
});

describe("computeSituation", () => {
  it("retorna normal quando não há nenhuma condição real de risco", () => {
    expect(computeSituation(baseOverview())).toBe("normal");
  });

  it("retorna crítica quando há conta a pagar vencida", () => {
    const overview = baseOverview({
      accountsPayable: { data: { items: [], summary: { totalPending: 0, totalOverdue: 500, totalPaidThisMonth: 0, upcoming7Count: 0, upcoming30Count: 0, count: 0 }, alerts: [] }, error: null },
    });
    expect(computeSituation(overview)).toBe("critica");
  });

  it("retorna crítica quando há falha real de conexão com o JumpPark configurado", () => {
    const overview = baseOverview({ jumppark: { data: null, error: "Falha de rede" } });
    expect(computeSituation(overview)).toBe("critica");
  });

  it("retorna atenção quando há lançamento sem classificação, sem nenhuma condição crítica", () => {
    const overview = baseOverview({ classificationPendingCount: { data: 3, error: null } });
    expect(computeSituation(overview)).toBe("atencao");
  });

  it("nunca inventa uma condição de risco quando os dados não indicam nada", () => {
    const overview = baseOverview({ jumppark: { data: null, error: null }, jumpparkConfigured: false });
    expect(computeSituation(overview)).toBe("normal");
  });
});

describe("computeConsolidatedAlerts", () => {
  it("ordena alertas críticos antes dos de atenção e informativos", () => {
    const overview = baseOverview({
      accountsPayable: {
        data: { items: [], summary: { totalPending: 0, totalOverdue: 0, totalPaidThisMonth: 0, upcoming7Count: 0, upcoming30Count: 0, count: 0 }, alerts: [{ accountsPayableId: "ap-1", description: "x", dueDate: "2026-07-10", outstandingAmount: 100, level: "vencida" }] },
        error: null,
      },
      classificationPendingCount: { data: 2, error: null },
    });
    const alerts = computeConsolidatedAlerts(overview);
    expect(alerts[0].severity).toBe("critico");
    expect(alerts.some((a) => a.severity === "informativo")).toBe(true);
    const severities = alerts.map((a) => a.severity);
    const firstAtencaoIndex = severities.indexOf("atencao");
    const firstInformativoIndex = severities.indexOf("informativo");
    if (firstAtencaoIndex >= 0 && firstInformativoIndex >= 0) expect(firstAtencaoIndex).toBeLessThan(firstInformativoIndex);
  });

  it("cada alerta aponta para o módulo e a rota corretos", () => {
    const overview = baseOverview({
      accountsReceivable: {
        data: { items: [], summary: { totalOpen: 0, totalReceivedThisMonth: 0, totalOverdue: 0, upcomingCount: 0, count: 0 }, alerts: [{ accountsReceivableId: "ar-1", partyName: "Cliente X", description: "y", dueDate: "2026-07-10", outstandingAmount: 50, level: "vencida" }] },
        error: null,
      },
    });
    const alerts = computeConsolidatedAlerts(overview);
    const receivableAlert = alerts.find((a) => a.module === "Contas a Receber");
    expect(receivableAlert?.href).toBe("/financeiro/contas-a-receber");
  });

  it("nunca gera alerta quando não há nenhuma condição real", () => {
    expect(computeConsolidatedAlerts(baseOverview())).toHaveLength(0);
  });

  it("propaga falha de uma fonte como alerta de atenção, sem derrubar as demais", () => {
    const overview = baseOverview({ cashFlow: { data: null, error: "Falha ao consultar o Fluxo de Caixa" } });
    const alerts = computeConsolidatedAlerts(overview);
    expect(alerts.some((a) => a.title.includes("Fluxo de Caixa"))).toBe(true);
  });
});

describe("makeAR/makeAP fixtures", () => {
  it("garantem que os testes acima usam tipos reais do domínio financeiro", () => {
    expect(makeAP({}).status).toBe("pendente");
    expect(makeAR({}).status).toBe("open");
  });
});
