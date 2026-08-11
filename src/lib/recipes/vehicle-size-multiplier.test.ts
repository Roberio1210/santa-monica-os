import { describe, expect, it } from "vitest";
import { getVehicleSizeMultiplier } from "@/lib/recipes/vehicle-size-multiplier";

describe("getVehicleSizeMultiplier — porte do veículo (Automação JumpPark → Consumo)", () => {
  it("aplica o multiplicador em etapas sensíveis à área (hatch reduz, SUV/caminhonete aumentam)", () => {
    expect(getVehicleSizeMultiplier("hatch", "pre_lavagem")).toBe(0.9);
    expect(getVehicleSizeMultiplier("sedan", "shampoo")).toBe(1.0);
    expect(getVehicleSizeMultiplier("suv", "vidros")).toBe(1.15);
    expect(getVehicleSizeMultiplier("caminhonete", "protecao_externa")).toBe(1.3);
  });

  it("nunca aplica multiplicador a etapas de quantidade fixa (ex.: pneus)", () => {
    expect(getVehicleSizeMultiplier("suv", "pneus")).toBe(1);
    expect(getVehicleSizeMultiplier("caminhonete", "pneus")).toBe(1);
  });

  it("categoria desconhecida nunca inventa porte — sempre fator 1", () => {
    expect(getVehicleSizeMultiplier("desconhecido", "pre_lavagem")).toBe(1);
    expect(getVehicleSizeMultiplier("desconhecido", "shampoo")).toBe(1);
  });

  it("hatch vs SUV produz consumo diferente na mesma etapa sensível à área", () => {
    const hatch = getVehicleSizeMultiplier("hatch", "shampoo");
    const suv = getVehicleSizeMultiplier("suv", "shampoo");
    expect(suv).toBeGreaterThan(hatch);
  });
});
