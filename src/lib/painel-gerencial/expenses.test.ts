import { describe, expect, it } from "vitest";
import type { AccountsPayableView } from "@/lib/finance/types";
import { buildExpenseRows, computeExpensesSummary, filterPayablesByCompetencePeriod } from "@/lib/painel-gerencial/expenses";

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

describe("filterPayablesByCompetencePeriod", () => {
  it("filtra pela data de competência dentro do intervalo", () => {
    const items = [payable({ competenceDate: "2026-07-20" }), payable({ id: "ap-2", competenceDate: "2026-08-01" })];
    const filtered = filterPayablesByCompetencePeriod(items, "2026-07-01", "2026-07-31");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("ap-1");
  });
});

describe("computeExpensesSummary — despesas", () => {
  it("período sem despesas retorna resumo honesto (hasData: false)", () => {
    const summary = computeExpensesSummary([]);
    expect(summary.hasData).toBe(false);
    expect(summary.total).toBe(0);
    expect(summary.topCategory).toBeNull();
  });

  it("soma total ignorando canceladas", () => {
    const items = [payable({ originalAmount: 100 }), payable({ id: "ap-2", originalAmount: 50, status: "cancelada", computedStatus: "cancelada" })];
    const summary = computeExpensesSummary(items);
    expect(summary.total).toBe(100);
    expect(summary.count).toBe(1);
  });

  it("identifica categoria e fornecedor com maior gasto", () => {
    const items = [
      payable({ categoryName: "Insumos", supplierName: "Fornecedor X", originalAmount: 100 }),
      payable({ id: "ap-2", categoryName: "Aluguel", supplierName: "Fornecedor Y", originalAmount: 500 }),
    ];
    const summary = computeExpensesSummary(items);
    expect(summary.topCategory?.name).toBe("Aluguel");
    expect(summary.topSupplier?.name).toBe("Fornecedor Y");
  });

  it("classifica vencidas, a vencer, pagas e não pagas", () => {
    const items = [
      payable({ id: "ap-1", computedStatus: "vencida" }),
      payable({ id: "ap-2", computedStatus: "pendente" }),
      payable({ id: "ap-3", computedStatus: "paga" }),
    ];
    const summary = computeExpensesSummary(items);
    expect(summary.overdueCount).toBe(1);
    expect(summary.upcomingCount).toBe(1);
    expect(summary.paidCount).toBe(1);
    expect(summary.unpaidCount).toBe(2);
  });
});

describe("buildExpenseRows", () => {
  it("mantém origem e fornecedor real, sem inventar quando ausente", () => {
    const [row] = buildExpenseRows([payable({ supplierName: null })]);
    expect(row.supplier).toBeNull();
    expect(row.source).toBe("manual");
  });
});
