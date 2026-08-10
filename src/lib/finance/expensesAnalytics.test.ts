import { describe, expect, it } from "vitest";
import type { AccountsPayableView, RecurringBillTemplate } from "@/lib/finance/types";
import {
  averageDailyExpense,
  buildRecurringTemplateDetails,
  groupByCategory,
  groupBySupplier,
  monthlyEvolution,
  splitFixedVariable,
  splitRecurringVsOneOff,
  topExpenses,
} from "@/lib/finance/expensesAnalytics";

function payable(overrides: Partial<AccountsPayableView> = {}): AccountsPayableView {
  return {
    id: "ap-1",
    description: "Compra de insumos",
    supplierId: "sup-1",
    supplierName: "Fornecedor X",
    categoryId: "cat-1",
    categoryName: "Insumos",
    costCenterId: null,
    costCenterName: null,
    financialAccountId: null,
    financialAccountName: null,
    competenceDate: "2026-07-20",
    issueDate: "2026-07-20",
    dueDate: "2026-07-25",
    originalAmount: 100,
    paidAmount: 0,
    outstandingAmount: 100,
    paymentMethod: "pix",
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
    createdAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-20T10:00:00Z",
    computedStatus: "pendente",
    isOverdue: false,
    ...overrides,
  };
}

function template(overrides: Partial<RecurringBillTemplate> = {}): RecurringBillTemplate {
  return {
    id: "tpl-1",
    description: "Aluguel",
    supplierId: null,
    supplierName: null,
    categoryId: "cat-1",
    costCenterId: null,
    financialAccountId: null,
    amount: 2000,
    variableAmount: false,
    dueDay: 10,
    periodicity: "mensal",
    pendingData: false,
    notes: null,
    ...overrides,
  };
}

describe("groupByCategory", () => {
  it("agrupa por categoria, soma valores e calcula participação percentual", () => {
    const items = [
      payable({ id: "1", categoryName: "Aluguel", originalAmount: 300 }),
      payable({ id: "2", categoryName: "Insumos", originalAmount: 100 }),
      payable({ id: "3", categoryName: "Insumos", originalAmount: 100 }),
    ];
    const groups = groupByCategory(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ category: "Aluguel", count: 1, total: 300, share: 60 });
    expect(groups[1]).toMatchObject({ category: "Insumos", count: 2, total: 200, share: 40 });
  });

  it("ignora despesas canceladas", () => {
    const items = [payable({ id: "1", originalAmount: 100 }), payable({ id: "2", originalAmount: 999, computedStatus: "cancelada" })];
    const groups = groupByCategory(items);
    expect(groups[0].total).toBe(100);
  });

  it("conjunto vazio não quebra (share não vira NaN)", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("groupBySupplier", () => {
  it("agrupa por fornecedor, maior gasto primeiro", () => {
    const items = [payable({ id: "1", supplierName: "A", originalAmount: 50 }), payable({ id: "2", supplierName: "B", originalAmount: 150 })];
    const groups = groupBySupplier(items);
    expect(groups[0].supplier).toBe("B");
    expect(groups[1].supplier).toBe("A");
  });

  it("despesa sem fornecedor informado nunca aparece (nunca inventa um fornecedor)", () => {
    const items = [payable({ id: "1", supplierName: null })];
    expect(groupBySupplier(items)).toEqual([]);
  });
});

describe("splitFixedVariable", () => {
  it("recorrente com modelo de valor fixo cai em 'fixa'", () => {
    const items = [payable({ id: "1", recurringBillTemplateId: "tpl-1", originalAmount: 2000 })];
    const map = new Map([["tpl-1", false]]);
    const result = splitFixedVariable(items, map);
    expect(result.fixed.count).toBe(1);
    expect(result.fixed.total).toBe(2000);
    expect(result.variable.count).toBe(0);
  });

  it("recorrente com modelo de valor variável cai em 'variável'", () => {
    const items = [payable({ id: "1", recurringBillTemplateId: "tpl-agua", originalAmount: 340 })];
    const map = new Map([["tpl-agua", true]]);
    const result = splitFixedVariable(items, map);
    expect(result.variable.count).toBe(1);
    expect(result.fixed.count).toBe(0);
  });

  it("despesa avulsa (sem modelo de recorrência) sempre cai em 'variável'", () => {
    const items = [payable({ id: "1", recurringBillTemplateId: null })];
    const result = splitFixedVariable(items, new Map());
    expect(result.variable.count).toBe(1);
    expect(result.fixed.count).toBe(0);
  });
});

describe("splitRecurringVsOneOff", () => {
  it("separa por presença de recurringBillTemplateId", () => {
    const items = [payable({ id: "1", recurringBillTemplateId: "tpl-1" }), payable({ id: "2", recurringBillTemplateId: null })];
    const result = splitRecurringVsOneOff(items);
    expect(result.recurring.count).toBe(1);
    expect(result.oneOff.count).toBe(1);
  });
});

describe("topExpenses", () => {
  it("retorna as N maiores, maior valor primeiro", () => {
    const items = [payable({ id: "1", originalAmount: 50 }), payable({ id: "2", originalAmount: 500 }), payable({ id: "3", originalAmount: 200 })];
    const top = topExpenses(items, 2);
    expect(top.map((i) => i.id)).toEqual(["2", "3"]);
  });

  it("ignora canceladas", () => {
    const items = [payable({ id: "1", originalAmount: 9999, computedStatus: "cancelada" }), payable({ id: "2", originalAmount: 100 })];
    const top = topExpenses(items, 5);
    expect(top.map((i) => i.id)).toEqual(["2"]);
  });
});

describe("monthlyEvolution", () => {
  it("preenche todos os meses do intervalo, mesmo sem despesa (nunca omite mês)", () => {
    const items = [payable({ id: "1", competenceDate: "2026-06-15", originalAmount: 100 })];
    const points = monthlyEvolution(items, 3, "2026-08");
    expect(points.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(points[0]).toMatchObject({ month: "2026-06", total: 100, count: 1 });
    expect(points[1]).toMatchObject({ month: "2026-07", total: 0, count: 0 });
  });

  it("soma múltiplas despesas do mesmo mês", () => {
    const items = [payable({ id: "1", competenceDate: "2026-08-05", originalAmount: 100 }), payable({ id: "2", competenceDate: "2026-08-20", originalAmount: 50 })];
    const points = monthlyEvolution(items, 1, "2026-08");
    expect(points[0]).toMatchObject({ month: "2026-08", total: 150, count: 2 });
  });

  it("respeita virada de ano ao olhar para trás", () => {
    const points = monthlyEvolution([], 3, "2026-01");
    expect(points.map((p) => p.month)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("averageDailyExpense", () => {
  it("divide o total pelos dias do período, inclusive", () => {
    expect(averageDailyExpense(310, "2026-08-01", "2026-08-31")).toBe(10); // 31 dias
  });

  it("período de 1 dia -> média igual ao total", () => {
    expect(averageDailyExpense(50, "2026-08-01", "2026-08-01")).toBe(50);
  });
});

describe("buildRecurringTemplateDetails", () => {
  it("modelo fixo: expectedAmount vem do template, não da última instância", () => {
    const templates = [template({ id: "tpl-1", amount: 2000, variableAmount: false })];
    const items = [payable({ id: "1", recurringBillTemplateId: "tpl-1", competenceDate: "2026-07-01", originalAmount: 2000 })];
    const details = buildRecurringTemplateDetails(templates, items);
    expect(details[0].expectedAmount).toBe(2000);
    expect(details[0].lastRealizedAmount).toBe(2000);
  });

  it("modelo variável: expectedAmount é null (não inventa um valor único)", () => {
    const templates = [template({ id: "tpl-agua", amount: null, variableAmount: true })];
    const details = buildRecurringTemplateDetails(templates, []);
    expect(details[0].expectedAmount).toBeNull();
  });

  it("calcula variação entre a última e a penúltima instância", () => {
    const templates = [template({ id: "tpl-agua", variableAmount: true })];
    const items = [
      payable({ id: "1", recurringBillTemplateId: "tpl-agua", competenceDate: "2026-06-01", originalAmount: 300 }),
      payable({ id: "2", recurringBillTemplateId: "tpl-agua", competenceDate: "2026-07-01", originalAmount: 345 }),
    ];
    const details = buildRecurringTemplateDetails(templates, items);
    expect(details[0].lastCompetence).toBe("2026-07-01");
    expect(details[0].variation).toEqual({ amount: 45, percent: 15 });
  });

  it("só uma instância -> variação null (nada para comparar)", () => {
    const templates = [template({ id: "tpl-1" })];
    const items = [payable({ id: "1", recurringBillTemplateId: "tpl-1", competenceDate: "2026-07-01", originalAmount: 2000 })];
    const details = buildRecurringTemplateDetails(templates, items);
    expect(details[0].variation).toBeNull();
  });

  it("modelo sem nenhuma instância gerada ainda -> tudo null, nunca lança", () => {
    const templates = [template({ id: "tpl-novo" })];
    const details = buildRecurringTemplateDetails(templates, []);
    expect(details[0].lastRealizedAmount).toBeNull();
    expect(details[0].lastCompetence).toBeNull();
    expect(details[0].instances).toEqual([]);
  });
});
