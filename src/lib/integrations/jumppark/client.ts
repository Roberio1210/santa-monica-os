import "server-only";
import { getJumpParkEnv } from "@/lib/config/env";

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

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SantaMonicaOS/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Nunca inclui o token nesta mensagem de erro.
      throw new JumpParkRequestError(
        response.status,
        `JumpPark request failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const jumpParkClient = {
  request,
};
