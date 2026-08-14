import { describe, expect, it } from "vitest";
import { linkPurchaseToExpense, computePurchaseImportTotals } from "@/lib/inventory/purchase-expense-link";

const baseInput = {
  movementId: "movement-teste-001",
  itemName: "Shampoo Automotivo",
  quantity: 10,
  unit: "L",
  unitPricePaid: 25,
  date: "2026-08-11",
  dueDate: "2026-08-25",
  invoiceNumber: "NF-999",
  paymentMethod: "pix" as const,
};

describe("linkPurchaseToExpense — Compra → Estoque → Financeiro (Instrumentação Gerencial)", () => {
  it("cria a despesa vinculada quando o fornecedor corresponde a um fornecedor real cadastrado", async () => {
    const created = await linkPurchaseToExpense({ ...baseInput, supplierText: "Mercado Livre" });
    expect(created.supplierName).toBe("Mercado Livre");
    expect(created.categoryId).toBe("despesa-produtos-e-insumos");
    expect(created.originalAmount).toBe(250); // 10 x 25
    expect(created.externalId).toBe("compra-estoque:movement-teste-001");
    expect(created.documentNumber).toBe("NF-999");
  });

  it("correspondência é insensível a acento/maiúscula — nunca cria fornecedor 'quase igual'", async () => {
    const created = await linkPurchaseToExpense({ ...baseInput, movementId: "movement-teste-002", supplierText: "mercado livre" });
    expect(created.supplierName).toBe("Mercado Livre");
  });

  it("fornecedor sem correspondência real -> lança erro claro, nunca inventa o vínculo", async () => {
    await expect(linkPurchaseToExpense({ ...baseInput, movementId: "movement-teste-003", supplierText: "Fornecedor Que Não Existe" })).rejects.toThrow(/não corresponde a nenhum fornecedor cadastrado/i);
  });

  it("reprocessar o mesmo movementId nunca cria uma segunda despesa (idempotência)", async () => {
    const first = await linkPurchaseToExpense({ ...baseInput, movementId: "movement-teste-004", supplierText: "Mercado Livre" });
    const second = await linkPurchaseToExpense({ ...baseInput, movementId: "movement-teste-004", supplierText: "Mercado Livre" });
    expect(second.id).toBe(first.id);
  });
});

describe("computePurchaseImportTotals — Missão Financeiro V2 (Prioridade 8)", () => {
  it("soma o valor REAL (final_value) das 6 linhas da compra Farben, nunca o de tabela — R$ 502,03, não R$ 1.004,05", async () => {
    const lines = [
      { id: "1", productDescription: "Nograx", finalValue: 106.15, totalItemValue: 212.3, date: "2026-08-14" },
      { id: "2", productDescription: "APC-100", finalValue: 38.63, totalItemValue: 77.25, date: "2026-08-14" },
      { id: "3", productDescription: "Selanew", finalValue: 108.6, totalItemValue: 217.2, date: "2026-08-14" },
      { id: "4", productDescription: "Shamp", finalValue: 132.45, totalItemValue: 264.9, date: "2026-08-14" },
      { id: "5", productDescription: "Cleather", finalValue: 48.3, totalItemValue: 96.6, date: "2026-08-14" },
      { id: "6", productDescription: "Polidor 3 em 1", finalValue: 67.9, totalItemValue: 135.8, date: "2026-08-14" },
    ];
    const totals = computePurchaseImportTotals(lines, "2026-01-01");
    expect(totals.originalAmount).toBe(502.03);
    expect(totals.lineCount).toBe(6);
    expect(totals.competenceDate).toBe("2026-08-14");
  });

  it("usa total_item_value como fallback só quando final_value está ausente (compras sem condição comercial especial)", async () => {
    const totals = computePurchaseImportTotals([{ id: "1", productDescription: "Produto X", finalValue: null, totalItemValue: 50, date: "2026-08-14" }], "2026-01-01");
    expect(totals.originalAmount).toBe(50);
  });

  it("lança erro quando alguma linha não tem nenhum valor real — nunca lança despesa com valor parcial", async () => {
    expect(() => computePurchaseImportTotals([{ id: "1", productDescription: "Sem valor", finalValue: null, totalItemValue: null, date: null }], "2026-01-01")).toThrow(/não tem valor real/i);
  });

  it("compra sem nenhuma linha nunca vira despesa", async () => {
    expect(() => computePurchaseImportTotals([], "2026-01-01")).toThrow(/sem nenhuma linha/i);
  });

  it("usa a data da primeira linha como competência; cai no fallback só quando ausente", async () => {
    const withDate = computePurchaseImportTotals([{ id: "1", productDescription: "X", finalValue: 10, totalItemValue: 10, date: "2026-05-01" }], "2026-01-01");
    expect(withDate.competenceDate).toBe("2026-05-01");
    const withoutDate = computePurchaseImportTotals([{ id: "1", productDescription: "X", finalValue: 10, totalItemValue: 10, date: null }], "2026-01-01");
    expect(withoutDate.competenceDate).toBe("2026-01-01");
  });
});
