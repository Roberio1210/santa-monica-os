import { describe, expect, it } from "vitest";
import { registerPhysicalInventoryCount, getLastTwoReliableCounts, pickLastTwoReliableCounts, classifyReliableCountStatus, groupReliableCountsByItem } from "@/lib/inventory/managerial-physical-count";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { StockMovement } from "@/lib/inventory/types";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "m1",
    itemId: "i1",
    type: "compra",
    quantity: 100,
    unit: "ml",
    date: "2026-07-10",
    responsible: "Robério",
    reference: null,
    supplier: null,
    unitPricePaid: null,
    previousBalance: 0,
    newBalance: 100,
    externalId: null,
    notes: null,
    ...overrides,
  };
}

describe("pickLastTwoReliableCounts — Missão de Estoque Gerencial V2, seção 8/20", () => {
  it("duas últimas contagens corretamente identificadas, ignorando outros tipos de movimentação", () => {
    const movements = [
      movement({ type: "contagem_fisica_inicial", date: "2026-07-10", newBalance: 5000 }),
      movement({ type: "compra", date: "2026-07-16", newBalance: 8000 }),
      movement({ type: "correcao_inventario", date: "2026-08-01", newBalance: 4000 }),
      movement({ type: "correcao_inventario", date: "2026-08-15", newBalance: 3000 }),
    ];
    const result = pickLastTwoReliableCounts(movements);
    expect(result.latest).toEqual({ date: "2026-08-15", quantity: 3000, type: "correcao_inventario", reference: null });
    expect(result.previous).toEqual({ date: "2026-08-01", quantity: 4000, type: "correcao_inventario", reference: null });
  });

  it("insuficiente com apenas uma contagem — previous é null, nunca inventado", () => {
    const movements = [movement({ type: "contagem_fisica_inicial", date: "2026-07-10", newBalance: 5000 })];
    const result = pickLastTwoReliableCounts(movements);
    expect(result.latest).not.toBeNull();
    expect(result.previous).toBeNull();
  });

  it("zero contagens — latest e previous ambos null", () => {
    const result = pickLastTwoReliableCounts([movement({ type: "compra" })]);
    expect(result.latest).toBeNull();
    expect(result.previous).toBeNull();
  });
});

describe("registerPhysicalInventoryCount — Missão de Estoque Gerencial V2, seção 5/6/20 (modo memória)", () => {
  it("primeira contagem registra movimento correcao_inventario com new_balance correto", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("makker-vonixx");
    if (!before) throw new Error("fixture ausente");

    const result = await registerPhysicalInventoryCount({ itemId: "makker-vonixx", countedQuantity: before.currentQuantity + 500, countedAt: "2026-08-13", source: "Teste" });

    expect(result.movement.type).toBe("correcao_inventario");
    expect(result.movement.newBalance).toBe(before.currentQuantity + 500);
    expect(result.difference).toBe(500);
  });

  it("redução de saldo — diferença negativa, nenhuma saída de consumo criada (tipo continua correcao_inventario)", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("sio2-pro-vonixx");
    if (!before) throw new Error("fixture ausente");

    const result = await registerPhysicalInventoryCount({ itemId: "sio2-pro-vonixx", countedQuantity: before.currentQuantity - 100, countedAt: "2026-08-13", source: "Teste" });

    expect(result.difference).toBe(-100);
    expect(result.movement.type).toBe("correcao_inventario");
    expect(result.movement.type).not.toBe("saida");
    expect(result.movement.type).not.toBe("consumo_interno");
  });

  it("saldo igual — ainda registra o movimento (marca a posição no tempo), diferença 0", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("blend-black-edition-vonixx");
    if (!before) throw new Error("fixture ausente");

    const result = await registerPhysicalInventoryCount({ itemId: "blend-black-edition-vonixx", countedQuantity: before.currentQuantity, countedAt: "2026-08-13", source: "Teste" });

    expect(result.difference).toBe(0);
    expect(result.movement).toBeDefined();
  });

  it("currentQuantity e lastCountDate do item são atualizados", async () => {
    const repo = getInventoryRepository();
    await registerPhysicalInventoryCount({ itemId: "glaco-soft99", countedQuantity: 42, countedAt: "2026-08-13", source: "Teste" });
    const after = await repo.getItem("glaco-soft99");
    expect(after?.currentQuantity).toBe(42);
    expect(after?.lastCountDate).toBe("2026-08-13");
  });

  it("measurement_pending → confiável na primeira contagem real, resolvedMeasurementPending=true", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("hard-cleaner-wax-xtreme-expert");
    if (!before) throw new Error("fixture ausente");
    expect(before.quantityStatus).toBe("measurement_pending");

    const result = await registerPhysicalInventoryCount({ itemId: "hard-cleaner-wax-xtreme-expert", countedQuantity: 3, countedAt: "2026-08-13", source: "Teste" });
    expect(result.resolvedMeasurementPending).toBe(true);

    const after = await repo.getItem("hard-cleaner-wax-xtreme-expert");
    expect(after?.quantityStatus).toBe("confirmed");
  });

  it("segunda contagem para o mesmo item — getLastTwoReliableCounts identifica as duas corretamente", async () => {
    await registerPhysicalInventoryCount({ itemId: "hidrofast-nano-selante-jaca", countedQuantity: 400, countedAt: "2026-08-01", source: "Teste" });
    await registerPhysicalInventoryCount({ itemId: "hidrofast-nano-selante-jaca", countedQuantity: 350, countedAt: "2026-08-15", source: "Teste" });

    const counts = await getLastTwoReliableCounts("hidrofast-nano-selante-jaca");
    expect(counts.latest?.date).toBe("2026-08-15");
    expect(counts.latest?.quantity).toBe(350);
    expect(counts.previous?.date).toBe("2026-08-01");
    expect(counts.previous?.quantity).toBe(400);
  });

  it("item inexistente lança erro claro", async () => {
    await expect(registerPhysicalInventoryCount({ itemId: "produto-inexistente-xyz", countedQuantity: 1, countedAt: "2026-08-13", source: "Teste" })).rejects.toThrow(/não encontrado/i);
  });
});

describe("classifyReliableCountStatus — Missão de UI Operacional de Contagem V1, seção 7/20/21/24", () => {
  it("0 posições → sem_contagem", () => {
    expect(classifyReliableCountStatus({ latest: null, previous: null })).toBe("sem_contagem");
  });

  it("1 posição → uma_contagem", () => {
    expect(classifyReliableCountStatus({ latest: { date: "2026-08-13", quantity: 100, type: "contagem_fisica_inicial", reference: null }, previous: null })).toBe("uma_contagem");
  });

  it("2+ posições → pronto_para_analise", () => {
    const position = { date: "2026-08-13", quantity: 100, type: "correcao_inventario" as const, reference: null };
    expect(classifyReliableCountStatus({ latest: position, previous: position })).toBe("pronto_para_analise");
  });
});

describe("groupReliableCountsByItem — Missão de UI Operacional de Contagem V1, seção 7", () => {
  it("agrupa corretamente as posições de vários itens numa única passada", () => {
    const movements: StockMovement[] = [
      movement({ itemId: "item-a", type: "contagem_fisica_inicial", date: "2026-07-10", newBalance: 1000 }),
      movement({ itemId: "item-a", type: "correcao_inventario", date: "2026-08-13", newBalance: 900 }),
      movement({ itemId: "item-b", type: "contagem_fisica_inicial", date: "2026-07-10", newBalance: 500 }),
      movement({ itemId: "item-c", type: "compra", date: "2026-08-01", newBalance: 300 }),
    ];
    const result = groupReliableCountsByItem(movements);
    expect(result.get("item-a")?.latest?.quantity).toBe(900);
    expect(result.get("item-a")?.previous?.quantity).toBe(1000);
    expect(result.get("item-b")?.latest?.quantity).toBe(500);
    expect(result.get("item-b")?.previous).toBeNull();
    expect(result.get("item-c")?.latest).toBeNull(); // só tem "compra", nenhuma posição confiável
    expect(result.has("item-d")).toBe(false); // item nunca visto não aparece no mapa
  });
});
