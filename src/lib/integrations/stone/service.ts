import "server-only";
import { stoneClient, StoneNotConfiguredError, StoneRequestError } from "@/lib/integrations/stone/client";
import { parseConciliationXml, StoneInvalidXmlError } from "@/lib/integrations/stone/xml";
import { getCached, setCached } from "@/lib/integrations/stone/cache";
import { stoneLogger } from "@/lib/integrations/stone/logger";
import { isStoneConfigured } from "@/lib/config/env";
import type { StoneFailureCategory, StoneFailureDiagnostics } from "@/lib/integrations/stone/failureClassification";
import type { StoneConciliationResult, StonePixFileRequestResult, StonePixRequestStatus, StoneResultStatus, StoneWalletPositionResult } from "@/lib/integrations/stone/types";

/**
 * Integração Stone — único ponto de entrada autorizado em todo o sistema. Ninguém deve importar
 * `client.ts`/`xml.ts` diretamente: sempre as funções daqui. Responsável por normalizar, cachear,
 * tratar timeout/indisponibilidade/permissão e logar — o restante do sistema só conhece os tipos
 * de resultado (`types.ts`), nunca o formato bruto da Stone. Mesmo padrão de
 * `integrations/weather/service.ts`.
 */

const DEFAULT_LAYOUT = "XML2_4" as const;
/** Arquivo de um dia já fechado nunca muda — cache sem expiração (ver docs/stone-integration-architecture.md, seção 4.2). */
const CLOSED_DAY_CACHE_TTL_MS: number | null = null;
/** Data de hoje ainda pode não ter arquivo disponível (só publica às 5h do dia seguinte) — TTL curto para não bater a cada navegação. */
const CURRENT_DAY_CACHE_TTL_MS = 15 * 60 * 1000;

function isClosedDay(referenceDateIso8601: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return referenceDateIso8601 < today;
}

function toCompactDate(referenceDateIso8601: string): string {
  return referenceDateIso8601.replaceAll("-", "");
}

interface ErrorMapping {
  status: StoneResultStatus;
  error: string;
  limitations: string[];
  failureDiagnostics: StoneFailureDiagnostics;
}

/** Mesmo vocabulário de 6 valores desde o Z1 — nunca alterado; a categoria (Sprint 7.1) é uma camada de diagnóstico adicional, nunca uma substituição. */
const CATEGORY_TO_RESULT_STATUS: Record<StoneFailureCategory, StoneResultStatus> = {
  no_data_expected: "no_data",
  file_not_published_yet: "no_data",
  temporary_network_failure: "temporary_failure",
  authentication_failure: "insufficient_permission",
  insufficient_permission: "insufficient_permission",
  invalid_pointer_response: "temporary_failure",
  blob_download_failure: "temporary_failure",
  invalid_content_type: "temporary_failure",
  invalid_gzip: "temporary_failure",
  invalid_xml: "temporary_failure",
  unsupported_layout: "temporary_failure",
  persistence_failure: "temporary_failure",
  unknown_failure: "temporary_failure",
};

/** Exportado para `syncStatus.ts` reaproveitar a mesma mensagem sanitizada em vez de duplicar o texto. */
export const CATEGORY_MESSAGES: Record<StoneFailureCategory, string> = {
  no_data_expected: "Nenhum arquivo Stone disponível para esta data.",
  file_not_published_yet: "Arquivo do dia ainda não publicado pela Stone.",
  temporary_network_failure: "Não foi possível consultar a Stone agora — falha temporária de rede.",
  authentication_failure: "Credencial Stone rejeitada (autenticação).",
  insufficient_permission: "Credencial Stone sem permissão para este recurso.",
  invalid_pointer_response: "Resposta da Stone não pôde ser interpretada (formato de ponteiro inesperado).",
  blob_download_failure: "Falha ao baixar o arquivo do blob indicado pela Stone.",
  invalid_content_type: "Resposta da Stone em formato não reconhecido.",
  invalid_gzip: "Resposta da Stone indicava gzip, mas o conteúdo não é um gzip válido.",
  invalid_xml: "Arquivo da Stone não pôde ser interpretado como XML válido.",
  unsupported_layout: "Layout de arquivo não suportado pela Stone para esta requisição.",
  persistence_failure: "Falha ao persistir os dados já obtidos da Stone.",
  unknown_failure: "Não foi possível consultar a Stone agora.",
};

function mapError(error: unknown, elapsedMs: number): ErrorMapping {
  if (error instanceof StoneNotConfiguredError) {
    return {
      status: "not_configured",
      error: "Integração Stone não configurada neste ambiente.",
      limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."],
      failureDiagnostics: { stage: "authentication", category: "authentication_failure", upstreamStatus: null, responseContentType: null, attemptCount: 0, elapsedMs, sanitizedHost: null, sanitizedPath: null },
    };
  }
  if (error instanceof StoneInvalidXmlError) {
    return {
      status: CATEGORY_TO_RESULT_STATUS.invalid_xml,
      error: CATEGORY_MESSAGES.invalid_xml,
      limitations: ["Categoria: invalid_xml (etapa: xml_parsing) — nunca reprocessado automaticamente."],
      failureDiagnostics: { stage: "xml_parsing", category: "invalid_xml", upstreamStatus: null, responseContentType: null, attemptCount: 1, elapsedMs, sanitizedHost: null, sanitizedPath: null },
    };
  }
  if (error instanceof StoneRequestError) {
    return {
      status: CATEGORY_TO_RESULT_STATUS[error.category],
      error: CATEGORY_MESSAGES[error.category],
      limitations: [`Categoria: ${error.category} (etapa: ${error.stage}, tentativas: ${error.attempts}).`],
      failureDiagnostics: {
        stage: error.stage,
        category: error.category,
        upstreamStatus: error.status || null,
        responseContentType: error.upstreamContentType,
        attemptCount: error.attempts,
        elapsedMs,
        sanitizedHost: error.sanitizedHost,
        sanitizedPath: error.sanitizedPath,
      },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "temporary_failure",
    error: "Não foi possível consultar a Stone agora.",
    limitations: [`Falha inesperada: ${message}`],
    failureDiagnostics: { stage: "file_request", category: "unknown_failure", upstreamStatus: null, responseContentType: null, attemptCount: 1, elapsedMs, sanitizedHost: null, sanitizedPath: null },
  };
}

/**
 * Arquivo de conciliação de um dia — `referenceDate` no formato ISO `AAAA-MM-DD` (convertido
 * internamente para o `AAAAMMDD` que o endpoint espera). Nunca lança — sempre devolve um
 * `StoneConciliationResult` honesto (`status` + `error` + `limitations`).
 */
export async function getConciliationFile(referenceDate: string, layout: typeof DEFAULT_LAYOUT | "XML2_2" = DEFAULT_LAYOUT): Promise<StoneConciliationResult> {
  const collectedAt = new Date().toISOString();
  const requestStartedAt = Date.now();

  if (!isStoneConfigured()) {
    stoneLogger.warn("Conciliação Stone não configurada — nenhuma credencial presente.");
    return {
      status: "not_configured",
      error: "Integração Stone não configurada neste ambiente.",
      collectedAt,
      limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."],
      file: null,
      referenceDate,
      failureDiagnostics: { stage: "authentication", category: "authentication_failure", upstreamStatus: null, responseContentType: null, attemptCount: 0, elapsedMs: 0, sanitizedHost: null, sanitizedPath: null },
    };
  }

  const affiliationCode = process.env.STONE_ACCOUNT_ID as string;
  const cacheKey = `conciliation:${affiliationCode}:${referenceDate}:${layout}`;
  const cached = getCached<StoneConciliationResult>(cacheKey);
  if (cached) {
    stoneLogger.info("Arquivo de conciliação obtido do cache.", { referenceDate, layout });
    return cached;
  }

  try {
    const response = await stoneClient.fetchConciliationFile(affiliationCode, toCompactDate(referenceDate), layout);
    const file = parseConciliationXml(response.xml, layout);
    const result: StoneConciliationResult = { status: "ok", error: null, collectedAt, limitations: [], file, referenceDate, failureDiagnostics: null };
    setCached(cacheKey, result, isClosedDay(referenceDate) ? CLOSED_DAY_CACHE_TTL_MS : CURRENT_DAY_CACHE_TTL_MS);
    stoneLogger.info("Arquivo de conciliação consultado com sucesso.", { referenceDate, layout, attempts: response.attempts });
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - requestStartedAt;
    const mapped = mapError(error, elapsedMs);
    stoneLogger.error("Falha ao consultar arquivo de conciliação Stone.", { referenceDate, layout, status: mapped.status, category: mapped.failureDiagnostics.category, stage: mapped.failureDiagnostics.stage, attempts: mapped.failureDiagnostics.attemptCount, elapsedMs });
    return { status: mapped.status, error: mapped.error, collectedAt, limitations: mapped.limitations, file: null, referenceDate, failureDiagnostics: mapped.failureDiagnostics };
  }
}

/**
 * Posição de carteira/saldo — SEMPRE rotulada honestamente como "última posição financeira
 * processada pela Stone" por quem consome isto (decisão do usuário, ver
 * docs/stone-integration-architecture.md, seção 3.1). Nunca chamar de "saldo disponível"/"saldo
 * em tempo real" em nenhuma camada acima desta. Exige Layout 2.4 — o container não existe no 2.2.
 */
export async function getWalletPosition(referenceDate: string): Promise<StoneWalletPositionResult> {
  const result = await getConciliationFile(referenceDate, "XML2_4");

  if (result.status !== "ok" || !result.file) {
    return { status: result.status, error: result.error, collectedAt: result.collectedAt, limitations: result.limitations, positions: [], referenceDate: null, processedAt: null };
  }

  if (result.file.walletPositions.length === 0) {
    return {
      status: "no_data",
      error: "Nenhuma posição de carteira no arquivo deste dia.",
      collectedAt: result.collectedAt,
      limitations: ["WalletPosition ausente do arquivo — pode ser um dia sem movimentação ou o merchant não ter esse container habilitado."],
      positions: [],
      referenceDate: result.referenceDate,
      processedAt: result.collectedAt,
    };
  }

  return {
    status: "ok",
    error: null,
    collectedAt: result.collectedAt,
    limitations: ["Esta é a última posição financeira processada pela Stone, não um saldo em tempo real."],
    positions: result.file.walletPositions,
    referenceDate: result.referenceDate,
    processedAt: result.collectedAt,
  };
}

/**
 * Pede a geração do arquivo PIX de um dia — fluxo assíncrono, o arquivo em si chega depois via
 * webhook (`types.ts:StoneWebhookNotificationPayload`) — este checkpoint (Z1) só cobre o pedido,
 * nunca o recebimento (exige uma rota pública receptora, decisão de infraestrutura pendente para
 * o Z4). `referenceDate` no formato ISO `AAAA-MM-DD` (mesmo formato que o endpoint PIX espera,
 * diferente do arquivo principal).
 */
export async function requestPixFile(document: string, referenceDate: string): Promise<StonePixFileRequestResult> {
  const requestedAt = new Date().toISOString();
  const requestStartedAt = Date.now();

  if (!isStoneConfigured()) {
    stoneLogger.warn("Solicitação de arquivo PIX Stone não configurada — nenhuma credencial presente.");
    return { status: "not_configured", error: "Integração Stone não configurada neste ambiente.", referenceDate, requestedAt };
  }

  try {
    await stoneClient.requestPixFile(document, referenceDate);
    stoneLogger.info("Arquivo PIX solicitado com sucesso.", { referenceDate });
    return { status: "requested", error: null, referenceDate, requestedAt };
  } catch (error) {
    const mapped = mapError(error, Date.now() - requestStartedAt);
    const pixStatus: StonePixRequestStatus = mapped.status === "no_data" ? "temporary_failure" : (mapped.status as StonePixRequestStatus);
    stoneLogger.error("Falha ao solicitar arquivo PIX Stone.", { referenceDate, status: pixStatus });
    return { status: pixStatus, error: mapped.error, referenceDate, requestedAt };
  }
}
