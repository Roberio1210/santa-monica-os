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

/**
 * Faixa de prefixo (1º dígito do número local, sem DDD e sem o nono dígito) reservada a celular
 * no plano da Anatel — 6 a 9. Fixo usa 2 a 5. É exatamente por a faixa de celular ter ficado sem
 * espaço nessa faixa que o nono dígito foi criado. Usado só para decidir com segurança se um
 * número de 8 dígitos É PROVAVELMENTE um celular sem o nono dígito — nunca para validar telefone
 * em geral (`isValidBrazilianPhone` já aceita fixo de 8 dígitos livremente).
 */
const MOBILE_LOCAL_PREFIX_DIGITS = new Set(["6", "7", "8", "9"]);

/**
 * Nono dígito brasileiro — algumas contas do WhatsApp (cadastradas antes da regra do nono dígito,
 * ou em determinadas operadoras/aparelhos) reportam o número do remetente no formato ANTIGO (8
 * dígitos, sem o "9" inicial do celular) mesmo quando o número comercial/discado hoje tem 9
 * dígitos (achado real: conta do Vinicius Anacleto, DDD 48, entregue pela Meta como
 * `554898161302`, 8 dígitos). `normalizeBrazilianPhoneToE164` aceita as duas formas como válidas
 * DE PROPÓSITO, sem uni-las (nunca inventa um dígito que não veio na entrada) — esta função é o
 * único lugar que conecta as duas formas, e só quando isso é seguro.
 *
 * Devolve a ÚNICA outra representação plausível do mesmo número, nunca uma lista de "talvez", ou
 * `null` quando a equivalência não se aplica com segurança:
 * - `+55DDD9NNNNNNNN` (9 dígitos) -> `+55DDDNNNNNNNN` (remove o "9"), só se o dígito seguinte
 *   estiver em `MOBILE_LOCAL_PREFIX_DIGITS` (celular plausível) — nunca gera um "fixo equivalente".
 * - `+55DDDNNNNNNNN` (8 dígitos) começando em `MOBILE_LOCAL_PREFIX_DIGITS` -> `+55DDD9NNNNNNNN`
 *   (adiciona o "9"). Um fixo de 8 dígitos (prefixo 2-5) NUNCA gera equivalente — fixo não tem
 *   nono dígito para adicionar, nunca "vira celular".
 * - Qualquer forma fora de `+55DDD` + 8/9 dígitos, ou DDD inválido -> `null`.
 *
 * Nunca decide identidade sozinha — quem usa este valor (`matchAdminActorByPhone`) precisa tratar
 * a possibilidade de duas pessoas diferentes colidirem no mesmo identificador equivalente como
 * ambíguo (nunca escolher uma arbitrariamente).
 */
export function brazilianNineDigitEquivalent(phoneE164: string): string | null {
  const match = /^\+55(\d{2})(\d{8,9})$/.exec(phoneE164);
  if (!match) return null;

  const [, ddd, number] = match;
  if (!VALID_DDDS.has(Number.parseInt(ddd, 10))) return null;

  if (number.length === 9) {
    if (number[0] !== "9") return null;
    const withoutNine = number.slice(1);
    if (!MOBILE_LOCAL_PREFIX_DIGITS.has(withoutNine[0])) return null;
    return `+55${ddd}${withoutNine}`;
  }

  if (number.length === 8) {
    if (!MOBILE_LOCAL_PREFIX_DIGITS.has(number[0])) return null;
    return `+55${ddd}9${number}`;
  }

  return null;
}
