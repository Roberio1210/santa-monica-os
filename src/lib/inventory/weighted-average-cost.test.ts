import { describe, expect, it } from "vitest";
import { computeWeightedAverageCost } from "@/lib/inventory/weighted-average-cost";

describe("computeWeightedAverageCost", () => {
  it("quando o item não tem custo cadastrado, o novo custo é o preço pago (nada para ponderar)", () => {
    const cost = computeWeightedAverageCost({ currentQuantity: 0, currentUnitCost: null, enteredQuantity: 1000, unitPricePaid: 0.5 });
    expect(cost).toBe(0.5);
  });

  it("pondera pelo saldo atual e pela quantidade entrando", () => {
    // 500ml a R$0,40 + 500ml a R$0,60 = 1000ml a R$0,50 em média
    const cost = computeWeightedAverageCost({ currentQuantity: 500, currentUnitCost: 0.4, enteredQuantity: 500, unitPricePaid: 0.6 });
    expect(cost).toBe(0.5);
  });

  it("entrada pequena move pouco o custo médio de um saldo grande", () => {
    const cost = computeWeightedAverageCost({ currentQuantity: 9000, currentUnitCost: 1, enteredQuantity: 1000, unitPricePaid: 2 });
    expect(cost).toBe(1.1);
  });

  it("saldo zerado (mesmo com custo cadastrado) usa o novo preço pago diretamente", () => {
    const cost = computeWeightedAverageCost({ currentQuantity: 0, currentUnitCost: 3, enteredQuantity: 100, unitPricePaid: 5 });
    expect(cost).toBe(5);
  });
});
