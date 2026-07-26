/**
 * Taxonomia de classificação de falha (Sprint 7.1, decisão do usuário) — nunca mais
 * `temporary_failure` genérico para tudo. Cada categoria é atribuída no ponto exato do código
 * onde a causa é conhecida com precisão (`client.ts` para rede/formato, `persistence/importRun.ts`
 * para gravação) — nunca inferida de volta a partir de uma mensagem genérica.
 *
 * Independente do `StoneResultStatus` (6 valores, Z1) — essa taxonomia mais grossa continua
 * intacta em todo o resto do sistema (fatos, UI, `mapError`). Esta é uma camada de diagnóstico
 * adicional, nunca uma substituição.
 */
export type StoneFailureCategory =
  | "no_data_expected"
  | "file_not_published_yet"
  | "temporary_network_failure"
  | "authentication_failure"
  | "insufficient_permission"
  | "invalid_pointer_response"
  | "blob_download_failure"
  | "invalid_content_type"
  | "invalid_gzip"
  | "invalid_xml"
  | "unsupported_layout"
  | "invalid_reference_date"
  | "invalid_request"
  | "upstream_bad_request"
  | "persistence_failure"
  | "unknown_failure";

export type StoneFailureStage =
  | "authentication"
  | "file_request"
  | "pointer_resolution"
  | "blob_download"
  | "decompression"
  | "xml_parsing"
  | "normalization"
  | "persistence";

/** Nunca inclui segredo/query string — só host + path, para diagnóstico seguro. */
export interface StoneFailureDiagnostics {
  stage: StoneFailureStage;
  category: StoneFailureCategory;
  upstreamStatus: number | null;
  responseContentType: string | null;
  attemptCount: number;
  elapsedMs: number;
  sanitizedHost: string | null;
  sanitizedPath: string | null;
}

/** Nunca loga/persiste a URL completa (query string costuma carregar um token SAS — um segredo). */
export function sanitizedUrlParts(url: string): { host: string | null; path: string | null } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return { host: null, path: null };
  }
}

/**
 * `referenceDate` no formato AAAAMMDD. Mesma tolerância de defasagem oficial de publicação do
 * arquivo diário usada em `jumpparkReconciliation.ts` (29h) — mirrorada aqui, nunca importada,
 * para `client.ts` continuar sem depender de camadas de raciocínio superiores.
 */
const FILE_PUBLICATION_LAG_HOURS = 29;

export function isWithinPublicationLag(referenceDateCompact: string, now: Date = new Date()): boolean {
  if (referenceDateCompact.length !== 8) return false;
  const year = Number(referenceDateCompact.slice(0, 4));
  const month = Number(referenceDateCompact.slice(4, 6));
  const day = Number(referenceDateCompact.slice(6, 8));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const requestedDayStart = Date.UTC(year, month - 1, day);
  const hoursSinceDayStart = (now.getTime() - requestedDayStart) / (1000 * 60 * 60);
  return hoursSinceDayStart < FILE_PUBLICATION_LAG_HOURS;
}

/**
 * Classificação de uma falha HTTP no arquivo principal (nunca no blob — ver `classifyBlobHttpFailure`).
 * HTTP 400 nunca é classificado aqui (Sprint 7.2, decisão do usuário — removida a regra fixa
 * `400 → unsupported_layout`): quem chama deve ler o corpo e usar `classifyBadRequestBody` com a
 * evidência real. Se esta função for chamada com 400 mesmo assim, cai honestamente em
 * `unknown_failure` — nunca reintroduz a suposição antiga.
 */
export function classifyFileHttpFailure(status: number, referenceDateCompact: string, now: Date = new Date()): { category: StoneFailureCategory; retryable: boolean } {
  if (status === 401) return { category: "authentication_failure", retryable: false };
  if (status === 403) return { category: "insufficient_permission", retryable: false };
  if (status === 404) return { category: isWithinPublicationLag(referenceDateCompact, now) ? "file_not_published_yet" : "no_data_expected", retryable: false };
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return { category: "temporary_network_failure", retryable: true };
  return { category: "unknown_failure", retryable: false };
}

/** Falha HTTP ao baixar o blob (URL pré-assinada) — 401/403/404 aqui tipicamente significa SAS expirado/inválido, nunca confundido com autenticação da própria Stone. */
export function classifyBlobHttpFailure(status: number): { category: StoneFailureCategory; retryable: boolean } {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return { category: "blob_download_failure", retryable: true };
  return { category: "blob_download_failure", retryable: false };
}

/**
 * Corpo de uma resposta de erro (não-2xx) já capturado (Sprint 7.2, decisão do usuário) — nunca
 * inclui Authorization/API key/URL assinada. `bodyPreview` já vem sanitizado e limitado a
 * `MAX_ERROR_BODY_BYTES`.
 */
export interface StoneErrorBodyEvidence {
  contentType: string | null;
  bodyPreview: string;
  upstreamErrorCode: string | null;
  upstreamMessage: string | null;
  truncated: boolean;
}

/** Nunca mais que isto é interpretado/guardado do corpo de um erro — arquivo financeiro nunca aparece aqui (é sempre um corpo de erro pequeno, não o arquivo de conciliação). */
export const MAX_ERROR_BODY_BYTES = 8 * 1024;

const MESSAGE_FIELD_CANDIDATES = ["message", "Message", "error", "Error", "errorMessage", "ErrorMessage", "detail", "Detail", "title", "Title", "description", "Description", "reason", "Reason"];
const CODE_FIELD_CANDIDATES = ["code", "Code", "errorCode", "ErrorCode", "error_code", "type", "Type"];

function firstStringField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Redige qualquer padrão que pareça credencial/token/assinatura/URL com query string antes de guardar ou logar. */
function sanitizeErrorText(text: string): string {
  return text
    .replace(/authorization\s*[:=]\s*\S+(\s+\S+)?/gi, "authorization=[REDACTED]")
    .replace(/\b(basic|bearer)\s+[a-z0-9+/=_.-]{8,}/gi, "$1 [REDACTED]")
    .replace(/[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/(sig|signature|token|apikey|api_key)=[^&\s"']+/gi, "$1=[REDACTED]")
    .replace(/(https?:\/\/[^\s"'?]+)\?[^\s"']+/gi, "$1?[REDACTED]")
    .trim();
}

function extractXmlTagText(text: string, tags: string[]): string | null {
  for (const tag of tags) {
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`, "i").exec(text);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

/**
 * Interpreta o corpo (já lido pelo chamador, no máximo `MAX_ERROR_BODY_BYTES`) de uma resposta de
 * erro — nunca lança; corpo ilegível ou em formato não reconhecido vira evidência vazia (nunca
 * inventa um `upstreamMessage`/`upstreamErrorCode` que não esteja realmente no corpo).
 */
export function parseErrorBodyEvidence(contentType: string | null, rawBytes: Buffer): StoneErrorBodyEvidence {
  const truncated = rawBytes.length > MAX_ERROR_BODY_BYTES;
  const limited = truncated ? rawBytes.subarray(0, MAX_ERROR_BODY_BYTES) : rawBytes;
  const text = limited.toString("utf-8");
  const sanitizedText = sanitizeErrorText(text);
  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("json") && text.trim().length > 0) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        return { contentType, bodyPreview: sanitizedText, upstreamErrorCode: firstStringField(obj, CODE_FIELD_CANDIDATES), upstreamMessage: firstStringField(obj, MESSAGE_FIELD_CANDIDATES), truncated };
      }
    } catch {
      // Anunciado como JSON mas ilegível — cai na evidência vazia abaixo, nunca lança.
    }
    return { contentType, bodyPreview: sanitizedText, upstreamErrorCode: null, upstreamMessage: null, truncated };
  }

  if (ct.includes("xml") && text.trim().length > 0) {
    return {
      contentType,
      bodyPreview: sanitizedText,
      upstreamErrorCode: extractXmlTagText(text, ["Code", "code", "ErrorCode"]),
      upstreamMessage: extractXmlTagText(text, ["Message", "message", "ErrorMessage", "Error"]),
      truncated,
    };
  }

  // text/plain ou content-type ausente/genérico — usa o próprio texto (sanitizado) como mensagem, nunca tenta gunzip aqui (corpo de erro, não arquivo).
  return { contentType, bodyPreview: sanitizedText, upstreamErrorCode: null, upstreamMessage: sanitizedText.length > 0 ? sanitizedText : null, truncated };
}

/**
 * Classifica um HTTP 400 a partir da evidência real do corpo — substitui a regra fixa antiga
 * (`400 → unsupported_layout` sempre). Corpo vazio, ilegível ou sem palavra-chave reconhecível
 * nunca vira uma causa mais específica do que a evidência sustenta — cai em `upstream_bad_request`.
 * HTTP 400 nunca é retryable, em nenhuma categoria (é sempre um erro de requisição, não uma
 * condição transitória).
 */
export function classifyBadRequestBody(evidence: StoneErrorBodyEvidence): { category: StoneFailureCategory; retryable: boolean } {
  const haystack = `${evidence.upstreamErrorCode ?? ""} ${evidence.upstreamMessage ?? ""} ${evidence.bodyPreview}`.toLowerCase().trim();
  if (haystack.length === 0) return { category: "upstream_bad_request", retryable: false };
  if (haystack.includes("layout")) return { category: "unsupported_layout", retryable: false };
  if (/(publish|publicad|generat|gerad)/.test(haystack)) return { category: "file_not_published_yet", retryable: false };
  if (/(date|data)/.test(haystack) && /(invalid|inválid|out of range|fora)/.test(haystack)) return { category: "invalid_reference_date", retryable: false };
  if (/(invalid|inválid|parameter|parâmetro|validation)/.test(haystack)) return { category: "invalid_request", retryable: false };
  return { category: "upstream_bad_request", retryable: false };
}
