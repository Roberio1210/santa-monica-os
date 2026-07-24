import "server-only";
import { gunzipSync } from "node:zlib";
import { getStoneEnv } from "@/lib/config/env";

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
  /** XML já descompactado (o arquivo é sempre devolvido gzip — descompressão de payload, não de transporte). */
  xml: string;
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
  const xml = gunzipSync(buffer).toString("utf-8");
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
