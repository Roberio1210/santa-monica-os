import { describe, expect, it } from "vitest";
import { confirmOrderConsumption, reverseOrderConsumption, type ConfirmConsumptionInput } from "@/lib/orders/confirmation";

function baseInput(overrides: Partial<ConfirmConsumptionInput> = {}): ConfirmConsumptionInput {
  return {
    externalId: "order-1",
    vehicleCategory: "hatch",
    responsibleName: "Robério",
    justification: null,
    lines: [{ itemId: "item-1", recipeId: "recipe-1", processStep: "shampoo", expectedQuantity: 100, confirmedQuantity: 100, justification: null, isExtra: false }],
    removedItemsLog: [],
    isPartial: false,
    ...overrides,
  };
}

describe("confirmOrderConsumption — validações antes de qualquer escrita", () => {
  it("exige responsável", async () => {
    await expect(confirmOrderConsumption(baseInput({ responsibleName: "  " }))).rejects.toThrow(/responsável/i);
  });

  it("nunca permite confirmar com categoria desconhecida", async () => {
    await expect(confirmOrderConsumption(baseInput({ vehicleCategory: "desconhecido" }))).rejects.toThrow(/categoria/i);
  });

  it("exige ao menos um item", async () => {
    await expect(confirmOrderConsumption(baseInput({ lines: [] }))).rejects.toThrow(/nenhum item/i);
  });

  it("confirmação parcial exige justificativa geral", async () => {
    await expect(confirmOrderConsumption(baseInput({ isPartial: true, justification: null }))).rejects.toThrow(/parcial exige justificativa/i);
  });

  it("rejeita quantidade confirmada zero ou negativa", async () => {
    await expect(
      confirmOrderConsumption(baseInput({ lines: [{ itemId: "item-1", recipeId: null, processStep: null, expectedQuantity: null, confirmedQuantity: 0, justification: "x", isExtra: false }] })),
    ).rejects.toThrow(/maior que zero/i);
  });

  it("exige justificativa quando a quantidade confirmada diverge do esperado", async () => {
    await expect(
      confirmOrderConsumption(
        baseInput({ lines: [{ itemId: "item-1", recipeId: "recipe-1", processStep: "shampoo", expectedQuantity: 100, confirmedQuantity: 80, justification: null, isExtra: false }] }),
      ),
    ).rejects.toThrow(/justificativa obrigatória/i);
  });

  it("aceita divergência quando há justificativa", async () => {
    // Sem Postgres configurado, a validação passa e falha depois em "Banco não configurado" — prova que a checagem de justificativa não bloqueou.
    await expect(
      confirmOrderConsumption(
        baseInput({ lines: [{ itemId: "item-1", recipeId: "recipe-1", processStep: "shampoo", expectedQuantity: 100, confirmedQuantity: 80, justification: "sobra do serviço anterior", isExtra: false }] }),
      ),
    ).rejects.toThrow(/banco não configurado/i);
  });

  it("item extra sem receita sempre exige justificativa, mesmo sem quantidade esperada para comparar", async () => {
    await expect(
      confirmOrderConsumption(
        baseInput({ lines: [{ itemId: "item-extra", recipeId: null, processStep: null, expectedQuantity: null, confirmedQuantity: 10, justification: null, isExtra: true }] }),
      ),
    ).rejects.toThrow(/justificativa obrigatória/i);
  });
});

describe("reverseOrderConsumption — validações antes de qualquer escrita", () => {
  it("exige responsável", async () => {
    await expect(reverseOrderConsumption("confirmation-1", "  ", "motivo")).rejects.toThrow(/responsável/i);
  });

  it("exige motivo", async () => {
    await expect(reverseOrderConsumption("confirmation-1", "Robério", "  ")).rejects.toThrow(/motivo/i);
  });
});
