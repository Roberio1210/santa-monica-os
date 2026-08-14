import { describe, expect, it } from "vitest";
import { confirmStocktake } from "@/lib/inventory/stocktake";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

describe("confirmStocktake (modo memória — 48 itens reais da contagem de 10/07/2026)", () => {
  it("Missão de Consolidação da Contagem de Estoque V1, seção 4 — gera correcao_inventario para TODO item efetivamente contado, mesmo sem divergência (uma contagem sem diferença ainda é uma posição física confiável)", async () => {
    const repo = getInventoryRepository();
    const unchanged = await repo.getItem("makker-vonixx");
    if (!unchanged) throw new Error("fixture ausente");

    const result = await confirmStocktake("TESTE-STOCKTAKE-1", "Robério", [
      { itemId: "makker-vonixx", physicalQuantity: unchanged.currentQuantity, notFound: false, measurementPending: false, observation: null },
      { itemId: "sio2-pro-vonixx", physicalQuantity: 999, notFound: false, measurementPending: false, observation: "divergência de teste" },
    ]);

    expect(result.unchangedCount).toBe(1); // ainda contabilizado para o resumo, mas não significa mais "sem movimento"
    expect(result.movements).toHaveLength(2);
    const unchangedMovement = result.movements.find((m) => m.itemId === "makker-vonixx");
    expect(unchangedMovement?.previousBalance).toBe(unchangedMovement?.newBalance);
    const divergentMovement = result.movements.find((m) => m.itemId === "sio2-pro-vonixx");
    expect(divergentMovement?.newBalance).toBe(999);
  });

  it("nunca gera movimento para 'não encontrado' ou 'medição pendente'", async () => {
    const result = await confirmStocktake("TESTE-STOCKTAKE-2", "Robério", [
      { itemId: "blend-black-edition-vonixx", physicalQuantity: null, notFound: true, measurementPending: false, observation: null },
      { itemId: "glaco-soft99", physicalQuantity: null, notFound: false, measurementPending: true, observation: null },
    ]);
    expect(result.movements).toHaveLength(0);
    expect(result.notFoundCount).toBe(1);
    expect(result.measurementPendingCount).toBe(1);
  });

  it("bloqueia confirmar a mesma referência duas vezes", async () => {
    await confirmStocktake("TESTE-STOCKTAKE-3", "Robério", [
      { itemId: "hidrofast-nano-selante-jaca", physicalQuantity: 1, notFound: false, measurementPending: false, observation: null },
    ]);

    await expect(
      confirmStocktake("TESTE-STOCKTAKE-3", "Robério", [
        { itemId: "hidrofast-nano-selante-jaca", physicalQuantity: 2, notFound: false, measurementPending: false, observation: null },
      ]),
    ).rejects.toThrow(/já foi confirmada/i);
  });

  it("nunca sobrescreve o saldo diretamente — o novo saldo do item reflete exatamente o registrado na movimentação", async () => {
    const repo = getInventoryRepository();
    await confirmStocktake("TESTE-STOCKTAKE-4", "Robério", [
      { itemId: "v-light-vitrificador-ceramico-farol-vonixx", physicalQuantity: 15, notFound: false, measurementPending: false, observation: "reconferência" },
    ]);
    const after = await repo.getItem("v-light-vitrificador-ceramico-farol-vonixx");
    expect(after?.currentQuantity).toBe(15);
  });
});
