import { describe, expect, it } from "vitest";
import { computeCashFlowAlerts, computeCashFlowDashboard, computeCashFlowProjection, computeCashLedger, computePayableAging, computeReceivableAging } from "@/lib/finance/service";
import type { AccountsPayableView, AccountsReceivableView, AccountTransfer, CashMovement, ClassificationRule, FinancialAccountBalance, FinancialClassification } from "@/lib/finance/types";

const ASOF = "2026-07-15";

function makeMovement(overrides: Partial<CashMovement>): CashMovement {
  return {
    id: "mov-1",
    date: ASOF,
    type: "entrada",
    nature: null,
    amount: 100,
    description: "Movimento teste",
    accountsReceivableId: null,
    accountsPayableId: null,
    categoryId: null,
    categoryName: null,
    costCenterId: null,
    costCenterName: null,
    financialAccountId: "conta-caixa-fisico",
    financialAccountName: "Caixa físico",
    paymentId: null,
    partnerId: null,
    customerId: null,
    supplierId: null,
    partyName: null,
    responsibleName: null,
    documentRef: null,
    competenceDate: null,
    balanceBefore: 100,
    balanceAfter: 200,
    source: "manual",
    externalId: null,
    notes: null,
    ...overrides,
  };
}

function makeTransfer(overrides: Partial<AccountTransfer>): AccountTransfer {
  return {
    id: "transf-1",
    type: "transferencia",
    fromAccountId: "conta-caixa-fisico",
    fromAccountName: "Caixa físico",
    toAccountId: "conta-stone",
    toAccountName: "Stone",
    amount: 50,
    date: ASOF,
    description: "Transferência teste",
    responsibleName: null,
    documentRef: null,
    notes: null,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<FinancialAccountBalance>): FinancialAccountBalance {
  return {
    id: "conta-caixa-fisico",
    name: "Caixa físico",
    type: "dinheiro",
    fixedFundAmount: 100,
    informedBalance: null,
    informedBalanceAt: null,
    notes: null,
    currentBalance: 100,
    belowThreshold: false,
    balanceSource: "cash_movements",
    coverage: null,
    ...overrides,
  };
}

describe("computeCashLedger", () => {
  it("une movimentos e transferências numa lista ordenada por data", () => {
    const movements = [makeMovement({ id: "m1", date: "2026-07-16" }), makeMovement({ id: "m2", date: "2026-07-10" })];
    const transfers = [makeTransfer({ id: "t1", date: "2026-07-12" })];

    const ledger = computeCashLedger(movements, transfers);

    expect(ledger.map((e) => e.id)).toEqual(["m2", "t1", "m1"]);
  });

  it("saída vira valor negativo no ledger, entrada permanece positiva", () => {
    const movements = [makeMovement({ id: "entrada", type: "entrada", amount: 100 }), makeMovement({ id: "saida", type: "saida", amount: 40 })];
    const ledger = computeCashLedger(movements, []);

    expect(ledger.find((e) => e.id === "entrada")?.amount).toBe(100);
    expect(ledger.find((e) => e.id === "saida")?.amount).toBe(-40);
  });

  it("transferência aparece com conta origem e destino no mesmo registro", () => {
    const ledger = computeCashLedger([], [makeTransfer({})]);
    expect(ledger[0].financialAccountName).toBe("Caixa físico");
    expect(ledger[0].toAccountName).toBe("Stone");
    expect(ledger[0].kind).toBe("transferencia");
  });
});

describe("computeCashFlowDashboard", () => {
  const accounts = [makeAccount({ id: "conta-caixa-fisico", currentBalance: 300 }), makeAccount({ id: "conta-stone", name: "Stone", fixedFundAmount: null, currentBalance: 200 })];

  it("soma o saldo geral a partir de todas as contas", () => {
    const dashboard = computeCashFlowDashboard(accounts, [], [], [], ASOF);
    expect(dashboard.saldoGeral).toBe(500);
  });

  it("calcula entradas/saídas de hoje e o resultado do dia", () => {
    const movements = [
      makeMovement({ id: "e1", date: ASOF, type: "entrada", amount: 100 }),
      makeMovement({ id: "s1", date: ASOF, type: "saida", amount: 30 }),
      makeMovement({ id: "fora", date: "2026-06-01", type: "entrada", amount: 999 }),
    ];
    const dashboard = computeCashFlowDashboard(accounts, movements, [], [], ASOF);

    expect(dashboard.entradasHoje).toBe(100);
    expect(dashboard.saidasHoje).toBe(30);
    expect(dashboard.resultadoDia).toBe(70);
  });

  it("maiores despesas e receitas vêm ordenadas por valor decrescente", () => {
    const movements = [
      makeMovement({ id: "s1", type: "saida", amount: 50, description: "Pequena" }),
      makeMovement({ id: "s2", type: "saida", amount: 200, description: "Grande" }),
      makeMovement({ id: "e1", type: "entrada", amount: 80, description: "Receita pequena" }),
    ];
    const dashboard = computeCashFlowDashboard(accounts, movements, [], [], ASOF);

    expect(dashboard.maioresDespesas[0].description).toBe("Grande");
    expect(dashboard.maioresReceitas[0].description).toBe("Receita pequena");
  });

  it("receitas/despesas previstas vêm do saldo em aberto de Contas a Receber/Pagar, não de movimentos", () => {
    const arItems = [{ outstandingAmount: 500, computedStatus: "open" } as AccountsReceivableView];
    const apItems = [{ outstandingAmount: 300, computedStatus: "pendente" } as AccountsPayableView];
    const dashboard = computeCashFlowDashboard(accounts, [], arItems, apItems, ASOF);

    expect(dashboard.receitasPrevistas).toBe(500);
    expect(dashboard.despesasPrevistas).toBe(300);
  });
});

describe("computeCashFlowProjection", () => {
  it("acumula contas a receber/pagar até cada janela e projeta o saldo", () => {
    const arItems = [
      { outstandingAmount: 100, dueDate: "2026-07-15", computedStatus: "open" } as AccountsReceivableView,
      { outstandingAmount: 200, dueDate: "2026-07-25", computedStatus: "open" } as AccountsReceivableView,
    ];
    const apItems = [{ outstandingAmount: 50, dueDate: "2026-07-16", computedStatus: "pendente" } as AccountsPayableView];

    const projection = computeCashFlowProjection(1000, arItems, apItems, ASOF);

    const hoje = projection.find((p) => p.window === "hoje")!;
    expect(hoje.contasAReceber).toBe(100); // só a que vence hoje
    expect(hoje.contasAPagar).toBe(0);
    expect(hoje.saldoProjetado).toBe(1100);

    const trintaDias = projection.find((p) => p.window === "30_dias")!;
    expect(trintaDias.contasAReceber).toBe(300); // as duas
    expect(trintaDias.contasAPagar).toBe(50);
    expect(trintaDias.saldoProjetado).toBe(1250);
  });

  it("nunca inclui contas canceladas na projeção", () => {
    const arItems = [{ outstandingAmount: 999, dueDate: ASOF, computedStatus: "cancelled" } as AccountsReceivableView];
    const projection = computeCashFlowProjection(1000, arItems, [], ASOF);
    expect(projection.find((p) => p.window === "hoje")!.contasAReceber).toBe(0);
  });
});

describe("computeCashFlowAlerts", () => {
  it("gera alerta de saldo negativo", () => {
    const accounts = [makeAccount({ currentBalance: -50 })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    expect(alerts.some((a) => a.level === "saldo_negativo")).toBe(true);
  });

  it("gera alerta de conta zerando quando abaixo do fundo fixo mas ainda positiva", () => {
    const accounts = [makeAccount({ currentBalance: 50, fixedFundAmount: 100, belowThreshold: true })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    expect(alerts.some((a) => a.level === "conta_zerando")).toBe(true);
    expect(alerts.some((a) => a.level === "saldo_negativo")).toBe(false);
  });

  it("gera alerta de diferença entre saldo calculado e informado", () => {
    const accounts = [makeAccount({ currentBalance: 100, informedBalance: 80 })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    const alert = alerts.find((a) => a.level === "diferenca_saldo_informado");
    expect(alert).toBeDefined();
    expect(alert!.amount).toBe(-20);
  });

  it("não gera alerta de diferença quando o saldo informado é igual ao calculado", () => {
    const accounts = [makeAccount({ currentBalance: 100, informedBalance: 100 })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    expect(alerts.some((a) => a.level === "diferenca_saldo_informado")).toBe(false);
  });

  it("gera alerta de conta sem movimentação quando nunca houve nenhum lançamento", () => {
    const accounts = [makeAccount({ id: "conta-nova", currentBalance: 0, fixedFundAmount: null, belowThreshold: false })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    expect(alerts.some((a) => a.level === "conta_sem_movimentacao")).toBe(true);
  });

  it("não gera conta_sem_movimentacao quando há movimento recente", () => {
    const accounts = [makeAccount({ id: "conta-caixa-fisico", currentBalance: 100, belowThreshold: false })];
    const movements = [makeMovement({ financialAccountId: "conta-caixa-fisico", date: ASOF })];
    const alerts = computeCashFlowAlerts(accounts, movements, [], [], ASOF);
    expect(alerts.some((a) => a.level === "conta_sem_movimentacao")).toBe(false);
  });

  it("gera alerta de fluxo negativo futuro quando alguma janela de projeção fica negativa", () => {
    const accounts = [makeAccount({ currentBalance: 100 })];
    const movements = [makeMovement({ financialAccountId: "conta-caixa-fisico", date: ASOF })];
    const projection = [
      { window: "hoje" as const, contasAReceber: 0, contasAPagar: 0, saldoProjetado: 100 },
      { window: "30_dias" as const, contasAReceber: 0, contasAPagar: 500, saldoProjetado: -400 },
    ];
    const alerts = computeCashFlowAlerts(accounts, movements, [], projection, ASOF);
    expect(alerts.some((a) => a.level === "fluxo_negativo_futuro")).toBe(true);
  });

  it("Missão V4.1 — conta com saldo via extrato bancário usa coverage.importPeriodTo como última movimentação, não cash_movements", () => {
    const accountWithFreshStatement = makeAccount({
      id: "conta-stone",
      name: "Stone",
      fixedFundAmount: null,
      currentBalance: -800,
      balanceSource: "extrato_bancario",
      coverage: { totalCount: 100, classifiedCount: 30, classifiedPercent: 30, unclassifiedCount: 70, unclassifiedAmount: 500, importPeriodFrom: "2026-01-01", importPeriodTo: ASOF },
    });
    // Nenhum cash_movement recente para esta conta — antes da correção isso gerava um falso "conta_sem_movimentacao".
    const alerts = computeCashFlowAlerts([accountWithFreshStatement], [], [], [], ASOF);
    expect(alerts.some((a) => a.level === "conta_sem_movimentacao")).toBe(false);
  });

  it("Missão V4.1 — conta via extrato bancário com importPeriodTo antigo ainda gera conta_sem_movimentacao", () => {
    const staleAccount = makeAccount({
      id: "conta-stone",
      name: "Stone",
      fixedFundAmount: null,
      currentBalance: -800,
      balanceSource: "extrato_bancario",
      coverage: { totalCount: 100, classifiedCount: 30, classifiedPercent: 30, unclassifiedCount: 70, unclassifiedAmount: 500, importPeriodFrom: "2026-01-01", importPeriodTo: "2026-05-01" },
    });
    const alerts = computeCashFlowAlerts([staleAccount], [], [], [], ASOF);
    const alert = alerts.find((a) => a.level === "conta_sem_movimentacao");
    expect(alert).toBeDefined();
    expect(alert!.message).toContain("extrato");
  });

  it("sem `extra`, nenhum dos 6 alertas novos da Fase 7 é gerado (compatibilidade retroativa)", () => {
    const accounts = [makeAccount({ currentBalance: 100 })];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF);
    const newLevels = ["concentracao_pagamentos", "saida_excepcional", "queda_entradas", "conta_a_pagar_vencida", "conta_a_receber_vencida", "movimentacao_sem_classificacao"];
    expect(alerts.some((a) => newLevels.includes(a.level))).toBe(false);
  });

  it("com `extra`, gera conta_a_receber_vencida e conta_a_pagar_vencida a partir dos itens vencidos", () => {
    const accounts = [makeAccount({ currentBalance: 100000 })];
    const arItems = [{ outstandingAmount: 300, dueDate: "2026-07-01", computedStatus: "overdue" } as AccountsReceivableView];
    const apItems = [{ outstandingAmount: 150, dueDate: "2026-07-01", computedStatus: "vencida" } as AccountsPayableView];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF, { arItems, apItems, saldoGeral: 100000, periodFrom: ASOF, periodTo: ASOF });

    const arAlert = alerts.find((a) => a.level === "conta_a_receber_vencida");
    expect(arAlert?.amount).toBe(300);
    const apAlert = alerts.find((a) => a.level === "conta_a_pagar_vencida");
    expect(apAlert?.amount).toBe(150);
  });

  it("gera concentracao_pagamentos quando contas a pagar nos próximos 7 dias superam o saldo geral", () => {
    const accounts = [makeAccount({ currentBalance: 1000 })];
    const apItems = [{ outstandingAmount: 5000, dueDate: "2026-07-18", computedStatus: "pendente" } as AccountsPayableView];
    const alerts = computeCashFlowAlerts(accounts, [], [], [], ASOF, { arItems: [], apItems, saldoGeral: 1000, periodFrom: ASOF, periodTo: ASOF });
    expect(alerts.some((a) => a.level === "concentracao_pagamentos")).toBe(true);
  });

  it("gera movimentacao_sem_classificacao quando a conta tem linhas de extrato não classificadas", () => {
    const account = makeAccount({
      id: "conta-stone",
      balanceSource: "extrato_bancario",
      coverage: { totalCount: 100, classifiedCount: 30, classifiedPercent: 30, unclassifiedCount: 70, unclassifiedAmount: 4200, importPeriodFrom: "2026-01-01", importPeriodTo: ASOF },
    });
    const alerts = computeCashFlowAlerts([account], [], [], [], ASOF, { arItems: [], apItems: [], saldoGeral: 0, periodFrom: ASOF, periodTo: ASOF });
    const alert = alerts.find((a) => a.level === "movimentacao_sem_classificacao");
    expect(alert?.amount).toBe(4200);
  });

  it("gera saida_excepcional quando a saída de hoje é muito maior que a média histórica", () => {
    const accounts = [makeAccount({ currentBalance: 1000 })];
    const historicalDays = ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14"];
    const movements = [
      ...historicalDays.map((date, i) => makeMovement({ id: `hist-${i}`, date, type: "saida", amount: 10 })),
      makeMovement({ id: "hoje", date: ASOF, type: "saida", amount: 500 }),
    ];
    const alerts = computeCashFlowAlerts(accounts, movements, [], [], ASOF, { arItems: [], apItems: [], saldoGeral: 1000, periodFrom: ASOF, periodTo: ASOF });
    expect(alerts.some((a) => a.level === "saida_excepcional")).toBe(true);
  });

  it("gera queda_entradas quando as entradas do período caem >= 30% frente ao período equivalente anterior", () => {
    const accounts = [makeAccount({ currentBalance: 1000 })];
    const movements = [
      makeMovement({ id: "atual", date: "2026-07-15", type: "entrada", amount: 100 }),
      makeMovement({ id: "anterior", date: "2026-07-08", type: "entrada", amount: 1000 }),
    ];
    const alerts = computeCashFlowAlerts(accounts, movements, [], [], ASOF, {
      arItems: [],
      apItems: [],
      saldoGeral: 1000,
      periodFrom: "2026-07-09",
      periodTo: "2026-07-15",
    });
    const alert = alerts.find((a) => a.level === "queda_entradas");
    expect(alert).toBeDefined();
  });
});

describe("computeReceivableAging / computePayableAging — Missão V4.1, Fase 6", () => {
  it("classifica vencida/hoje/7/15/30/futuro corretamente", () => {
    const items = [
      { outstandingAmount: 100, dueDate: "2026-07-01", computedStatus: "overdue" },
      { outstandingAmount: 200, dueDate: ASOF, computedStatus: "open" },
      { outstandingAmount: 300, dueDate: "2026-07-20", computedStatus: "open" },
      { outstandingAmount: 400, dueDate: "2026-07-28", computedStatus: "open" },
      { outstandingAmount: 500, dueDate: "2026-08-10", computedStatus: "open" },
      { outstandingAmount: 600, dueDate: "2026-12-01", computedStatus: "open" },
    ] as AccountsReceivableView[];

    const buckets = computeReceivableAging(items, ASOF);
    const byBucket = Object.fromEntries(buckets.map((b) => [b.bucket, b]));

    expect(byBucket.vencida).toEqual({ bucket: "vencida", count: 1, amount: 100 });
    expect(byBucket.hoje).toEqual({ bucket: "hoje", count: 1, amount: 200 });
    expect(byBucket["7_dias"]).toEqual({ bucket: "7_dias", count: 1, amount: 300 });
    expect(byBucket["15_dias"]).toEqual({ bucket: "15_dias", count: 1, amount: 400 });
    expect(byBucket["30_dias"]).toEqual({ bucket: "30_dias", count: 1, amount: 500 });
    expect(byBucket.futuro).toEqual({ bucket: "futuro", count: 1, amount: 600 });
  });

  it("nunca inclui itens cancelados/rascunho ou com outstanding zerado", () => {
    const arItems = [
      { outstandingAmount: 999, dueDate: ASOF, computedStatus: "cancelled" },
      { outstandingAmount: 0, dueDate: ASOF, computedStatus: "open" },
    ] as AccountsReceivableView[];
    expect(computeReceivableAging(arItems, ASOF).every((b) => b.count === 0)).toBe(true);

    const apItems = [
      { outstandingAmount: 999, dueDate: ASOF, computedStatus: "cancelada" },
      { outstandingAmount: 999, dueDate: ASOF, computedStatus: "rascunho" },
    ] as AccountsPayableView[];
    expect(computePayableAging(apItems, ASOF).every((b) => b.count === 0)).toBe(true);
  });
});

describe("computeCashFlowDashboard — período (Missão V4.1, Fase 2/3)", () => {
  const accounts = [makeAccount({ id: "conta-caixa-fisico", currentBalance: 300 })];

  it("sem periodFrom/periodTo explícitos, cai em asOfDate — igual a entradasHoje/saidasHoje", () => {
    const movements = [makeMovement({ id: "e1", date: ASOF, type: "entrada", amount: 100 }), makeMovement({ id: "s1", date: ASOF, type: "saida", amount: 30 })];
    const dashboard = computeCashFlowDashboard(accounts, movements, [], [], ASOF);
    expect(dashboard.periodFrom).toBe(ASOF);
    expect(dashboard.periodTo).toBe(ASOF);
    expect(dashboard.entradasPeriodo).toBe(dashboard.entradasHoje);
    expect(dashboard.saidasPeriodo).toBe(dashboard.saidasHoje);
    expect(dashboard.variacaoLiquidaPeriodo).toBe(dashboard.resultadoDia);
  });

  it("com período explícito, soma entradas/saídas de toda a janela, não só de asOfDate", () => {
    const movements = [
      makeMovement({ id: "e1", date: "2026-07-01", type: "entrada", amount: 500 }),
      makeMovement({ id: "e2", date: ASOF, type: "entrada", amount: 100 }),
      makeMovement({ id: "fora", date: "2026-06-01", type: "entrada", amount: 999 }),
      makeMovement({ id: "s1", date: "2026-07-05", type: "saida", amount: 200 }),
    ];
    const dashboard = computeCashFlowDashboard(accounts, movements, [], [], ASOF, "2026-07-01", ASOF);
    expect(dashboard.entradasPeriodo).toBe(600);
    expect(dashboard.saidasPeriodo).toBe(200);
    expect(dashboard.variacaoLiquidaPeriodo).toBe(400);
  });
});

describe("computeCashLedger — classificação (Missão V4.1, Fase 5)", () => {
  const noRules: ClassificationRule[] = [];
  const noClassifications: FinancialClassification[] = [];

  it("sem classifications/rules, nature/isOperational/classificationStatus ficam null (compatibilidade retroativa)", () => {
    const ledger = computeCashLedger([makeMovement({ nature: "receita" })], []);
    expect(ledger[0].nature).toBeNull();
    expect(ledger[0].isOperational).toBeNull();
    expect(ledger[0].classificationStatus).toBeNull();
  });

  it("movimento com nature 'receita' resolve para receita_operacional, operacional, classificado", () => {
    const ledger = computeCashLedger([makeMovement({ nature: "receita" })], [], noClassifications, noRules);
    expect(ledger[0].nature).toBe("receita_operacional");
    expect(ledger[0].isOperational).toBe(true);
    expect(ledger[0].classificationStatus).toBe("classificado");
  });

  it("movimento sem nature e sem categoria fica pendente e não operacional", () => {
    const ledger = computeCashLedger([makeMovement({ nature: null, categoryName: null, supplierId: null, partnerId: null })], [], noClassifications, noRules);
    expect(ledger[0].nature).toBe("nao_classificavel");
    expect(ledger[0].isOperational).toBe(false);
    expect(ledger[0].classificationStatus).toBe("pendente");
  });

  it("transferência resolve deterministicamente pelo type (aporte_socios -> aporte, não operacional, classificado)", () => {
    const ledger = computeCashLedger([], [makeTransfer({ type: "aporte_socios" })], noClassifications, noRules);
    expect(ledger[0].nature).toBe("aporte");
    expect(ledger[0].isOperational).toBe(false);
    expect(ledger[0].classificationStatus).toBe("classificado");
  });
});
