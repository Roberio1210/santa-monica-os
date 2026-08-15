import { describe, expect, it } from "vitest";
import { groupBankStatementLines } from "@/lib/finance/bankStatement/grouping";
import type { BankStatementLine } from "@/lib/finance/bankStatement/types";

function line(overrides: Partial<BankStatementLine>): BankStatementLine {
  return {
    id: overrides.id ?? "line-1",
    importId: "import-1",
    rowIndex: 0,
    rawData: {},
    date: "2026-01-10",
    description: "Transferência | Pix / CELESC DISTRIBUICAO S.A",
    counterparty: null,
    direction: "saida",
    amount: 500,
    type: "pix_enviado",
    status: "a_classificar",
    categoryId: null,
    supplierId: null,
    partnerId: null,
    matchedStoneAmount: null,
    matchedStoneDivergence: null,
    linkedAccountsReceivableId: null,
    linkedAccountsPayableId: null,
    linkedCashMovementId: null,
    linkedAccountTransferId: null,
    reconciliationNote: null,
    processedBy: null,
    dedupeKey: `key-${overrides.id ?? "1"}`,
    ...overrides,
  };
}

describe("groupBankStatementLines — Missão Financeiro V2.2 (Fase C)", () => {
  it("agrupa linhas da mesma contraparte/direção/tipo num único grupo", () => {
    const lines = [
      line({ id: "1", date: "2026-01-10", amount: 1682.71 }),
      line({ id: "2", date: "2026-03-11", amount: 1200.0 }),
      line({ id: "3", date: "2026-05-12", amount: 617.45 }),
    ];
    const groups = groupBankStatementLines(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });

  it("nunca agrupa direções diferentes juntas, mesmo com a mesma contraparte", () => {
    const lines = [line({ id: "1", direction: "saida" }), line({ id: "2", direction: "entrada", type: "pix_recebido" })];
    const groups = groupBankStatementLines(lines);
    expect(groups).toHaveLength(2);
  });

  it("contrapartes diferentes nunca se misturam", () => {
    const lines = [line({ id: "1" }), line({ id: "2", description: "Transferência | Pix / VERISURE BRASIL" })];
    const groups = groupBankStatementLines(lines);
    expect(groups).toHaveLength(2);
  });

  it("calcula estatísticas corretas do grupo", () => {
    const lines = [
      line({ id: "1", date: "2026-01-10", amount: 100 }),
      line({ id: "2", date: "2026-02-10", amount: 200 }),
      line({ id: "3", date: "2026-03-10", amount: 300 }),
    ];
    const [group] = groupBankStatementLines(lines);
    expect(group.totalAmount).toBe(600);
    expect(group.averageAmount).toBe(200);
    expect(group.minAmount).toBe(100);
    expect(group.maxAmount).toBe(300);
    expect(group.distinctMonths).toBe(3);
    expect(group.daysOfMonth).toEqual([10]);
    expect(group.periodFrom).toBe("2026-01-10");
    expect(group.periodTo).toBe("2026-03-10");
  });

  it("ordena grupos por quantidade decrescente, depois valor total", () => {
    const lines = [
      line({ id: "1" }),
      line({ id: "2", description: "Transferência | Pix / VERISURE BRASIL" }),
      line({ id: "3", description: "Transferência | Pix / VERISURE BRASIL", date: "2026-02-10" }),
    ];
    const groups = groupBankStatementLines(lines);
    expect(groups[0].counterpartyKey).toContain("VERISURE");
    expect(groups[0].count).toBe(2);
  });

  it("linha isolada (sem repetição) ainda forma um grupo de tamanho 1", () => {
    const groups = groupBankStatementLines([line({ id: "1" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });
});
