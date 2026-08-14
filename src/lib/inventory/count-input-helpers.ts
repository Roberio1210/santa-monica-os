import { resolveUnitConversion } from "@/lib/inventory/unit-conversion";
import type { InventoryUnit } from "@/lib/inventory/types";

/**
 * Missão de UI Operacional de Contagem de Estoque V1 — núcleo puro (sem I/O, sem React) para a
 * usabilidade da tela de contagem: unidades amigáveis, estimativa por embalagem+fração, e o
 * limiar de confirmação de diferença grande. Nada aqui escreve em lugar nenhum — só matemática
 * determinística, testável com números simples.
 *
 * A conversão numérica reaproveita `resolveUnitConversion` (Missão 23, já usada na importação de
 * compras) — mesma tabela de fatores (L/ml e kg/g = 1000×), nunca uma segunda tabela paralela.
 */

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Unidades amigáveis oferecidas para digitar a contagem de um item, conforme sua unidade-base.
 * Só pares com relação numérica CONHECIDA e seguros (1 L = 1000 ml, 1 kg = 1000 g) — nunca
 * ml↔g (densidade desconhecida) nem nada envolvendo "unidade"/"caixa" (sem conversão possível).
 */
export function friendlyUnitOptionsFor(baseUnit: InventoryUnit): InventoryUnit[] {
  if (baseUnit === "ml") return ["ml", "L"];
  if (baseUnit === "L") return ["L", "ml"];
  if (baseUnit === "g") return ["g", "kg"];
  if (baseUnit === "kg") return ["kg", "g"];
  return [baseUnit];
}

/**
 * Converte um valor informado numa unidade amigável para a unidade-base do item. `null` quando a
 * unidade informada NÃO é uma conversão segura da base (nunca converte às cegas).
 */
export function convertToBaseUnit(value: number, fromUnit: InventoryUnit, baseUnit: InventoryUnit): number | null {
  if (fromUnit === baseUnit) return round(value, 3);

  const fromResolved = resolveUnitConversion(fromUnit);
  const baseResolved = resolveUnitConversion(baseUnit);
  if (!fromResolved || !baseResolved || fromResolved.baseUnit !== baseResolved.baseUnit) return null;

  const inCanonicalUnit = value * fromResolved.factor;
  return round(inCanonicalUnit / baseResolved.factor, 3);
}

export type OpenPackageFraction = "vazia" | "25" | "50" | "75" | "cheia";

export const OPEN_PACKAGE_FRACTIONS: OpenPackageFraction[] = ["vazia", "25", "50", "75", "cheia"];

const OPEN_PACKAGE_FRACTION_VALUE: Record<OpenPackageFraction, number> = {
  vazia: 0,
  "25": 0.25,
  "50": 0.5,
  "75": 0.75,
  cheia: 1,
};

/**
 * Estimativa APROXIMADA de quantidade via "embalagens fechadas + fração da aberta" (Missão,
 * seção 10) — `null` quando `packageCapacity` é desconhecido (nunca inventa volume de
 * embalagem; nesse caso a UI deve oferecer só quantidade direta, ver seção 11). Nunca finge
 * precisão: é sempre rotulada "quantidade aproximada" por quem chama.
 */
export function estimateQuantityFromPackages(closedPackages: number, openFraction: OpenPackageFraction, packageCapacity: number | null): number | null {
  if (packageCapacity === null || packageCapacity <= 0) return null;
  if (closedPackages < 0) return null;
  return round(closedPackages * packageCapacity + OPEN_PACKAGE_FRACTION_VALUE[openFraction] * packageCapacity, 3);
}

export interface CountDifference {
  absolute: number;
  /** null quando o saldo anterior é 0 — percentual não é matematicamente definido nesse caso. */
  percentage: number | null;
}

export function computeCountDifference(previousQuantity: number, countedQuantity: number): CountDifference {
  const absolute = round(countedQuantity - previousQuantity, 3);
  const percentage = previousQuantity !== 0 ? round((absolute / previousQuantity) * 100, 1) : null;
  return { absolute, percentage };
}

/** Missão, seção 13 — limiar documentado (nunca escondido): diferença absoluta em relação ao saldo anterior >= 50%. */
export const LARGE_DIFFERENCE_THRESHOLD_PERCENTAGE = 50;

/**
 * true quando a diferença é grande o bastante para pedir confirmação antes de salvar (nunca
 * bloqueia — só evita erro de digitação, Missão seção 13). Saldo anterior 0 com contagem
 * diferente de 0 sempre pede confirmação (percentual não seria matematicamente definido, mas a
 * mudança é real e vale confirmar).
 */
export function requiresLargeDifferenceConfirmation(previousQuantity: number, countedQuantity: number): boolean {
  if (previousQuantity === 0) return countedQuantity !== 0;
  const percentage = Math.abs(((countedQuantity - previousQuantity) / previousQuantity) * 100);
  return percentage >= LARGE_DIFFERENCE_THRESHOLD_PERCENTAGE;
}
