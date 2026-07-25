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

/** Classificação de uma falha HTTP no arquivo principal (nunca no blob — ver `classifyBlobHttpFailure`). */
export function classifyFileHttpFailure(status: number, referenceDateCompact: string, now: Date = new Date()): { category: StoneFailureCategory; retryable: boolean } {
  if (status === 401) return { category: "authentication_failure", retryable: false };
  if (status === 403) return { category: "insufficient_permission", retryable: false };
  if (status === 400) return { category: "unsupported_layout", retryable: false };
  if (status === 404) return { category: isWithinPublicationLag(referenceDateCompact, now) ? "file_not_published_yet" : "no_data_expected", retryable: false };
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return { category: "temporary_network_failure", retryable: true };
  return { category: "unknown_failure", retryable: false };
}

/** Falha HTTP ao baixar o blob (URL pré-assinada) — 401/403/404 aqui tipicamente significa SAS expirado/inválido, nunca confundido com autenticação da própria Stone. */
export function classifyBlobHttpFailure(status: number): { category: StoneFailureCategory; retryable: boolean } {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return { category: "blob_download_failure", retryable: true };
  return { category: "blob_download_failure", retryable: false };
}
