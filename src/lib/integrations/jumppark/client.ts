import "server-only";
import { getJumpParkEnv } from "@/lib/config/env";
import { jumpParkLogger } from "./logger";

/**
 * Cliente HTTP para a API pública do JumpPark.
 *
 * Reaproveita o padrão de autenticação e os endpoints já validados em
 * `referencias/jumppark_api.py` (script local anterior que consultava a API
 * com sucesso): Bearer token, path `/api/{userId}/public/establishment/{id}/...`.
 *
 * Modo somente leitura. Nunca usado a partir de Client Components.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export class JumpParkNotConfiguredError extends Error {
  constructor() {
    super("JumpPark integration is not configured");
    this.name = "JumpParkNotConfiguredError";
  }
}

export class JumpParkRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "JumpParkRequestError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const env = getJumpParkEnv();
  if (!env) {
    throw new JumpParkNotConfiguredError();
  }

  const url = new URL(`/api/${env.userId}/public/establishment/${env.establishmentId}${path}`, env.baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "SantaMonicaOS/1.0",
  };
  if (env.origin) {
    headers.Origin = env.origin;
    headers.Referer = env.origin.endsWith("/") ? env.origin : `${env.origin}/`;
  }

  jumpParkLogger.info("Chamando endpoint JumpPark.", { path, hasOrigin: env.origin !== null });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Nunca inclui o token nesta mensagem de erro — só status HTTP e corpo já sanitizado.
      const bodySnippet = await response.text().catch(() => "");
      jumpParkLogger.error("JumpPark respondeu com erro.", { path, status: response.status, statusText: response.statusText, bodySnippet: bodySnippet.slice(0, 300) });
      throw new JumpParkRequestError(
        response.status,
        `JumpPark request failed: ${response.status} ${response.statusText}`,
      );
    }

    jumpParkLogger.info("JumpPark respondeu com sucesso.", { path, status: response.status });
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof JumpParkRequestError) throw error;
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error";
    jumpParkLogger.error("Falha ao chamar JumpPark (sem resposta HTTP).", { path, reason, message: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const jumpParkClient = {
  request,
};
