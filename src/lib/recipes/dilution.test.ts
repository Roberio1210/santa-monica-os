import { describe, expect, it } from "vitest";
import { calculateConcentrateConsumed } from "@/lib/recipes/dilution";

describe("calculateConcentrateConsumed", () => {
  it("produto puro medido direto na embalagem: concentrado = antes - depois", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 940,
      preparedQuantity: null,
      dilutionRatio: null,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(60);
  });

  it("diluição 1:5 — 600 ml de solução preparada e usada por completo equivalem a 100 ml de concentrado", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 400,
      preparedQuantity: 600,
      dilutionRatio: 5,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(100);
  });

  it("diluição 1:10 — 1100 ml preparados equivalem a 100 ml de concentrado", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 900,
      preparedQuantity: 1100,
      dilutionRatio: 10,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(100);
  });

  it("diluição 1:20 — 2100 ml preparados equivalem a 100 ml de concentrado", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 900,
      preparedQuantity: 2100,
      dilutionRatio: 20,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(100);
  });

  it("sobra reaproveitada nunca conta como consumida", () => {
    const withLeftover = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 400,
      preparedQuantity: 600,
      dilutionRatio: 5,
      leftoverReused: 60,
      discarded: null,
    });
    // (600 - 60) / 6 = 90, menor que o cenário sem sobra (100)
    expect(withLeftover).toBe(90);
  });

  it("descarte reduz o volume efetivamente usado, assim como a sobra", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 400,
      preparedQuantity: 600,
      dilutionRatio: 5,
      leftoverReused: null,
      discarded: 60,
    });
    expect(result).toBe(90);
  });

  it("solução preparada sem diluição informada (produto puro em lote) usa o volume efetivo direto", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 700,
      preparedQuantity: 300,
      dilutionRatio: null,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(300);
  });

  it("nunca mistura o método de medição direta com o de solução preparada — prepared tem prioridade quando informado", () => {
    const result = calculateConcentrateConsumed({
      quantityBefore: 1000,
      quantityAfter: 999, // deveria ser ignorado, já que preparedQuantity foi informado
      preparedQuantity: 600,
      dilutionRatio: 5,
      leftoverReused: null,
      discarded: null,
    });
    expect(result).toBe(100);
  });
});
