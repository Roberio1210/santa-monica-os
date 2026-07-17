import { describe, expect, it } from "vitest";
import {
  buildMovementTimeline,
  computeConsolidatedAlerts,
  computeSituation,
  computeYesterdayResult,
  findFirstNegativeProjection,
  sumOutstandingDueOn,
  sumOutstandingDueWithin,
  type CentralOverview,
  type ConsolidatedAlert,
} from "@/lib/operations/central";
import type { AccountsPayableView, AccountsReceivableView, CashFlowProjectionPoint } from "@/lib/finance/types";
import type { OperationOrder } from "@/lib/integrations/jumppark";

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
    negativeStockCount: { data: 0, error: null },
    inventoryQuality: {
      data: { measurementPending: [], withoutCost: [], withoutMinimum: [], withoutBrand: [], servicesWithoutRecipe: [], recipesWithoutSamples: [], recipesWithFewSamples: [], pendingMappings: [] },
      error: null,
    },
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

describe("computeSituation — reflete a maior severidade dos alertas, nunca a quantidade", () => {
  it("retorna normal quando não há nenhum alerta", () => {
    expect(computeSituation([])).toBe("normal");
  });

  it("retorna crítica quando existe ao menos um alerta crítico, mesmo entre vários informativos", () => {
    const alerts: ConsolidatedAlert[] = [
      { severity: "informativo", title: "a", description: "a", date: null, module: "x", href: "/" },
      { severity: "informativo", title: "b", description: "b", date: null, module: "x", href: "/" },
      { severity: "critico", title: "c", description: "c", date: null, module: "x", href: "/" },
    ];
    expect(computeSituation(alerts)).toBe("critica");
  });

  it("retorna atenção quando o pior alerta é atenção (nenhum crítico)", () => {
    const alerts: ConsolidatedAlert[] = [
      { severity: "informativo", title: "a", description: "a", date: null, module: "x", href: "/" },
      { severity: "atencao", title: "b", description: "b", date: null, module: "x", href: "/" },
    ];
    expect(computeSituation(alerts)).toBe("atencao");
  });

  it("uma quantidade grande de alertas informativos nunca eleva a situação — só a severidade importa", () => {
    const alerts: ConsolidatedAlert[] = Array.from({ length: 20 }, (_, i) => ({
      severity: "informativo" as const,
      title: `alerta ${i}`,
      description: "x",
      date: null,
      module: "x",
      href: "/",
    }));
    expect(computeSituation(alerts)).toBe("normal");
  });

  it("computeConsolidatedAlerts + computeSituation juntos: conta a pagar vencida eleva a situação a crítica", () => {
    const overview = baseOverview({
      accountsPayable: {
        data: {
          items: [],
          summary: { totalPending: 0, totalOverdue: 500, totalPaidThisMonth: 0, upcoming7Count: 0, upcoming30Count: 0, count: 0 },
          alerts: [{ accountsPayableId: "ap-1", description: "x", dueDate: "2026-07-10", outstandingAmount: 500, level: "vencida" }],
        },
        error: null,
      },
    });
    expect(computeSituation(computeConsolidatedAlerts(overview))).toBe("critica");
  });

  it("falha ao carregar uma seção inteira (Fluxo de Caixa) é tratada como crítica — sem esses dados não dá para avaliar a situação", () => {
    const overview = baseOverview({ cashFlow: { data: null, error: "Falha de conexão" } });
    expect(computeSituation(computeConsolidatedAlerts(overview))).toBe("critica");
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

describe("computeYesterdayResult", () => {
  it("soma entradas e saídas do Livro Caixa só da data anterior, ignorando transferências", () => {
    const ledger = [
      { kind: "movimento", date: "2026-07-14", amount: 300 },
      { kind: "movimento", date: "2026-07-14", amount: -100 },
      { kind: "transferencia", date: "2026-07-14", amount: 500 },
      { kind: "movimento", date: "2026-07-15", amount: 999 },
    ];
    expect(computeYesterdayResult(ledger, "2026-07-15")).toBe(200);
  });

  it("retorna 0 quando não há movimento no dia anterior — nunca inventa um valor", () => {
    expect(computeYesterdayResult([], "2026-07-15")).toBe(0);
  });
});

function makeOrder(overrides: Partial<OperationOrder>): OperationOrder {
  return {
    id: "order-1",
    code: "OS-1",
    entryTime: "08:02",
    exitTime: null,
    plateMasked: "AB***12",
    vehicleModel: "Gol",
    clientName: "Cliente Teste",
    clientPhoneMasked: "*******99",
    services: [],
    hasServices: false,
    parkingAmount: 20,
    servicesAmount: 0,
    totalAmount: 20,
    paymentMethod: "Pix",
    paymentMethodCategory: "pix",
    situation: "Finalizado",
    ...overrides,
  };
}

describe("buildMovementTimeline", () => {
  it("inclui entrada e saída com horário real, ordenadas cronologicamente", () => {
    const orders = [
      makeOrder({ id: "o1", entryTime: "09:10", exitTime: "10:00", totalAmount: 50, hasServices: true, services: [{ description: "Lavagem Gold", amount: 50 }] }),
      makeOrder({ id: "o2", entryTime: "08:02", exitTime: null }),
    ];
    const timeline = buildMovementTimeline(orders);
    expect(timeline.map((e) => e.time)).toEqual(["08:02", "09:10", "10:00"]);
    expect(timeline[0].label).toBe("Entrada");
  });

  it("nunca inventa horário — pedido sem entryTime/exitTime fica fora da linha do tempo", () => {
    const orders = [makeOrder({ entryTime: null, exitTime: null })];
    expect(buildMovementTimeline(orders)).toHaveLength(0);
  });

  it("evento de saída com serviços vira 'Pagamento recebido' com o valor real", () => {
    const orders = [makeOrder({ exitTime: "10:00", hasServices: true, totalAmount: 75, services: [{ description: "Enceramento", amount: 75 }] })];
    const timeline = buildMovementTimeline(orders);
    const exitEntry = timeline.find((e) => e.time === "10:00")!;
    expect(exitEntry.label).toBe("Pagamento recebido");
    expect(exitEntry.amount).toBe(75);
  });
});
