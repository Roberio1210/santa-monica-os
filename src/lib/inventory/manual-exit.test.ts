import { describe, expect, it } from "vitest";
import { EXIT_REASON_TO_MOVEMENT_TYPE, recordManualExit } from "@/lib/inventory/manual-exit";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

const ITEM_ID = "limpa-estofado-vintex";

describe("EXIT_REASON_TO_MOVEMENT_TYPE", () => {
  it("reaproveita tipos já existentes sempre que possível — só descarte/outros são novos", () => {
    expect(EXIT_REASON_TO_MOVEMENT_TYPE.consumo).toBe("consumo_interno");
    expect(EXIT_REASON_TO_MOVEMENT_TYPE.perda).toBe("perda");
    expect(EXIT_REASON_TO_MOVEMENT_TYPE.teste).toBe("consumo_teste_calibracao");
    expect(EXIT_REASON_TO_MOVEMENT_TYPE.descarte).toBe("descarte");
    expect(EXIT_REASON_TO_MOVEMENT_TYPE.outros).toBe("outros");
  });
});

describe("recordManualExit", () => {
  it("rejeita motivo inválido", async () => {
    await expect(
      // @ts-expect-error testando motivo inválido de propósito
      recordManualExit({ itemId: ITEM_ID, quantity: 10, unit: "ml", reason: "invalido", date: "2026-08-01", responsible: "Robério", notes: null }),
    ).rejects.toThrow(/motivo inválido/i);
  });

  it("rejeita quantidade zero ou negativa", async () => {
    await expect(recordManualExit({ itemId: ITEM_ID, quantity: 0, unit: "ml", reason: "consumo", date: "2026-08-01", responsible: "Robério", notes: null })).rejects.toThrow(/maior que zero/i);
  });

  it("rejeita sem responsável", async () => {
    await expect(recordManualExit({ itemId: ITEM_ID, quantity: 10, unit: "ml", reason: "consumo", date: "2026-08-01", responsible: " ", notes: null })).rejects.toThrow(/responsável/i);
  });

  it("baixa por descarte registra o tipo novo do enum e reduz o saldo", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(ITEM_ID);
    if (!before) throw new Error("fixture ausente");

    const movement = await recordManualExit({ itemId: ITEM_ID, quantity: 30, unit: "ml", reason: "descarte", date: "2026-08-01", responsible: "Robério", notes: "validade vencida" });

    expect(movement.type).toBe("descarte");
    expect(movement.previousBalance).toBe(before.currentQuantity);
    expect(movement.newBalance).toBe(before.currentQuantity - 30);
    expect(movement.notes).toBe("Descarte — validade vencida");
  });

  it("sem observação, usa só o rótulo do motivo como nota", async () => {
    const movement = await recordManualExit({ itemId: ITEM_ID, quantity: 5, unit: "ml", reason: "teste", date: "2026-08-01", responsible: "Robério", notes: null });
    expect(movement.notes).toBe("Teste");
  });
});
