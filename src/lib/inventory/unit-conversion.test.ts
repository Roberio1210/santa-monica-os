import { describe, expect, it } from "vitest";
import { areBaseUnitsCompatible, convertPackageToBaseUnit, resolveUnitConversion } from "@/lib/inventory/unit-conversion";

describe("resolveUnitConversion", () => {
  it("reconhece variações de litro e converte para ml com fator 1000", () => {
    expect(resolveUnitConversion("L")).toEqual({ baseUnit: "ml", factor: 1000 });
    expect(resolveUnitConversion("litros")).toEqual({ baseUnit: "ml", factor: 1000 });
    expect(resolveUnitConversion("Lt")).toEqual({ baseUnit: "ml", factor: 1000 });
  });

  it("reconhece variações de quilo e converte para g com fator 1000", () => {
    expect(resolveUnitConversion("kg")).toEqual({ baseUnit: "g", factor: 1000 });
    expect(resolveUnitConversion("Quilos")).toEqual({ baseUnit: "g", factor: 1000 });
  });

  it("ml e g já são a própria unidade-base (fator 1)", () => {
    expect(resolveUnitConversion("ml")).toEqual({ baseUnit: "ml", factor: 1 });
    expect(resolveUnitConversion("g")).toEqual({ baseUnit: "g", factor: 1 });
  });

  it("nunca adivinha uma unidade não reconhecida (ex.: metros, sem produto real que use)", () => {
    expect(resolveUnitConversion("m")).toBeNull();
    expect(resolveUnitConversion("metros")).toBeNull();
    expect(resolveUnitConversion("qualquer-coisa")).toBeNull();
  });
});

describe("convertPackageToBaseUnit", () => {
  it("exemplo literal da missão: 500ml + 1,5L + 3L = 5.000ml (embalagens separadas, somadas fora desta função)", () => {
    const p1 = convertPackageToBaseUnit("ml", 500, 1);
    const p2 = convertPackageToBaseUnit("L", 1.5, 1);
    const p3 = convertPackageToBaseUnit("L", 3, 1);
    expect(p1?.totalQuantity).toBe(500);
    expect(p2?.totalQuantity).toBe(1500);
    expect(p3?.totalQuantity).toBe(3000);
    const total = (p1?.totalQuantity ?? 0) + (p2?.totalQuantity ?? 0) + (p3?.totalQuantity ?? 0);
    expect(total).toBe(5000);
  });

  it("multiplica por quantidade de embalagens (N embalagens do mesmo tamanho)", () => {
    const result = convertPackageToBaseUnit("kg", 5, 3);
    expect(result).toEqual({ baseUnit: "g", totalQuantity: 15000 });
  });

  it("retorna null para unidade de embalagem não reconhecida — nunca adivinha", () => {
    expect(convertPackageToBaseUnit("metros", 10, 1)).toBeNull();
  });

  it("retorna null para quantidade ou contagem inválida", () => {
    expect(convertPackageToBaseUnit("ml", 0, 1)).toBeNull();
    expect(convertPackageToBaseUnit("ml", 500, 0)).toBeNull();
    expect(convertPackageToBaseUnit("ml", -100, 1)).toBeNull();
  });
});

describe("areBaseUnitsCompatible", () => {
  it("só a mesma unidade-base é compatível — nunca converte peça↔volume↔massa", () => {
    expect(areBaseUnitsCompatible("ml", "ml")).toBe(true);
    expect(areBaseUnitsCompatible("ml", "g")).toBe(false);
    expect(areBaseUnitsCompatible("unidade", "caixa")).toBe(false);
  });
});
