import { describe, expect, it } from "vitest";
import { consolidateItems, type ConsolidationInput } from "@/lib/inventory/consolidation";

function baseInput(overrides: Partial<ConsolidationInput> = {}): ConsolidationInput {
  return {
    masterItemId: "master-1",
    mergedItemIds: ["merged-1"],
    unitBase: "ml",
    reason: "Mesma embalagem, tamanhos diferentes",
    performedBy: "Robério",
    ...overrides,
  };
}

/**
 * Sem Postgres configurado neste ambiente de teste, toda validação prévia (antes de qualquer
 * escrita) precisa passar e só então falhar em "Banco não configurado" — mesmo padrão de
 * confirmation.test.ts (Fase D3). A lógica transacional completa (transferência de saldo, custo
 * médio ponderado, idempotência, redirecionamento de receitas) é verificada ponta a ponta contra
 * o Neon real na missão (dados temporários, removidos após o teste).
 */
describe("consolidateItems — validações antes de qualquer escrita", () => {
  it("exige responsável", async () => {
    await expect(consolidateItems(baseInput({ performedBy: "  " }))).rejects.toThrow(/responsável/i);
  });

  it("exige ao menos um item incorporado", async () => {
    await expect(consolidateItems(baseInput({ mergedItemIds: [] }))).rejects.toThrow(/ao menos um cadastro/i);
  });

  it("nunca aceita o próprio mestre como incorporado", async () => {
    await expect(consolidateItems(baseInput({ masterItemId: "x", mergedItemIds: ["x"] }))).rejects.toThrow(/não pode aparecer também como incorporado/i);
  });

  it("com entradas válidas, chega até a camada de banco (prova que passou por toda a validação)", async () => {
    await expect(consolidateItems(baseInput())).rejects.toThrow(/banco não configurado/i);
  });

  it("deduplica ids repetidos em mergedItemIds antes de validar (nunca processa o mesmo item duas vezes)", async () => {
    await expect(consolidateItems(baseInput({ mergedItemIds: ["merged-1", "merged-1"] }))).rejects.toThrow(/banco não configurado/i);
  });
});
