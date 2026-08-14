import { normalizeName } from "@/lib/crm/normalize";

/**
 * Missão CRM V2 Fase 2 — classificação e comparação de valores de telefone/placa que podem estar
 * completos, mascarados (herança da máscara aplicada pelo próprio sistema antes da Missão CRM V2
 * Fase 1 — ver `src/lib/utils/mask.ts`), parcialmente preenchidos ou ausentes.
 *
 * Formatos abaixo confirmados por auditoria read-only contra os 2.132 `jumppark_service_orders`
 * reais (Fase 2, seção 3):
 *   telefone: null (1.665) | "*******" sem dígito real (55) | "*******XX" com 2 dígitos reais (412)
 *   — nenhum outro formato encontrado (nenhum telefone completo, nenhum parcial "solto").
 *   placa: null (5) | "XX***YY" com 4 caracteres reais (2.127) — nenhum outro formato encontrado
 *   (nunca "***" puro, nunca o literal "Não informado" de `maskPlate`, nunca placa completa).
 * PARTIAL existe só como categoria reservada para dado real incompleto (ex.: atendente digitou só
 * parte do telefone/placa) — nenhum exemplo real foi encontrado na auditoria; a classificação
 * abaixo ainda a produz de forma sã (dígitos/caracteres reais abaixo do mínimo esperado, sem o
 * padrão de máscara), sem inventar um formato que os dados atuais não sustentam.
 */

export type ValueClassification = "FULL" | "MASKED" | "PARTIAL" | "MISSING" | "INVALID";

const PHONE_MASK_WITH_SUFFIX = /^\*{7}(\d{2})$/;
const PHONE_MASK_EMPTY = /^\*{7}$/;
/** Mesmo limiar de `normalizePhone` (crm/normalize.ts) — abaixo disso não é telefone plausível. */
const MIN_FULL_PHONE_DIGITS = 8;

export interface PhoneEvidence {
  classification: ValueClassification;
  /** Só quando FULL. */
  fullDigits: string | null;
  /** Últimos 2 dígitos conhecidos — presentes quando FULL (derivado) ou MASKED com sufixo real. */
  knownSuffix: string | null;
}

/** Classifica um valor de telefone bruto (como persistido), sem normalizar antes — a normalização destruiria o padrão de máscara. */
export function classifyPhoneValue(raw: string | null | undefined): PhoneEvidence {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { classification: "MISSING", fullDigits: null, knownSuffix: null };

  const maskedWithSuffix = trimmed.match(PHONE_MASK_WITH_SUFFIX);
  if (maskedWithSuffix) return { classification: "MASKED", fullDigits: null, knownSuffix: maskedWithSuffix[1] };
  if (PHONE_MASK_EMPTY.test(trimmed)) return { classification: "MASKED", fullDigits: null, knownSuffix: null };
  // Contém asterisco mas não bate com nenhum dos 2 formatos reais confirmados — não inventa
  // interpretação, marca INVALID para ficar visível caso a máscara real mude de formato no futuro.
  if (trimmed.includes("*")) return { classification: "INVALID", fullDigits: null, knownSuffix: null };

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return { classification: "INVALID", fullDigits: null, knownSuffix: null };
  if (digits.length >= MIN_FULL_PHONE_DIGITS) return { classification: "FULL", fullDigits: digits, knownSuffix: digits.slice(-2) };
  return { classification: "PARTIAL", fullDigits: null, knownSuffix: null };
}

const PLATE_MASK = /^([A-Z0-9]{2})\*{3}([A-Z0-9]{2})$/;
const PLATE_MASK_EMPTY = /^\*{3}$/;
const PLATE_NOT_INFORMED_LITERAL = "NÃO INFORMADO";
/** Placa Mercosul (ABC1D23) ou padrão antigo (ABC1234) — 3 letras, dígito, (letra ou dígito), 2 dígitos. */
const FULL_PLATE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export interface PlateEvidence {
  classification: ValueClassification;
  /** Só quando FULL — placa normalizada (maiúscula, sem espaço/hífen). */
  fullPlate: string | null;
  /** 2 primeiros e 2 últimos caracteres conhecidos — presentes quando FULL (derivado) ou MASKED com ambos. */
  knownPrefix: string | null;
  knownSuffix: string | null;
}

export function classifyPlateValue(raw: string | null | undefined): PlateEvidence {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { classification: "MISSING", fullPlate: null, knownPrefix: null, knownSuffix: null };

  const upper = trimmed.toUpperCase();
  if (upper === PLATE_NOT_INFORMED_LITERAL) return { classification: "MISSING", fullPlate: null, knownPrefix: null, knownSuffix: null };

  const masked = upper.match(PLATE_MASK);
  if (masked) return { classification: "MASKED", fullPlate: null, knownPrefix: masked[1], knownSuffix: masked[2] };
  if (PLATE_MASK_EMPTY.test(upper)) return { classification: "MASKED", fullPlate: null, knownPrefix: null, knownSuffix: null };
  if (upper.includes("*")) return { classification: "INVALID", fullPlate: null, knownPrefix: null, knownSuffix: null };

  const compact = upper.replace(/[\s-]/g, "");
  if (FULL_PLATE.test(compact)) return { classification: "FULL", fullPlate: compact, knownPrefix: compact.slice(0, 2), knownSuffix: compact.slice(-2) };
  if (/^[A-Z0-9]+$/.test(compact) && compact.length > 0 && compact.length < 7) {
    return { classification: "PARTIAL", fullPlate: null, knownPrefix: null, knownSuffix: null };
  }
  return { classification: "INVALID", fullPlate: null, knownPrefix: null, knownSuffix: null };
}

export type EvidenceVerdict = "match" | "mismatch" | "unknown";
export type EvidenceStrength = "weak" | "moderate" | "strong";

export interface ComparisonResult {
  verdict: EvidenceVerdict;
  /** Só significativo quando `verdict !== "unknown"`. */
  strength: EvidenceStrength;
}

function phoneSuffix(e: PhoneEvidence): string | null {
  if (e.classification === "FULL") return e.knownSuffix;
  if (e.classification === "MASKED") return e.knownSuffix;
  return null;
}

/**
 * Telefone completo × completo é o único caso "strong" positivo (dado determinístico). Qualquer
 * comparação que dependa só dos 2 últimos dígitos (telefone mascarado de um ou dos dois lados) é
 * "weak" quando bate — a auditoria real encontrou grupos de até 24 nomes distintos compartilhando
 * o mesmo sufixo de 2 dígitos por pura colisão (100 combinações possíveis para centenas de
 * pedidos) — e "strong" quando NÃO bate, porque um sufixo conhecido divergente é contradição
 * determinística (o mesmo número sempre produz o mesmo sufixo).
 */
export function comparePhoneValues(a: PhoneEvidence, b: PhoneEvidence): ComparisonResult {
  if (a.classification === "FULL" && b.classification === "FULL") {
    return { verdict: a.fullDigits === b.fullDigits ? "match" : "mismatch", strength: "strong" };
  }
  const suffixA = phoneSuffix(a);
  const suffixB = phoneSuffix(b);
  if (suffixA && suffixB) {
    return suffixA === suffixB ? { verdict: "match", strength: "weak" } : { verdict: "mismatch", strength: "strong" };
  }
  return { verdict: "unknown", strength: "weak" };
}

function plateKnownChars(e: PlateEvidence): { prefix: string; suffix: string } | null {
  if (e.knownPrefix && e.knownSuffix) return { prefix: e.knownPrefix, suffix: e.knownSuffix };
  return null;
}

/**
 * Placa completa × completa é "strong" positivo. Placa mascarada expõe 4 caracteres reais (2+2,
 * bem mais informativo que os 2 dígitos do telefone) — bater é "moderate" (não conclusivo sozinho:
 * a auditoria real ainda achou 19 placas mascaradas associadas a 2+ nomes distintos). Qualquer
 * caractere conhecido divergente é "strong" negativo — contradição determinística.
 */
export function comparePlateValues(a: PlateEvidence, b: PlateEvidence): ComparisonResult {
  if (a.classification === "FULL" && b.classification === "FULL") {
    return { verdict: a.fullPlate === b.fullPlate ? "match" : "mismatch", strength: "strong" };
  }
  const knownA = plateKnownChars(a);
  const knownB = plateKnownChars(b);
  if (knownA && knownB) {
    const matches = knownA.prefix === knownB.prefix && knownA.suffix === knownB.suffix;
    return matches ? { verdict: "match", strength: "moderate" } : { verdict: "mismatch", strength: "strong" };
  }
  return { verdict: "unknown", strength: "weak" };
}

/** Nome é evidência, nunca identidade — normalização conservadora (trim/case/espaços), sem heurística de acento/fuzzy. */
export function compareNames(a: string | null | undefined, b: string | null | undefined): EvidenceVerdict {
  const na = normalizeName(a)?.toLowerCase() ?? null;
  const nb = normalizeName(b)?.toLowerCase() ?? null;
  if (!na || !nb) return "unknown";
  return na === nb ? "match" : "mismatch";
}

/**
 * Modelo de veículo — evidência auxiliar fraca. Normalização conservadora (trim/case/espaços), sem
 * substring/fuzzy: a auditoria real mostrou formatos inconsistentes na base ("HB20" sem marca,
 * "CHEVROLET ONIX" com marca, "TCROSS VOLKSWAGEN" com ordem invertida) — comparar por "contains"
 * juntaria modelos genuinamente diferentes por coincidência de substring.
 */
export function compareModels(a: string | null | undefined, b: string | null | undefined): EvidenceVerdict {
  const na = a?.trim().toUpperCase().replace(/\s+/g, " ") || null;
  const nb = b?.trim().toUpperCase().replace(/\s+/g, " ") || null;
  if (!na || !nb) return "unknown";
  return na === nb ? "match" : "mismatch";
}

/**
 * Missão CRM V2 Final (regra especial dos clientes sem telefone) — classificação DERIVADA (nunca
 * persistida — nenhuma coluna/enum novo) da base de identificação disponível para um cliente.
 * Clientes que nunca tiveram telefone informado na origem (11/226 confirmados na Fase 2) não são
 * descartados: continuam válidos, identificados por veículo/nome/histórico. Se um telefone novo
 * aparecer no futuro (novo atendimento, nova sincronização), ele volta a contar como evidência —
 * esta função só reflete o estado ATUAL, nunca decide identidade sozinha.
 */
export type CustomerIdentityBasis = "telefone" | "veiculo_sem_telefone" | "sem_evidencia";

export function deriveCustomerIdentityBasis(phone: string | null | undefined, hasVehicle: boolean): CustomerIdentityBasis {
  const phoneEvidence = classifyPhoneValue(phone);
  const hasUsablePhoneSignal =
    phoneEvidence.classification === "FULL" || (phoneEvidence.classification === "MASKED" && phoneEvidence.knownSuffix !== null);
  if (hasUsablePhoneSignal) return "telefone";
  return hasVehicle ? "veiculo_sem_telefone" : "sem_evidencia";
}
