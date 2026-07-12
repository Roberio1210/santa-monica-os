import { describe, expect, it } from "vitest";
import { computeAccountsReceivableDashboard, computeReceivableAlerts } from "@/lib/finance/service";
import type { AccountsReceivableView } from "@/lib/finance/types";

const ASOF = "2026-07-10";

function makeItem(overrides: Partial<AccountsReceivableView>): AccountsReceivableView {
  const base: AccountsReceivableView = {
    id: overrides.id ?? "conta-1",
    customerId: null,
    partnerId: null,
    contractId: null,
    partyName: "Cliente teste",
    costCenterId: "cc-estacionamento",
    costCenterName: "Estacionamento",
    categoryId: "receita-estacionamento",
    categoryName: "Estacionamento",
    financialAccountId: null,
    financialAccountName: null,
    description: "Mensalidade",
    competenceDate: "2026-07-01",
    issueDate: null,
    dueDate: "2026-07-10",
    expectedAmount: 500,
    receivedAmount: 0,
    outstandingAmount: 500,
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
  };
  return { ...base, ...overrides };
}

describe("computeAccountsReceivableDashboard", () => {
  it("classifica receber hoje/amanhã/semana/mês pelo vencimento", () => {
    const items = [
      makeItem({ id: "hoje", dueDate: "2026-07-10", computedStatus: "open", outstandingAmount: 100 }),
      makeItem({ id: "amanha", dueDate: "2026-07-11", computedStatus: "open", outstandingAmount: 200 }),
      makeItem({ id: "semana", dueDate: "2026-07-15", computedStatus: "open", outstandingAmount: 300 }),
      makeItem({ id: "mes", dueDate: "2026-07-28", computedStatus: "open", outstandingAmount: 400 }),
      makeItem({ id: "fora", dueDate: "2026-09-01", computedStatus: "open", outstandingAmount: 999 }),
    ];

    const dashboard = computeAccountsReceivableDashboard(items, ASOF);

    expect(dashboard.receiveToday).toBe(100);
    expect(dashboard.receiveTomorrow).toBe(200);
    expect(dashboard.receiveThisWeek).toBe(100 + 200 + 300); // hoje até +7 dias
    expect(dashboard.receiveThisMonth).toBe(100 + 200 + 300 + 400); // todo julho/2026
  });

  it("soma receitas vencidas e lista clientes inadimplentes", () => {
    const items = [
      makeItem({ id: "vencida-1", partyName: "Funerária", dueDate: "2026-07-01", computedStatus: "overdue", outstandingAmount: 1000 }),
      makeItem({ id: "vencida-2", partyName: "Funerária", dueDate: "2026-07-05", computedStatus: "overdue", outstandingAmount: 500 }),
      makeItem({ id: "em-dia", partyName: "WeCharge", dueDate: "2026-07-20", computedStatus: "open", outstandingAmount: 300 }),
    ];

    const dashboard = computeAccountsReceivableDashboard(items, ASOF);

    expect(dashboard.overdueTotal).toBe(1500);
    expect(dashboard.delinquentClients).toEqual([{ partyName: "Funerária", overdueAmount: 1500, overdueCount: 2 }]);
  });

  it("agrupa saldo em aberto por centro de custo, forma de recebimento e categoria", () => {
    const items = [
      makeItem({ id: "a", costCenterName: "Estacionamento", paymentMethod: "pix", categoryName: "Estacionamento", outstandingAmount: 300 }),
      makeItem({ id: "b", costCenterName: "Estética Automotiva", paymentMethod: "credito", categoryName: "Lavação", outstandingAmount: 700 }),
    ];

    const dashboard = computeAccountsReceivableDashboard(items, ASOF);

    expect(dashboard.byCostCenter).toEqual([
      { costCenterName: "Estética Automotiva", amount: 700 },
      { costCenterName: "Estacionamento", amount: 300 },
    ]);
    expect(dashboard.byCategory.find((c) => c.categoryName === "Lavação")?.amount).toBe(700);
    expect(dashboard.byPaymentMethod.find((p) => p.paymentMethod === "pix")?.amount).toBe(300);
  });

  it("nunca inclui contas canceladas ou rascunho nos totais", () => {
    const items = [
      makeItem({ id: "cancelada", computedStatus: "cancelled", outstandingAmount: 5000 }),
      makeItem({ id: "rascunho", computedStatus: "draft", outstandingAmount: 5000 }),
    ];

    const dashboard = computeAccountsReceivableDashboard(items, ASOF);
    expect(dashboard.receiveThisMonth).toBe(0);
    expect(dashboard.byCostCenter).toEqual([]);
  });

  it("conta estornada com saldo em aberto volta a contar como receita a cobrar", () => {
    const items = [makeItem({ id: "estornada", computedStatus: "reversed", outstandingAmount: 900, dueDate: "2026-07-10" })];
    const dashboard = computeAccountsReceivableDashboard(items, ASOF);
    expect(dashboard.receiveToday).toBe(900);
  });
});

describe("computeReceivableAlerts", () => {
  it("gera alerta 'vencida' para contas em atraso", () => {
    const items = [makeItem({ id: "atrasada", computedStatus: "overdue", dueDate: "2026-07-01", outstandingAmount: 300 })];
    const alerts = computeReceivableAlerts(items, ASOF);
    expect(alerts.some((a) => a.level === "vencida" && a.accountsReceivableId === "atrasada")).toBe(true);
  });

  it("gera alerta 'vence_amanha' quando o vencimento é o dia seguinte", () => {
    const items = [makeItem({ id: "amanha", computedStatus: "open", dueDate: "2026-07-11", outstandingAmount: 300 })];
    const alerts = computeReceivableAlerts(items, ASOF);
    expect(alerts.some((a) => a.level === "vence_amanha" && a.accountsReceivableId === "amanha")).toBe(true);
  });

  it("gera alerta de cliente recorrente inadimplente quando há 2+ contas vencidas do mesmo cliente", () => {
    const items = [
      makeItem({ id: "v1", partyName: "Funerária", computedStatus: "overdue", dueDate: "2026-07-01", outstandingAmount: 1000 }),
      makeItem({ id: "v2", partyName: "Funerária", computedStatus: "overdue", dueDate: "2026-07-05", outstandingAmount: 500 }),
    ];
    const alerts = computeReceivableAlerts(items, ASOF);
    expect(alerts.some((a) => a.level === "cliente_recorrente_inadimplente" && a.partyName === "Funerária")).toBe(true);
  });

  it("não gera alerta de cliente recorrente com apenas 1 conta vencida", () => {
    const items = [makeItem({ id: "v1", partyName: "WeCharge", computedStatus: "overdue", dueDate: "2026-07-01", outstandingAmount: 1000 })];
    const alerts = computeReceivableAlerts(items, ASOF);
    expect(alerts.some((a) => a.level === "cliente_recorrente_inadimplente")).toBe(false);
  });

  it("nunca gera alerta para contas canceladas", () => {
    const items = [makeItem({ id: "cancelada", computedStatus: "cancelled", dueDate: "2026-07-01", outstandingAmount: 1000 })];
    const alerts = computeReceivableAlerts(items, ASOF);
    expect(alerts).toHaveLength(0);
  });
});
