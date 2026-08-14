import { describe, expect, it } from "vitest";
import {
  computeCountDifference,
  convertToBaseUnit,
  estimateQuantityFromPackages,
  friendlyUnitOptionsFor,
  requiresLargeDifferenceConfirmation,
} from "@/lib/inventory/count-input-helpers";

describe("friendlyUnitOptionsFor / convertToBaseUnit — Missão de UI Operacional de Contagem V1, seção 9/24", () => {
  it("contagem direta em ml (item já cadastrado em ml)", () => {
    expect(convertToBaseUnit(3250, "ml", "ml")).toBe(3250);
  });

  it("contagem em L → convertida para ml (base do item)", () => {
    expect(friendlyUnitOptionsFor("ml")).toContain("L");
    expect(convertToBaseUnit(3.25, "L", "ml")).toBe(3250);
  });

  it("contagem em g (item cadastrado em g)", () => {
    expect(convertToBaseUnit(65, "g", "g")).toBe(65);
  });

  it("contagem em kg → convertida para g", () => {
    expect(convertToBaseUnit(0.065, "kg", "g")).toBe(65);
  });

  it("unidade (item cadastrado em 'unidade') não oferece nenhuma conversão", () => {
    expect(friendlyUnitOptionsFor("unidade")).toEqual(["unidade"]);
    expect(convertToBaseUnit(4, "unidade", "unidade")).toBe(4);
  });

  it("nunca converte ml para g ou vice-versa — sem relação de densidade conhecida", () => {
    expect(convertToBaseUnit(100, "g", "ml")).toBeNull();
    expect(convertToBaseUnit(100, "ml", "g")).toBeNull();
  });
});

describe("estimateQuantityFromPackages — Missão de UI Operacional de Contagem V1, seção 10/11/24", () => {
  it("embalagem fechada + fração aberta calcula aproximadamente", () => {
    // exemplo da missão: V-Floc, embalagem 1,5 L, 2 fechadas + 50% aberta = 3,75 L
    const result = estimateQuantityFromPackages(2, "50", 1.5);
    expect(result).toBe(3.75);
  });

  it("embalagem vazia soma só as fechadas", () => {
    expect(estimateQuantityFromPackages(3, "vazia", 1.5)).toBe(4.5);
  });

  it("25%", () => {
    expect(estimateQuantityFromPackages(0, "25", 1.5)).toBe(0.375);
  });

  it("75%", () => {
    expect(estimateQuantityFromPackages(0, "75", 1.5)).toBe(1.125);
  });

  it("embalagem cheia soma como uma fechada a mais", () => {
    expect(estimateQuantityFromPackages(1, "cheia", 1.5)).toBe(3);
  });

  it("produto sem embalagem cadastrada (packageCapacity null) não oferece cálculo por fração", () => {
    expect(estimateQuantityFromPackages(2, "50", null)).toBeNull();
  });
});

describe("computeCountDifference / requiresLargeDifferenceConfirmation — Missão, seção 13/24", () => {
  it("diferença pequena não exige confirmação", () => {
    const diff = computeCountDifference(5000, 4900);
    expect(diff.absolute).toBe(-100);
    expect(requiresLargeDifferenceConfirmation(5000, 4900)).toBe(false);
  });

  it("diferença >= 50% exige confirmação — exemplo da missão: 5,0 L para 1,0 L (-80%)", () => {
    expect(requiresLargeDifferenceConfirmation(5, 1)).toBe(true);
    const diff = computeCountDifference(5, 1);
    expect(diff.percentage).toBe(-80);
  });

  it("exatamente 50% já exige confirmação (limiar inclusivo)", () => {
    expect(requiresLargeDifferenceConfirmation(1000, 500)).toBe(true);
  });

  it("saldo anterior zero com contagem não-zero sempre exige confirmação", () => {
    expect(requiresLargeDifferenceConfirmation(0, 100)).toBe(true);
  });

  it("saldo anterior zero e contagem zero não exige confirmação", () => {
    expect(requiresLargeDifferenceConfirmation(0, 0)).toBe(false);
  });
});
