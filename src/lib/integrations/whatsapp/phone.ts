/**
 * Missão Z6.2 — normalização de telefone brasileiro para E.164 (formato exigido pela WhatsApp
 * Cloud API da Meta, ex.: "+5511999998888"). Pura, sem I/O — nunca inventa um número: qualquer
 * entrada que não corresponda de forma inequívoca a um telefone brasileiro válido devolve `null`,
 * nunca uma melhor tentativa.
 */

/** DDDs válidos hoje no Brasil (lista oficial Anatel) — nunca aceitar um DDD fora desta lista. */
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Aceita variações comuns de entrada ("(11) 99999-8888", "+55 11 99999-8888", "5511999998888",
 * "11999998888") e devolve sempre `+55DDDNUMERO` ou `null` quando não for possível validar com
 * segurança. Celular (9 dígitos) precisa começar com "9"; fixo (8 dígitos) é aceito sem essa
 * exigência. Nunca aceita DDD fora da lista oficial.
 */
export function normalizeBrazilianPhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let rest = digits;
  if (rest.startsWith("55") && (rest.length === 12 || rest.length === 13)) {
    rest = rest.slice(2);
  }

  if (rest.length !== 10 && rest.length !== 11) return null;

  const ddd = Number.parseInt(rest.slice(0, 2), 10);
  const number = rest.slice(2);
  if (!VALID_DDDS.has(ddd)) return null;

  if (number.length === 9) {
    if (number[0] !== "9") return null;
  } else if (number.length !== 8) {
    return null;
  }

  return `+55${ddd}${number}`;
}

/** Só a validade — usado onde só interessa saber se um valor já é um telefone brasileiro utilizável, sem precisar do valor normalizado. */
export function isValidBrazilianPhone(raw: string | null | undefined): boolean {
  return normalizeBrazilianPhoneToE164(raw) !== null;
}
