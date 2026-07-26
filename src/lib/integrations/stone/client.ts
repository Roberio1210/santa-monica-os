import "server-only";
import { gunzipSync } from "node:zlib";
import { getStoneEnv } from "@/lib/config/env";
import { stoneLogger } from "@/lib/integrations/stone/logger";
import {
  classifyBadRequestBody,
  classifyBlobHttpFailure,
  classifyFileHttpFailure,
  parseErrorBodyEvidence,
  sanitizedUrlParts,
  type StoneFailureCategory,
  type StoneFailureStage,
} from "@/lib/integrations/stone/failureClassification";

/**
 * Cliente HTTP para a API "Conciliação Cliente Stone" — ver
 * docs/stone-integration-architecture.md, seções 1.1/1.2. Camada mais baixa: só HTTP, nunca
 * interpreta XML/CSV (isso é `xml.ts`) e nunca decide status de negócio (isso é `service.ts`).
 * Modo somente leitura. Nunca usado a partir de Client Components. Nenhum outro módulo deve
 * importar este arquivo diretamente — sempre `service.ts`.
 */

const BASE_URL = "https://conciliation.stone.com.br/v2";
const FILE_TIMEOUT_MS = 15_000;
const PIX_TIMEOUT_MS = 10_000;
/** Limite defensivo do arquivo descompactado (Sprint 7.0, Z4, seção 15 — "limite de tamanho") — bem acima de qualquer arquivo diário real, só para nunca deixar uma resposta anômala esgotar memória. */
const MAX_DECOMPRESSED_FILE_BYTES = 100 * 1024 * 1024;

/** Retry seguro (Sprint 7.1, decisão do usuário) — só para falhas recuperáveis, nunca em erro de aplicação. */
const MAX_ATTEMPTS = 3;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const BASE_BACKOFF_MS = 300;

export class StoneNotConfiguredError extends Error {
  constructor() {
    super("Stone integration is not configured");
    this.name = "StoneNotConfiguredError";
  }
}

export interface StoneRequestErrorInput {
  status: number;
  message: string;
  category: StoneFailureCategory;
  stage: StoneFailureStage;
  retryable: boolean;
  attempts?: number;
  upstreamContentType?: string | null;
  /** Código de erro extraído do corpo da resposta (Sprint 7.2) — só quando realmente presente, nunca inventado. */
  upstreamErrorCode?: string | null;
  /** Mensagem de erro sanitizada extraída do corpo da resposta (Sprint 7.2) — nunca a mensagem canônica exibida ao usuário (essa vem de `CATEGORY_MESSAGES`, em `service.ts`). */
  upstreamMessage?: string | null;
  sanitizedHost?: string | null;
  sanitizedPath?: string | null;
}

/** Carrega a classificação completa (Sprint 7.1) — nunca só o status HTTP cru. */
export class StoneRequestError extends Error {
  status: number;
  category: StoneFailureCategory;
  stage: StoneFailureStage;
  retryable: boolean;
  attempts: number;
  upstreamContentType: string | null;
  upstreamErrorCode: string | null;
  upstreamMessage: string | null;
  sanitizedHost: string | null;
  sanitizedPath: string | null;

  constructor(input: StoneRequestErrorInput) {
    super(input.message);
    this.name = "StoneRequestError";
    this.status = input.status;
    this.category = input.category;
    this.stage = input.stage;
    this.retryable = input.retryable;
    this.attempts = input.attempts ?? 1;
    this.upstreamContentType = input.upstreamContentType ?? null;
    this.upstreamErrorCode = input.upstreamErrorCode ?? null;
    this.upstreamMessage = input.upstreamMessage ?? null;
    this.sanitizedHost = input.sanitizedHost ?? null;
    this.sanitizedPath = input.sanitizedPath ?? null;
  }
}

/** Erro interno — só usado entre `fetchWithRetry` e seus chamadores dentro deste arquivo; nunca escapa para `service.ts`. */
class StoneNetworkFailure extends Error {
  isTimeout: boolean;
  attempts: number;
  constructor(isTimeout: boolean, attempts: number) {
    super(isTimeout ? "Stone request timed out after retries." : "Stone request failed at the network level after retries.");
    this.name = "StoneNetworkFailure";
    this.isTimeout = isTimeout;
    this.attempts = attempts;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Backoff exponencial com jitter — 300ms/600ms/1200ms de base, +0-50% de variação aleatória. */
function backoffWithJitterMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.round(base + Math.random() * base * 0.5);
}

/** Aceita segundos (`Retry-After: 120`) ou data HTTP (`Retry-After: Wed, 21 Oct ...`) — nunca lança para um valor mal formado. */
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/** Só timeout (AbortError) e falhas de rede de baixo nível conhecidas (reset de conexão, DNS) são retryable — nunca um erro de aplicação. */
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const code = (error as NodeJS.ErrnoException).code;
  return !!code && ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"].includes(code);
}

interface FetchWithRetryResult {
  response: Response;
  attempts: number;
}

/**
 * Retry seguro (Sprint 7.1, decisão do usuário) — no máximo `MAX_ATTEMPTS` tentativas, backoff
 * exponencial com jitter, respeita `Retry-After` quando presente. Só tenta de novo para:
 * timeout, falha de rede de baixo nível, ou HTTP 429/500/502/503/504. Devolve a resposta (mesmo
 * não-2xx) para o chamador decidir o que fazer — nunca decide aqui se é erro de negócio (isso é
 * `classifyFileHttpFailure`/`classifyBlobHttpFailure`). Nunca duplica a chamada em paralelo —
 * sempre sequencial, sempre aguardando o intervalo de backoff antes da próxima tentativa.
 */
async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<FetchWithRetryResult> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok || !RETRYABLE_HTTP_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
        return { response, attempts: attempt };
      }
      const waitMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? backoffWithJitterMs(attempt);
      stoneLogger.warn("Resposta recuperável da Stone — nova tentativa agendada.", { label, status: response.status, attempt, waitMs });
      await sleep(waitMs);
    } catch (error) {
      clearTimeout(timer);
      const isAbort = error instanceof Error && error.name === "AbortError";
      const retryable = isAbort || isRetryableNetworkError(error);
      if (!retryable) throw error;
      if (attempt >= MAX_ATTEMPTS) throw new StoneNetworkFailure(isAbort, attempt);
      stoneLogger.warn("Falha de rede ao consultar a Stone — nova tentativa agendada.", { label, attempt, errorName: error instanceof Error ? error.name : "unknown" });
      await sleep(backoffWithJitterMs(attempt));
    }
  }
}

function basicAuthHeader(apiKey: string): string {
  // Cliente Stone: API key como usuário, senha vazia (nunca logado em lugar nenhum).
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export interface ConciliationFileResponse {
  status: number;
  /** Sempre XML já resolvido (descompactado quando necessário) — nunca assume o formato do corpo, ver `resolveXmlContent`. */
  xml: string;
  attempts: number;
}

/**
 * Achado real de produção (Sprint 7.0/7.1, ver docs/stone-integration-architecture.md): a
 * documentação oficial descreve o corpo de um 200 como o arquivo gzip em si, mas o comportamento
 * observado é que a Stone pode responder com um JSON apontando para uma URL de blob (Azure), que
 * precisa ser baixada numa segunda requisição. O cliente nunca mais assume que HTTP 200 = gzip —
 * sempre classifica o `Content-Type` (com checagem de conteúdo como reforço, já que APIs reais
 * nem sempre rotulam o `Content-Type` com precisão) antes de decidir o que fazer, preservando
 * compatibilidade com os três formatos possíveis: JSON-ponteiro, XML direto (texto, sem
 * compressão) e gzip direto (o comportamento original, documentado).
 */
type StoneResponseKind = "gzip" | "xml" | "json_pointer" | "unknown";

interface RawStoneHttpResponse {
  status: number;
  contentType: string | null;
  buffer: Buffer;
  url: string;
  redirected: boolean;
}

const GZIP_MAGIC_BYTES = Buffer.from([0x1f, 0x8b]);
/** Nomes de campo plausíveis para a URL do arquivo num JSON-ponteiro — schema real não documentado pela Stone, revisar se a produção revelar um nome diferente. */
const BLOB_URL_FIELD_CANDIDATES = ["url", "Url", "URL", "fileUrl", "FileUrl", "downloadUrl", "DownloadUrl", "blobUrl", "BlobUrl", "location", "Location", "href", "Href"];

function classifyStoneResponse(contentType: string | null, buffer: Buffer): StoneResponseKind {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) return "json_pointer";
  if (ct.includes("gzip")) return "gzip";
  if (ct.includes("xml")) return "xml";

  // Content-Type ausente/genérico (ex.: application/octet-stream, comum em blob storage) — reforça por assinatura/conteúdo.
  if (buffer.length >= 2 && buffer[0] === GZIP_MAGIC_BYTES[0] && buffer[1] === GZIP_MAGIC_BYTES[1]) return "gzip";
  const head = buffer.subarray(0, 200).toString("utf-8").trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<")) return "xml";
  if (head.startsWith("{") || head.startsWith("[")) return "json_pointer";
  return "unknown";
}

function extractBlobUrl(parsed: unknown): string | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  for (const key of BLOB_URL_FIELD_CANDIDATES) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** Só aceita HTTPS — nunca segue uma URL de blob apontando para um esquema inseguro. */
function validateBlobUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new StoneRequestError({ status: 0, message: "Stone JSON response contained an invalid file URL.", category: "invalid_pointer_response", stage: "pointer_resolution", retryable: false });
  }
  if (parsed.protocol !== "https:") {
    throw new StoneRequestError({ status: 0, message: "Stone file URL must use HTTPS.", category: "invalid_pointer_response", stage: "pointer_resolution", retryable: false, sanitizedHost: parsed.host, sanitizedPath: parsed.pathname });
  }
  return parsed;
}

/**
 * Resolve o conteúdo XML final a partir de uma resposta HTTP crua, seguindo o ponteiro de blob no
 * máximo uma vez (`depth`) — nunca segue um segundo ponteiro indefinidamente. Loga cada decisão
 * (Content-Type, status, tamanho, redirecionamento, detecção de JSON, host/path sanitizados do
 * blob, resultado da segunda requisição) para nunca mais perder o diagnóstico como aconteceu na
 * falha original.
 */
async function resolveXmlContent(raw: RawStoneHttpResponse, label: string, referenceDateCompact: string, depth = 0): Promise<{ xml: string; attempts: number }> {
  const kind = classifyStoneResponse(raw.contentType, raw.buffer);
  const stage: StoneFailureStage = depth === 0 ? "pointer_resolution" : "blob_download";
  stoneLogger.info("Resposta da Stone classificada.", {
    label,
    status: raw.status,
    contentType: raw.contentType,
    bytes: raw.buffer.length,
    redirected: raw.redirected,
    kind,
  });

  if (kind === "gzip") {
    try {
      const decompressed = gunzipSync(raw.buffer, { maxOutputLength: MAX_DECOMPRESSED_FILE_BYTES });
      return { xml: decompressed.toString("utf-8"), attempts: 1 };
    } catch {
      throw new StoneRequestError({ status: 0, message: "Stone response indicated gzip content but decompression failed (invalid gzip or exceeded size limit).", category: "invalid_gzip", stage: "decompression", retryable: false, upstreamContentType: raw.contentType });
    }
  }

  if (kind === "xml") {
    return { xml: raw.buffer.toString("utf-8"), attempts: 1 };
  }

  if (kind === "json_pointer") {
    if (depth > 0) {
      throw new StoneRequestError({ status: 0, message: "Stone blob URL response was itself a JSON pointer — refusing to follow further redirects.", category: "invalid_pointer_response", stage, retryable: false, upstreamContentType: raw.contentType });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.buffer.toString("utf-8"));
    } catch {
      throw new StoneRequestError({ status: 0, message: "Stone response content-type indicated JSON but the body was not valid JSON.", category: "invalid_pointer_response", stage, retryable: false, upstreamContentType: raw.contentType });
    }
    const blobUrl = extractBlobUrl(parsed);
    if (!blobUrl) {
      throw new StoneRequestError({ status: 0, message: "Stone JSON response did not contain a recognizable file URL.", category: "invalid_pointer_response", stage, retryable: false, upstreamContentType: raw.contentType });
    }
    const validatedUrl = validateBlobUrl(blobUrl);
    const { host: blobHost, path: blobPath } = sanitizedUrlParts(validatedUrl.href);
    stoneLogger.info("URL de blob detectada na resposta da Stone — buscando o arquivo real.", { label, blobHost, blobPath });

    const secondStart = Date.now();
    let secondResult: FetchWithRetryResult;
    try {
      secondResult = await fetchWithRetry(validatedUrl.href, { method: "GET" }, FILE_TIMEOUT_MS, `${label} (blob)`);
    } catch (error) {
      const secondElapsedMs = Date.now() - secondStart;
      if (error instanceof StoneNetworkFailure) {
        stoneLogger.error("Download do blob da Stone falhou (rede).", { label, blobHost, blobPath, attempts: error.attempts, elapsedMs: secondElapsedMs });
        throw new StoneRequestError({ status: 0, message: "Stone blob download failed at the network level after retries.", category: "temporary_network_failure", stage: "blob_download", retryable: true, attempts: error.attempts, sanitizedHost: blobHost, sanitizedPath: blobPath });
      }
      throw error;
    }
    const secondElapsedMs = Date.now() - secondStart;
    const secondResponse = secondResult.response;
    if (!secondResponse.ok) {
      const { category, retryable } = classifyBlobHttpFailure(secondResponse.status);
      stoneLogger.error("Download do blob da Stone falhou.", { label, blobHost, blobPath, status: secondResponse.status, attempts: secondResult.attempts, elapsedMs: secondElapsedMs });
      throw new StoneRequestError({ status: secondResponse.status, message: `Stone blob download failed: ${secondResponse.status} ${secondResponse.statusText}`, category, stage: "blob_download", retryable, attempts: secondResult.attempts, sanitizedHost: blobHost, sanitizedPath: blobPath });
    }
    const secondBuffer = Buffer.from(await secondResponse.arrayBuffer());
    const secondRaw: RawStoneHttpResponse = {
      status: secondResponse.status,
      contentType: secondResponse.headers.get("content-type"),
      buffer: secondBuffer,
      url: secondResponse.url,
      redirected: secondResponse.redirected,
    };
    stoneLogger.info("Download do blob da Stone concluído.", { label, blobHost, blobPath, status: secondRaw.status, contentType: secondRaw.contentType, bytes: secondBuffer.length, attempts: secondResult.attempts, elapsedMs: secondElapsedMs });
    const resolved = await resolveXmlContent(secondRaw, `${label} (blob)`, referenceDateCompact, depth + 1);
    return { xml: resolved.xml, attempts: secondResult.attempts };
  }

  throw new StoneRequestError({ status: 0, message: "Stone response format not recognized (neither gzip, XML, nor a JSON file pointer).", category: "invalid_content_type", stage, retryable: false, upstreamContentType: raw.contentType });
}

/**
 * `referenceDate` no formato AAAAMMDD (padrão do endpoint principal — diferente do formato do
 * endpoint PIX, ver `requestPixFile`). Lança `StoneNotConfiguredError`/`StoneRequestError` — nunca
 * devolve dado parcial ou inventado; quem decide o `StoneResultStatus` é sempre `service.ts`.
 */
async function fetchConciliationFile(affiliationCode: string, referenceDate: string, layout: "XML2_2" | "XML2_4"): Promise<ConciliationFileResponse> {
  const env = getStoneEnv();
  if (!env) throw new StoneNotConfiguredError();

  const url = new URL(`${BASE_URL}/merchant/${affiliationCode}/conciliation-file/${referenceDate}`);
  url.searchParams.set("layout", layout);
  const { host: fileHost, path: filePath } = sanitizedUrlParts(url.toString());

  let firstResult: FetchWithRetryResult;
  try {
    firstResult = await fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: basicAuthHeader(env.apiKey),
          "x-user-type": "client",
          "Accept-Encoding": "gzip",
          "X-Accept-Redirect": "true",
        },
      },
      FILE_TIMEOUT_MS,
      "arquivo de conciliação Stone",
    );
  } catch (error) {
    if (error instanceof StoneNetworkFailure) {
      throw new StoneRequestError({ status: 0, message: "Stone conciliation file request failed at the network level after retries.", category: "temporary_network_failure", stage: "file_request", retryable: true, attempts: error.attempts, sanitizedHost: fileHost, sanitizedPath: filePath });
    }
    throw error;
  }

  const response = firstResult.response;
  if (!response.ok) {
    const errorContentType = response.headers.get("content-type");
    const evidence = parseErrorBodyEvidence(errorContentType, Buffer.from(await response.arrayBuffer()));
    // HTTP 400 nunca é classificado por uma regra fixa (Sprint 7.2) — sempre pela evidência real do corpo.
    const { category, retryable } = response.status === 400 ? classifyBadRequestBody(evidence) : classifyFileHttpFailure(response.status, referenceDate);
    stoneLogger.error("Stone recusou a consulta do arquivo de conciliação.", {
      referenceDate,
      layout,
      status: response.status,
      contentType: errorContentType,
      category,
      upstreamErrorCode: evidence.upstreamErrorCode,
      upstreamMessage: evidence.upstreamMessage,
      bodyPreview: evidence.bodyPreview.slice(0, 300),
      bodyTruncated: evidence.truncated,
      sanitizedHost: fileHost,
      sanitizedPath: filePath,
      attempts: firstResult.attempts,
    });
    // Nunca inclui a chave nesta mensagem de erro.
    throw new StoneRequestError({
      status: response.status,
      message: `Stone conciliation file request failed: ${response.status} ${response.statusText}`,
      category,
      stage: "file_request",
      retryable,
      attempts: firstResult.attempts,
      upstreamContentType: errorContentType,
      upstreamErrorCode: evidence.upstreamErrorCode,
      upstreamMessage: evidence.upstreamMessage,
      sanitizedHost: fileHost,
      sanitizedPath: filePath,
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const raw: RawStoneHttpResponse = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    buffer,
    url: response.url,
    redirected: response.redirected,
  };
  const resolved = await resolveXmlContent(raw, "arquivo de conciliação Stone", referenceDate);
  return { status: response.status, xml: resolved.xml, attempts: Math.max(firstResult.attempts, resolved.attempts) };
}

export interface PixFileRequestResponse {
  status: number;
}

/** `referenceDate` no formato AAAA-MM-DD (diferente do endpoint principal). Fluxo assíncrono: devolve 202, o arquivo chega depois via webhook (ver `types.ts:StoneWebhookNotificationPayload`). */
async function requestPixFile(document: string, referenceDate: string): Promise<PixFileRequestResponse> {
  const env = getStoneEnv();
  if (!env) throw new StoneNotConfiguredError();

  const url = `${BASE_URL}/merchant/${document}/conciliation-file/pix/${referenceDate}`;

  const response = await fetchWithTimeoutOnce(
    url,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(env.apiKey),
        "x-user-type": "client",
      },
    },
    PIX_TIMEOUT_MS,
    "solicitação de arquivo PIX Stone",
  );

  if (!response.ok) {
    throw new StoneRequestError({ status: response.status, message: `Stone PIX file request failed: ${response.status} ${response.statusText}`, category: "unknown_failure", stage: "file_request", retryable: false });
  }

  return { status: response.status };
}

export interface RegisterWebhookInput {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Cadastro de webhook (só precisa ser feito uma vez por credencial) — implementado por
 * completude do cliente HTTP no Z1, mas **nenhum lugar do sistema chama isto ainda**: exige uma
 * rota pública receptora que ainda não existe (ver docs/stone-integration-architecture.md, seção
 * 7 — decisão de infraestrutura pendente).
 */
async function registerWebhook(input: RegisterWebhookInput): Promise<{ status: number }> {
  const env = getStoneEnv();
  if (!env) throw new StoneNotConfiguredError();

  const response = await fetchWithTimeoutOnce(
    `${BASE_URL}/webhook`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(env.apiKey),
        "x-user-type": "client",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url: input.url, headers: input.headers ?? {} }),
    },
    PIX_TIMEOUT_MS,
    "cadastro de webhook Stone",
  );

  if (!response.ok) {
    throw new StoneRequestError({ status: response.status, message: `Stone webhook registration failed: ${response.status} ${response.statusText}`, category: "unknown_failure", stage: "file_request", retryable: false });
  }

  return { status: response.status };
}

/** Sem retry — usado só por PIX/webhook (fora do escopo do retry seguro deste checkpoint, seção 6: "não criar cron", fluxos ainda dormentes). */
async function fetchWithTimeoutOnce(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new StoneRequestError({ status: 0, message: `Timeout (${timeoutMs}ms) ao consultar ${label}.`, category: "temporary_network_failure", stage: "file_request", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const stoneClient = {
  fetchConciliationFile,
  requestPixFile,
  registerWebhook,
};
