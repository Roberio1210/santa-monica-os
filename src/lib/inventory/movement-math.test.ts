import { describe, expect, it } from "vitest";
import { applyMovementDelta } from "@/lib/inventory/movement-math";
import type { MovementType } from "@/lib/inventory/types";

describe("applyMovementDelta", () => {
  it.each<[MovementType, number]>([
    ["entrada", 110],
    ["compra", 110],
    ["ajuste_positivo", 110],
    ["devolucao", 110],
  ])("%s soma a quantidade ao saldo atual", (type, expected) => {
    expect(applyMovementDelta(100, type, 10)).toBe(expected);
  });

  it.each<[MovementType, number]>([
    ["saida", 90],
    ["perda", 90],
    ["consumo_interno", 90],
    ["ajuste_negativo", 90],
    ["avaria", 90],
    ["vencimento", 90],
    ["transferencia", 90],
    ["consumo_teste_calibracao", 90],
  ])("%s subtrai a quantidade do saldo atual", (type, expected) => {
    expect(applyMovementDelta(100, type, 10)).toBe(expected);
  });

  it.each<MovementType>(["ajuste_inventario", "contagem_fisica_inicial", "correcao_inventario"])(
    "%s substitui o saldo pelo valor absoluto recontado, ignorando o saldo anterior",
    (type) => {
      expect(applyMovementDelta(100, type, 42)).toBe(42);
      expect(applyMovementDelta(0, type, 42)).toBe(42);
    },
  );

  it("nunca clampa em zero — uma saída maior que o saldo produz um valor negativo explícito, nunca escondido", () => {
    expect(applyMovementDelta(5, "saida", 10)).toBe(-5);
  });
});
