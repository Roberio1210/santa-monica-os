import { describe, expect, it } from "vitest";
import { updateItemDetails } from "@/lib/inventory/item-details";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

const ITEM_ID = "izer-limpador-ferroso-vonixx";

describe("updateItemDetails", () => {
  it("rejeita estoque mínimo negativo", async () => {
    await expect(updateItemDetails({ itemId: ITEM_ID, supplier: null, location: null, minimumStock: -1, idealStock: null })).rejects.toThrow(/estoque mínimo/i);
  });

  it("rejeita estoque ideal negativo", async () => {
    await expect(updateItemDetails({ itemId: ITEM_ID, supplier: null, location: null, minimumStock: null, idealStock: -1 })).rejects.toThrow(/estoque ideal/i);
  });

  it("rejeita estoque ideal menor que o mínimo", async () => {
    await expect(updateItemDetails({ itemId: ITEM_ID, supplier: null, location: null, minimumStock: 500, idealStock: 100 })).rejects.toThrow(/não pode ser menor/i);
  });

  it("atualiza fornecedor, localização, mínimo e ideal — nunca toca em quantidade/custo", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(ITEM_ID);
    if (!before) throw new Error("fixture ausente");

    const updated = await updateItemDetails({ itemId: ITEM_ID, supplier: "Fornecedor XPTO", location: "Prateleira A", minimumStock: 200, idealStock: 800 });

    expect(updated.supplier).toBe("Fornecedor XPTO");
    expect(updated.location).toBe("Prateleira A");
    expect(updated.minimumStock).toBe(200);
    expect(updated.idealStock).toBe(800);
    expect(updated.currentQuantity).toBe(before.currentQuantity);
    expect(updated.unitCost).toBe(before.unitCost);
  });

  it("null limpa o campo (ex.: remover fornecedor cadastrado por engano)", async () => {
    const repo = getInventoryRepository();
    await updateItemDetails({ itemId: ITEM_ID, supplier: "Temporário", location: null, minimumStock: null, idealStock: null });
    await updateItemDetails({ itemId: ITEM_ID, supplier: null, location: null, minimumStock: null, idealStock: null });

    const after = await repo.getItem(ITEM_ID);
    expect(after?.supplier).toBeNull();
  });
});
