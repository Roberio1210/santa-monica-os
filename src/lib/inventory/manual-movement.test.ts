import { describe, expect, it } from "vitest";
import { MANUAL_MOVEMENT_TYPES, recordManualMovement } from "@/lib/inventory/manual-movement";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

describe("MANUAL_MOVEMENT_TYPES", () => {
  it("nunca inclui tipos que só nascem de fluxos automáticos", () => {
    expect(MANUAL_MOVEMENT_TYPES).not.toContain("compra");
    expect(MANUAL_MOVEMENT_TYPES).not.toContain("entrada");
    expect(MANUAL_MOVEMENT_TYPES).not.toContain("contagem_fisica_inicial");
    expect(MANUAL_MOVEMENT_TYPES).not.toContain("consumo_teste_calibracao");
    expect(MANUAL_MOVEMENT_TYPES).not.toContain("consumo_interno");
  });
});

describe("recordManualMovement", () => {
  it("rejeita tipo não permitido manualmente", async () => {
    await expect(
      recordManualMovement({ itemId: "v-floc-shampoo-vonixx", type: "entrada", quantity: 1, unit: "ml", date: "2026-07-20", responsible: "Robério", reason: "teste", notes: null }),
    ).rejects.toThrow(/não pode ser registrado manualmente/i);
  });

  it("rejeita quantidade zero ou negativa", async () => {
    await expect(
      recordManualMovement({ itemId: "v-floc-shampoo-vonixx", type: "perda", quantity: 0, unit: "ml", date: "2026-07-20", responsible: "Robério", reason: "teste", notes: null }),
    ).rejects.toThrow(/maior que zero/i);
  });

  it("rejeita sem responsável ou sem motivo", async () => {
    await expect(
      recordManualMovement({ itemId: "v-floc-shampoo-vonixx", type: "perda", quantity: 10, unit: "ml", date: "2026-07-20", responsible: "  ", reason: "teste", notes: null }),
    ).rejects.toThrow(/responsável/i);
    await expect(
      recordManualMovement({ itemId: "v-floc-shampoo-vonixx", type: "perda", quantity: 10, unit: "ml", date: "2026-07-20", responsible: "Robério", reason: "  ", notes: null }),
    ).rejects.toThrow(/motivo/i);
  });

  it("registra uma perda válida, atualiza o saldo pela movimentação e nunca sobrescreve o histórico", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("blend-cera-carnauba-spray-vonixx");
    if (!before) throw new Error("fixture ausente");

    const movement = await recordManualMovement({
      itemId: "blend-cera-carnauba-spray-vonixx",
      type: "perda",
      quantity: 50,
      unit: "ml",
      date: "2026-07-20",
      responsible: "Robério",
      reason: "vazamento",
      notes: "frasco trincado",
    });

    expect(movement.previousBalance).toBe(before.currentQuantity);
    expect(movement.newBalance).toBe(before.currentQuantity - 50);
    expect(movement.notes).toBe("vazamento — frasco trincado");

    const after = await repo.getItem("blend-cera-carnauba-spray-vonixx");
    expect(after?.currentQuantity).toBe(before.currentQuantity - 50);
  });
});
