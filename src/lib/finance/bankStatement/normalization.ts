/**
 * Missão Financeiro V2.2 (Fase B) — normalização pura de descrições do extrato para permitir
 * agrupamento/comparação. NUNCA substitui a descrição original (`BankStatementLine.description`
 * continua intocada em todo o sistema) — só uma visão derivada, sempre recomputável, nunca
 * persistida como fonte da verdade.
 */

// Ruído técnico do próprio extrato Stone (rótulos de UI, não informação sobre a transação).
const NOISE_TOKENS = [
  /transfer[eê]ncia\s*\|\s*pix/gi,
  /pix\s*\|\s*maquininha/gi,
  /antecipa[cç][aã]o\s*\|\s*cr[eé]dito/gi,
  /devolu[cç][aã]o\s*\|\s*pix/gi,
  /recebimento\s+vendas?/gi,
  /stone institui[cç][aã]o de pagamento\s*s\.?a\.?/gi,
  /stone institui[cç][aã]o de/gi,
  /pagamento\s+s\.?a\.?/gi,
  /ag:\s*\d+\s*[•·]\s*cc:\s*[\d-]+/gi,
  // Missão Financeiro V2.5 (achado técnico) — o `\b` final depois de um "." OPCIONAL nunca bate
  // quando o próximo caractere real também não é letra/número (ex.: espaço): "LTDA." seguido de
  // espaço tem duas transições não-palavra em sequência ("." -> " "), então `\b` falha ali e o
  // regex recua para NÃO consumir o ponto, deixando um "." solto sobrando (ex.: "LTDA. / ..." ->
  // "." em vez de ""). Troca `\b` final por `(?![a-z])` — mesma proteção contra falso-positivo
  // no meio de palavra (nunca casa "SA" dentro de "SANEAMENTO", já que o "N" seguinte é letra),
  // mas sem exigir uma transição de fronteira que pontuação seguida de espaço nunca cumpre.
  /\bltda\.?(?![a-z])/gi,
  /\bs\.?a\.?(?![a-z])/gi,
  /\bme\b/gi,
  /\beireli\b/gi,
  /\bepp\b/gi,
];

/** Sufixos legais removidos só para efeito de COMPARAÇÃO (nunca alteram a descrição original armazenada). */
function stripLegalSuffixes(text: string): string {
  return text
    .replace(/\bltda\.?\b/gi, "")
    .replace(/\bs\.?a\.?\b/gi, "")
    .replace(/\bcomercio\b/gi, "")
    .replace(/\bcomercio de\b/gi, "")
    .replace(/\bindustria\b/gi, "")
    .replace(/\bservicos?\b/gi, "")
    .replace(/\bdistribuicao\b/gi, "");
}

function normalizeAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Descrição normalizada: maiúsculas, sem acento, sem pontuação irrelevante, sem os rótulos
 * técnicos do extrato Stone, espaços colapsados. Preserva nomes/números que carregam informação
 * real (CNPJ, código de cliente etc.) — nunca remove o que pode ajudar a identificar a
 * contraparte.
 */
export function normalizeDescription(original: string): string {
  let text = original;
  for (const pattern of NOISE_TOKENS) text = text.replace(pattern, " ");
  text = normalizeAccents(text).toUpperCase();
  text = text.replace(/[/|•·]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Extrai um "nome candidato" de contraparte a partir da descrição normalizada — usado para
 * agrupamento e comparação com fornecedores/parceiros cadastrados. Puramente heurístico: nunca é
 * tratado como identidade confirmada, só como chave de agrupamento (Fase C) e evidência (Fase D).
 */
export function extractCounterpartyKey(original: string): string {
  const normalized = normalizeDescription(original);
  // remove tokens puramente numéricos curtos (fragmentos de CPF/CNPJ truncados, códigos) que
  // atrapalham o agrupamento por nome — mas preserva o restante.
  const withoutLoneNumbers = normalized
    .split(" ")
    .filter((token) => !/^\d+$/.test(token) || token.length > 8)
    .join(" ")
    .trim();
  // Missão Financeiro V2.5 (achado técnico) — rede de segurança final: nenhum token composto só
  // de pontuação (ex.: um "." sobrando de um sufixo legal mal removido) nunca vira, sozinho, uma
  // "contraparte" — sempre tratado como ausência de nome (nunca contraparte fabricada a partir de
  // ruído de pontuação).
  const withPunctuationOnlyTokensStripped = (withoutLoneNumbers || normalized)
    .split(" ")
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .join(" ")
    .trim();
  return withPunctuationOnlyTokensStripped;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** `needle` aparece em `haystack` como sequência de PALAVRAS INTEIRAS e contíguas — nunca como substring dentro de uma palavra maior (ex.: "CASAN" nunca "encontrado" dentro de "CASANOVA"). */
function containsAsWordSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

/**
 * Compara um nome de contraparte extraído contra um nome cadastrado (fornecedor/parceiro),
 * tolerante a sufixo legal e acento/caixa — nunca aproxima além disso. Missão Financeiro V2.2
 * (item 7A, caso real): "ELANA CASANOVA" NUNCA pode bater com o fornecedor "CASAN" só porque a
 * substring "CASAN" aparece dentro da palavra "CASANOVA" — por isso a comparação de "contains" é
 * sempre por PALAVRA INTEIRA (tokenizada), nunca por substring bruta de caracteres.
 */
export function counterpartyMatchesRegisteredName(counterpartyKey: string, registeredName: string): "exact" | "contains" | "none" {
  const a = normalizeAccents(stripLegalSuffixes(counterpartyKey)).toUpperCase().replace(/\s+/g, " ").trim();
  const b = normalizeAccents(stripLegalSuffixes(registeredName)).toUpperCase().replace(/\s+/g, " ").trim();
  if (!a || !b) return "none";
  if (a === b) return "exact";
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (containsAsWordSequence(aTokens, bTokens) || containsAsWordSequence(bTokens, aTokens)) return "contains";
  return "none";
}
