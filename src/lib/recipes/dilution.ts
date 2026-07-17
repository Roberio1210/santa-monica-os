/**
 * Cálculo do concentrado realmente consumido — nunca confunde volume da solução preparada com
 * produto concentrado (SPRINT ESTOQUE INTELIGENTE 2.0, Fase B, seção 4).
 */

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface ConcentrateInput {
  /** Quantidade do produto concentrado na embalagem antes do uso. */
  quantityBefore: number;
  /** Quantidade do produto concentrado na embalagem depois do uso. */
  quantityAfter: number;
  /** Volume/peso da solução diluída preparada, quando o método de medição foi por diluição. Null = medição direta na embalagem. */
  preparedQuantity: number | null;
  /** Partes de água por parte de produto (1:5 → 5). Null = produto puro / sem diluição. */
  dilutionRatio: number | null;
  /** Parte da solução preparada guardada para reaproveitamento futuro — nunca contada como consumida. */
  leftoverReused: number | null;
  /** Parte da solução preparada descartada sem uso — conta como consumida (perda), não como "aplicada no carro", mas ainda assim saiu do concentrado. */
  discarded: number | null;
}

/**
 * Duas formas de medir, nunca misturadas na mesma amostra:
 *
 * 1) Medição direta na embalagem do concentrado (preparedQuantity null):
 *    concentrado consumido = quantityBefore - quantityAfter.
 *
 * 2) Solução diluída preparada (preparedQuantity informado):
 *    volume efetivamente usado = preparedQuantity - leftoverReused - discarded;
 *    concentrado consumido = volume efetivamente usado / (1 + dilutionRatio), ou o próprio
 *    volume efetivamente usado quando dilutionRatio é null (produto puro preparado em lote).
 */
export function calculateConcentrateConsumed(input: ConcentrateInput): number {
  if (input.preparedQuantity !== null) {
    const effectiveUsed = input.preparedQuantity - (input.leftoverReused ?? 0) - (input.discarded ?? 0);
    const divisor = input.dilutionRatio !== null ? 1 + input.dilutionRatio : 1;
    return round3(effectiveUsed / divisor);
  }
  return round3(input.quantityBefore - input.quantityAfter);
}
