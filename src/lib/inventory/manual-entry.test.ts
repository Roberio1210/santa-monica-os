import { describe, expect, it } from "vitest";
import { recordManualEntry } from "@/lib/inventory/manual-entry";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

const ITEM_ID = "v-floc-shampoo-vonixx";

describe("recordManualEntry", () => {
  it("rejeita quantidade zero ou negativa", async () => {
    await expect(
      recordManualEntry({ itemId: ITEM_ID, quantity: 0, unit: "ml", date: "2026-07-20", responsible: "Robério", supplier: null, unitPricePaid: null, invoiceNumber: null, notes: null }),
    ).rejects.toThrow(/maior que zero/i);
  });

  it("rejeita sem responsável", async () => {
    await expect(
      recordManualEntry({ itemId: ITEM_ID, quantity: 100, unit: "ml", date: "2026-07-20", responsible: "  ", supplier: null, unitPricePaid: null, invoiceNumber: null, notes: null }),
    ).rejects.toThrow(/responsável/i);
  });

  it("rejeita valor pago negativo", async () => {
    await expect(
      recordManualEntry({ itemId: ITEM_ID, quantity: 100, unit: "ml", date: "2026-07-20", responsible: "Robério", supplier: null, unitPricePaid: -1, invoiceNumber: null, notes: null }),
    ).rejects.toThrow(/valor pago/i);
  });

  it("registra como compra, atualiza saldo e reaproveita o campo reference como número da nota", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(ITEM_ID);
    if (!before) throw new Error("fixture ausente");

    const movement = await recordManualEntry({
      itemId: ITEM_ID,
      quantity: 1000,
      unit: "ml",
      date: "2026-08-01",
      responsible: "Robério",
      supplier: "Vonixx Distribuidora",
      unitPricePaid: 0.5,
      invoiceNumber: "NF-12345",
      notes: null,
    });

    expect(movement.type).toBe("compra");
    expect(movement.previousBalance).toBe(before.currentQuantity);
    expect(movement.newBalance).toBe(before.currentQuantity + 1000);
    expect(movement.reference).toBe("NF-12345");
    expect(movement.supplier).toBe("Vonixx Distribuidora");
    expect(movement.unitPricePaid).toBe(0.5);
  });

  it("sem custo médio anterior, o custo do item passa a ser o preço pago", async () => {
    const repo = getInventoryRepository();
    const freshItemId = "bactran-vonixx";
    const before = await repo.getItem(freshItemId);
    if (!before) throw new Error("fixture ausente");
    expect(before.unitCost).toBeNull();

    await recordManualEntry({ itemId: freshItemId, quantity: 500, unit: before.unit, date: "2026-08-01", responsible: "Robério", supplier: null, unitPricePaid: 0.8, invoiceNumber: null, notes: null });

    const after = await repo.getItem(freshItemId);
    expect(after?.unitCost).toBe(0.8);
  });

  it("sem preço pago informado, o custo médio do item não muda", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(ITEM_ID);
    if (!before) throw new Error("fixture ausente");

    await recordManualEntry({ itemId: ITEM_ID, quantity: 200, unit: "ml", date: "2026-08-01", responsible: "Robério", supplier: null, unitPricePaid: null, invoiceNumber: null, notes: null });

    const after = await repo.getItem(ITEM_ID);
    expect(after?.unitCost).toBe(before.unitCost);
  });

  it("fornecedor informado atualiza o fornecedor mais recente conhecido do item", async () => {
    const repo = getInventoryRepository();
    await recordManualEntry({
      itemId: ITEM_ID,
      quantity: 100,
      unit: "ml",
      date: "2026-08-01",
      responsible: "Robério",
      supplier: "Distribuidora Alpha",
      unitPricePaid: null,
      invoiceNumber: null,
      notes: null,
    });

    const after = await repo.getItem(ITEM_ID);
    expect(after?.supplier).toBe("Distribuidora Alpha");
  });

  it("mesma externalId reprocessada não duplica a entrada — saldo só sobe uma vez (Missão 34)", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(ITEM_ID);
    if (!before) throw new Error("fixture ausente");

    const input = {
      itemId: ITEM_ID,
      quantity: 5,
      unit: "ml" as const,
      date: "2026-08-05",
      responsible: "Robério",
      supplier: null,
      unitPricePaid: 2,
      invoiceNumber: null,
      notes: null,
      externalId: "compra-sync-teste-idempotencia-001",
    };

    const first = await recordManualEntry(input);
    const afterFirst = await repo.getItem(ITEM_ID);
    expect(afterFirst?.currentQuantity).toBe(before.currentQuantity + 5);

    const second = await recordManualEntry(input);
    const afterSecond = await repo.getItem(ITEM_ID);

    expect(second.id).toBe(first.id);
    expect(afterSecond?.currentQuantity).toBe(afterFirst?.currentQuantity);
    expect((await repo.listMovements(ITEM_ID)).filter((m) => m.externalId === input.externalId)).toHaveLength(1);
  });

  it("rejeita produto inexistente", async () => {
    await expect(
      recordManualEntry({ itemId: "produto-que-nao-existe", quantity: 10, unit: "ml", date: "2026-08-01", responsible: "Robério", supplier: null, unitPricePaid: null, invoiceNumber: null, notes: null }),
    ).rejects.toThrow(/não encontrado/i);
  });
});
