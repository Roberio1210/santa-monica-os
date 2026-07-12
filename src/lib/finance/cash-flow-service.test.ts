import { describe, expect, it } from "vitest";
import { computeCashFlowAlerts, computeCashFlowDashboard, computeCashFlowProjection, computeCashLedger } from "@/lib/finance/service";
import type { AccountsPayableView, AccountsReceivableView, AccountTransfer, CashMovement, FinancialAccountBalance } from "@/lib/finance/types";

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
});
