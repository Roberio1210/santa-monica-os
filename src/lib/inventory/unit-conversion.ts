import type { InventoryUnit } from "@/lib/inventory/types";

/**
 * Conversão de embalagem de compra → unidade-base do produto mestre (Missão 23). Mesma regra de
 * fator fixo já usada na contagem inicial (`docs/database-architecture.md`, seção "Migração do
 * estoque"): litro→ml e quilo→g por um fator fixo de 1000 — nunca peso↔volume, nunca inventado.
 * Unidades reconhecidas: as mesmas 4 unidades-base já em uso pelos 65 produtos reais (ml, g,
 * unidade, caixa) mais as variantes de embalagem (L, kg) que só existem em notas de compra, nunca
 * como unidade de um item já cadastrado.
 */
interface UnitConversion {
  baseUnit: InventoryUnit;
  /** Quantas unidades-base equivalem a 1 unidade do texto reconhecido (ex.: "L" → 1000 ml). */
  factor: number;
}

const RECOGNIZED_UNITS: Record<string, UnitConversion> = {
  ml: { baseUnit: "ml", factor: 1 },
  mililitro: { baseUnit: "ml", factor: 1 },
  mililitros: { baseUnit: "ml", factor: 1 },
  l: { baseUnit: "ml", factor: 1000 },
  lt: { baseUnit: "ml", factor: 1000 },
  litro: { baseUnit: "ml", factor: 1000 },
  litros: { baseUnit: "ml", factor: 1000 },
  g: { baseUnit: "g", factor: 1 },
  grama: { baseUnit: "g", factor: 1 },
  gramas: { baseUnit: "g", factor: 1 },
  kg: { baseUnit: "g", factor: 1000 },
  quilo: { baseUnit: "g", factor: 1000 },
  quilos: { baseUnit: "g", factor: 1000 },
  unidade: { baseUnit: "unidade", factor: 1 },
  unidades: { baseUnit: "unidade", factor: 1 },
  un: { baseUnit: "unidade", factor: 1 },
  und: { baseUnit: "unidade", factor: 1 },
  pc: { baseUnit: "unidade", factor: 1 },
  peca: { baseUnit: "unidade", factor: 1 },
  pecas: { baseUnit: "unidade", factor: 1 },
  caixa: { baseUnit: "caixa", factor: 1 },
  caixas: { baseUnit: "caixa", factor: 1 },
  cx: { baseUnit: "caixa", factor: 1 },
};

function normalizeUnitToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** `null` quando a unidade não é reconhecida — nunca adivinha (ex.: "m"/metros, pedido pela missão mas sem produto real que use — ver relatório final). */
export function resolveUnitConversion(rawUnit: string): UnitConversion | null {
  const normalized = normalizeUnitToken(rawUnit);
  return RECOGNIZED_UNITS[normalized] ?? null;
}

export interface PackageConversionResult {
  baseUnit: InventoryUnit;
  /** packageCount × quantityPerPackage, já na unidade-base. */
  totalQuantity: number;
}

/**
 * Converte "N embalagens de X ml/kg/etc." para a unidade-base — a fórmula literal do exemplo da
 * missão (1×500ml + 1×1,5L + 1×3L = 5.000ml). `null` quando a unidade da embalagem não é
 * reconhecida, ou quando as quantidades não são números válidos e positivos.
 */
export function convertPackageToBaseUnit(packageUnit: string, quantityPerPackage: number, packageCount: number): PackageConversionResult | null {
  if (!Number.isFinite(quantityPerPackage) || quantityPerPackage <= 0) return null;
  if (!Number.isFinite(packageCount) || packageCount <= 0) return null;

  const conversion = resolveUnitConversion(packageUnit);
  if (!conversion) return null;

  return {
    baseUnit: conversion.baseUnit,
    totalQuantity: round3(quantityPerPackage * conversion.factor * packageCount),
  };
}

/** Duas unidades-base só são compatíveis quando são exatamente a mesma — nunca converte peça↔volume↔massa. */
export function areBaseUnitsCompatible(a: InventoryUnit, b: InventoryUnit): boolean {
  return a === b;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
