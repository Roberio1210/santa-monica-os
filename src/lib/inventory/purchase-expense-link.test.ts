import { describe, expect, it } from "vitest";
import { linkPurchaseToExpense } from "@/lib/inventory/purchase-expense-link";

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
