import { normalizePhone, normalizePlate } from "@/lib/crm/normalize";

/**
 * Normalização pura de busca — reaproveita `crm/normalize.ts` (já usado pelo domínio
 * operacional) em vez de reimplementar. Nunca decide sozinha se é telefone ou placa: o chamador
 * tenta as duas normalizações e busca por ambas (telefone tem só dígito, placa tem letra).
 */
export function looksLikePhone(query: string): boolean {
  return normalizePhone(query) !== null && !/[a-zA-Z]/.test(query);
}

/** Placas reais têm pelo menos 7 caracteres (Mercosul ou formato antigo) — evita buscar a cada letra digitada. */
const MIN_PLATE_LENGTH = 7;

/** Toda placa real brasileira mistura letra e número (ABC1234 ou ABC1D23) — só letras é nome/modelo, nunca placa. */
export function looksLikePlate(query: string): boolean {
  const normalized = normalizePlate(query);
  return normalized !== null && normalized.length >= MIN_PLATE_LENGTH && /[a-zA-Z]/.test(query) && /\d/.test(query);
}

export { normalizePhone, normalizePlate };

/** Teto de resultados para busca livre por nome/veículo — mantém a Home rápida mesmo com base grande. */
export const SEARCH_RESULT_LIMIT = 8;
