import "server-only";
import { gunzipSync } from "node:zlib";
import { getStoneEnv } from "@/lib/config/env";
import { stoneLogger } from "@/lib/integrations/stone/logger";

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

export class StoneNotConfiguredError extends Error {
  constructor() {
    super("Stone integration is not configured");
    this.name = "StoneNotConfiguredError";
  }
}

export class StoneRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StoneRequestError";
    this.status = status;
  }
}

function basicAuthHeader(apiKey: string): string {
  // Cliente Stone: API key como usuário, senha vazia (nunca logado em lugar nenhum).
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new StoneRequestError(0, `Timeout (${timeoutMs}ms) ao consultar ${label}.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface ConciliationFileResponse {
  status: number;
  /** Sempre XML já resolvido (descompactado quando necessário) — nunca assume o formato do corpo, ver `resolveXmlContent`. */
  xml: string;
}

/**
 * Achado real de produção (checkpoint de diagnóstico, ver docs/stone-integration-architecture.md):
 * a documentação oficial descreve o corpo de um 200 como o arquivo gzip em si, mas o
 * comportamento observado é que a Stone pode responder com um JSON apontando para uma URL de
 * blob (Azure), que precisa ser baixada numa segunda requisição. O cliente nunca mais assume que
 * HTTP 200 = gzip — sempre classifica o `Content-Type` (com checagem de conteúdo como reforço,
 * já que APIs reais nem sempre rotulam o `Content-Type` com precisão) antes de decidir o que
 * fazer, preservando compatibilidade com os três formatos possíveis: JSON-ponteiro, XML direto
 * (texto, sem compressão) e gzip direto (o comportamento original, documentado).
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
    throw new StoneRequestError(0, "Stone JSON response contained an invalid file URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new StoneRequestError(0, "Stone file URL must use HTTPS.");
  }
  return parsed;
}

/** Nunca loga a URL completa (query string de blob costuma carregar um token SAS — um segredo). */
function sanitizedUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "<url inválida>";
  }
}

/**
 * Resolve o conteúdo XML final a partir de uma resposta HTTP crua, seguindo o ponteiro de blob no
 * máximo uma vez (`depth`) — nunca segue um segundo ponteiro indefinidamente. Loga cada decisão
 * (Content-Type, status, tamanho, redirecionamento, detecção de JSON, URL sanitizada, resultado da
 * segunda requisição) para nunca mais perder o diagnóstico como aconteceu na falha original.
 */
async function resolveXmlContent(raw: RawStoneHttpResponse, label: string, depth = 0): Promise<string> {
  const kind = classifyStoneResponse(raw.contentType, raw.buffer);
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
      return decompressed.toString("utf-8");
    } catch {
      throw new StoneRequestError(0, "Stone response indicated gzip content but decompression failed (invalid gzip or exceeded size limit).");
    }
  }

  if (kind === "xml") {
    return raw.buffer.toString("utf-8");
  }

  if (kind === "json_pointer") {
    if (depth > 0) {
      throw new StoneRequestError(0, "Stone blob URL response was itself a JSON pointer — refusing to follow further redirects.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.buffer.toString("utf-8"));
    } catch {
      throw new StoneRequestError(0, "Stone response content-type indicated JSON but the body was not valid JSON.");
    }
    const blobUrl = extractBlobUrl(parsed);
    if (!blobUrl) {
      throw new StoneRequestError(0, "Stone JSON response did not contain a recognizable file URL.");
    }
    const validatedUrl = validateBlobUrl(blobUrl);
    stoneLogger.info("URL de blob detectada na resposta da Stone — buscando o arquivo real.", { label, blobUrl: sanitizedUrlForLog(validatedUrl.href) });

    const secondStart = Date.now();
    const secondResponse = await fetchWithTimeout(validatedUrl.href, { method: "GET" }, FILE_TIMEOUT_MS, `${label} (blob)`);
    const secondElapsedMs = Date.now() - secondStart;
    if (!secondResponse.ok) {
      stoneLogger.error("Download do blob da Stone falhou.", { label, status: secondResponse.status, elapsedMs: secondElapsedMs });
      throw new StoneRequestError(secondResponse.status, `Stone blob download failed: ${secondResponse.status} ${secondResponse.statusText}`);
    }
    const secondBuffer = Buffer.from(await secondResponse.arrayBuffer());
    const secondRaw: RawStoneHttpResponse = {
      status: secondResponse.status,
      contentType: secondResponse.headers.get("content-type"),
      buffer: secondBuffer,
      url: secondResponse.url,
      redirected: secondResponse.redirected,
    };
    stoneLogger.info("Download do blob da Stone concluído.", { label, status: secondRaw.status, contentType: secondRaw.contentType, bytes: secondBuffer.length, elapsedMs: secondElapsedMs });
    return resolveXmlContent(secondRaw, `${label} (blob)`, depth + 1);
  }

  throw new StoneRequestError(0, "Stone response format not recognized (neither gzip, XML, nor a JSON file pointer).");
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

  const response = await fetchWithTimeout(
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

  if (!response.ok) {
    // Nunca inclui a chave nesta mensagem de erro.
    throw new StoneRequestError(response.status, `Stone conciliation file request failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const raw: RawStoneHttpResponse = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    buffer,
    url: response.url,
    redirected: response.redirected,
  };
  const xml = await resolveXmlContent(raw, "arquivo de conciliação Stone");
  return { status: response.status, xml };
}

export interface PixFileRequestResponse {
  status: number;
}

/** `referenceDate` no formato AAAA-MM-DD (diferente do endpoint principal). Fluxo assíncrono: devolve 202, o arquivo chega depois via webhook (ver `types.ts:StoneWebhookNotificationPayload`). */
async function requestPixFile(document: string, referenceDate: string): Promise<PixFileRequestResponse> {
  const env = getStoneEnv();
  if (!env) throw new StoneNotConfiguredError();

  const url = `${BASE_URL}/merchant/${document}/conciliation-file/pix/${referenceDate}`;

  const response = await fetchWithTimeout(
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
    throw new StoneRequestError(response.status, `Stone PIX file request failed: ${response.status} ${response.statusText}`);
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
 * 7 — decisão de infraestrutura pendente para o Z4).
 */
async function registerWebhook(input: RegisterWebhookInput): Promise<{ status: number }> {
  const env = getStoneEnv();
  if (!env) throw new StoneNotConfiguredError();

  const response = await fetchWithTimeout(
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
    throw new StoneRequestError(response.status, `Stone webhook registration failed: ${response.status} ${response.statusText}`);
  }

  return { status: response.status };
}

export const stoneClient = {
  fetchConciliationFile,
  requestPixFile,
  registerWebhook,
};
