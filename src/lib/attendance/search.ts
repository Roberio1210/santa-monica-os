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

export function looksLikePlate(query: string): boolean {
  const normalized = normalizePlate(query);
  return normalized !== null && normalized.length >= MIN_PLATE_LENGTH && /[a-zA-Z]/.test(query);
}

export { normalizePhone, normalizePlate };
