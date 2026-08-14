import { describe, expect, it } from "vitest";
import { confirmStocktake } from "@/lib/inventory/stocktake";
import { registerPhysicalInventoryCount, getLastTwoReliableCounts } from "@/lib/inventory/managerial-physical-count";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

/**
 * Missão de Consolidação da Contagem de Estoque V1 — cenários que cruzam os dois caminhos
 * (contagem rápida × confirmação em lote), provando que ambos convergem para a MESMA semântica
 * de posição física confiável via `registerPhysicalInventoryCount`/`recordPhysicalCount`.
 */
describe("Stocktake (lote) — mesma semântica canônica de registerPhysicalInventoryCount", () => {
  it("atualiza lastCountDate do item, mesmo pela confirmação em lote", async () => {
    const repo = getInventoryRepository();
    await confirmStocktake("TESTE-CONSOLIDACAO-1", "Robério", [{ itemId: "makker-vonixx", physicalQuantity: 321, notFound: false, measurementPending: false, observation: null }]);
    const after = await repo.getItem("makker-vonixx");
    const today = new Date().toISOString().slice(0, 10);
    expect(after?.lastCountDate).toBe(today);
  });

  it("atualiza quantityStatus para 'confirmed', mesmo pela confirmação em lote", async () => {
    const repo = getInventoryRepository();
    await confirmStocktake("TESTE-CONSOLIDACAO-2", "Robério", [{ itemId: "sio2-pro-vonixx", physicalQuantity: 42, notFound: false, measurementPending: false, observation: null }]);
    const after = await repo.getItem("sio2-pro-vonixx");
    expect(after?.quantityStatus).toBe("confirmed");
  });

  it("measurement_pending → confirmed via Stocktake (lote), igual à contagem rápida — não pode depender da tela", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem("hard-cleaner-wax-xtreme-expert");
    if (!before) throw new Error("fixture ausente");
    expect(before.quantityStatus).toBe("measurement_pending");

    await confirmStocktake("TESTE-CONSOLIDACAO-3", "Robério", [{ itemId: "hard-cleaner-wax-xtreme-expert", physicalQuantity: 2, notFound: false, measurementPending: false, observation: null }]);

    const after = await repo.getItem("hard-cleaner-wax-xtreme-expert");
    expect(after?.quantityStatus).toBe("confirmed");
    expect(after?.currentQuantity).toBe(2);
  });

  it("item não incluído na sessão em lote não gera nenhuma posição/movimento", async () => {
    const repo = getInventoryRepository();
    const before = await repo.listMovements("glass-vision-limpa-vidros-expert");

    await confirmStocktake("TESTE-CONSOLIDACAO-4", "Robério", [{ itemId: "blend-black-edition-vonixx", physicalQuantity: 10, notFound: false, measurementPending: false, observation: null }]);

    const after = await repo.listMovements("glass-vision-limpa-vidros-expert");
    expect(after.length).toBe(before.length);
  });

  it("nenhum movimento de saída/consumo é criado — só correcao_inventario, mesmo com diferença negativa grande", async () => {
    const result = await confirmStocktake("TESTE-CONSOLIDACAO-5", "Robério", [{ itemId: "v-light-vitrificador-ceramico-farol-vonixx", physicalQuantity: 0, notFound: false, measurementPending: false, observation: null }]);
    expect(result.movements.every((m) => m.type === "correcao_inventario")).toBe(true);
  });
});

describe("Convergência entre contagem rápida e lote — Missão de Consolidação, seção 9/14", () => {
  it("contagem rápida seguida de lote — getLastTwoReliableCounts reconhece as duas, na ordem certa", async () => {
    await registerPhysicalInventoryCount({ itemId: "hidrofast-nano-selante-jaca", countedQuantity: 500, countedAt: "2026-08-01", source: "Teste rápida" });
    await confirmStocktake("TESTE-CONSOLIDACAO-6", "Teste lote", [{ itemId: "hidrofast-nano-selante-jaca", physicalQuantity: 480, notFound: false, measurementPending: false, observation: null }]);

    const counts = await getLastTwoReliableCounts("hidrofast-nano-selante-jaca");
    expect(counts.latest?.quantity).toBe(480);
    expect(counts.previous?.quantity).toBe(500);
  });

  it("lote seguido de contagem rápida — getLastTwoReliableCounts reconhece as duas, na ordem certa", async () => {
    await confirmStocktake("TESTE-CONSOLIDACAO-7", "Teste lote", [{ itemId: "glaco-soft99", physicalQuantity: 200, notFound: false, measurementPending: false, observation: null }]);
    await registerPhysicalInventoryCount({ itemId: "glaco-soft99", countedQuantity: 150, countedAt: "2026-08-20", source: "Teste rápida" });

    const counts = await getLastTwoReliableCounts("glaco-soft99");
    expect(counts.latest?.quantity).toBe(150);
    expect(counts.previous?.quantity).toBe(200);
  });

  it("dois lotes (sessões diferentes) para o mesmo item — ambos reconhecidos como as 2 posições confiáveis", async () => {
    // Ambas as sessões de lote usam a data corrente internamente (confirmStocktake não aceita
    // data customizada) — no mesmo dia, o desempate entre as duas é por ordem de inserção
    // (documentado em pickLastTwoReliableCounts: "nenhum critério adicional inventado"), nunca
    // por hora real. O teste valida o que É garantido: as duas posições aparecem, nenhuma é
    // perdida — não qual das duas é "latest" quando a data é idêntica.
    const itemId = "boina-pirulito-la-corte-farben";
    const repo = getInventoryRepository();
    const item = await repo.getItem(itemId);
    if (!item) throw new Error("fixture ausente");

    await confirmStocktake("TESTE-CONSOLIDACAO-8A", "Lote A", [{ itemId, physicalQuantity: 10, notFound: false, measurementPending: false, observation: null }]);
    await confirmStocktake("TESTE-CONSOLIDACAO-8B", "Lote B", [{ itemId, physicalQuantity: 8, notFound: false, measurementPending: false, observation: null }]);

    const counts = await getLastTwoReliableCounts(itemId);
    const values = [counts.latest?.quantity, counts.previous?.quantity].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(values).toEqual([8, 10]);
  });
});
