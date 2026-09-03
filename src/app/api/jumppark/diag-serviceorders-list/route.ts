import { NextResponse } from "next/server";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import { getJumpParkEnv } from "@/lib/config/env";
import { maskPlate } from "@/lib/utils/mask";

/**
 * Missão JumpPark Live 8B — rota diagnóstica TEMPORÁRIA, protegida pelo Basic Auth já existente
 * (middleware.ts — não está em PUBLIC_PATHS). Estritamente GET/read-only. Testa se as credenciais
 * já configuradas (mesmas de `jumpParkClient`) conseguem acessar `/serviceorders/list`, endpoint
 * descoberto via inspeção manual do painel administrativo (Network do navegador, nunca copiado
 * daqui). Reaproveita `jumpParkClient.request` (mesmo Bearer token, mesmo mecanismo — nunca
 * cookie/sessão) para a tentativa com o padrão `/public/` já comprovado; só monta um fetch manual
 * — com o MESMO Bearer token, nunca sessão/cookie — para testar a variação sem `/public/` exata
 * observada no painel, e só se a primeira tentativa vier 404. Nunca retorna token, userId,
 * establishmentId, baseUrl, ou qualquer campo cujo nome pareça PII. Deve ser removida assim que
 * o teste terminar.
 */

const SENSITIVE_KEY_PATTERN = /name|nome|phone|telefone|email|e-mail|cpf|cnpj|document|documento|senha|password|token|secret|auth/i;

function sanitizeDeep(value: unknown, keyHint?: string): unknown {
  if (keyHint === "plate" && typeof value === "string") return maskPlate(value);
  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint) && typeof value === "string") {
    return `[redacted:${keyHint}, len=${value.length}]`;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeDeep(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeDeep(v, k);
    return out;
  }
  return value;
}

function summarize(json: Record<string, unknown> | null, status: number) {
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const content = Array.isArray(data.content) ? (data.content as Record<string, unknown>[]) : [];
  return {
    ok: true,
    status,
    responseField: json?.response ?? null,
    total: data.total ?? null,
    perPage: data.perPage ?? null,
    contentLength: content.length,
    topLevelDataKeys: Object.keys(data),
    fieldNamesInFirstItem: content[0] ? Object.keys(content[0]) : [],
    itemsSanitized: content.map((item) => sanitizeDeep(item)),
  };
}

function classifyError(error: unknown): { ok: false; errorType: string; status: number | null; bodySnippet?: string } {
  if (error instanceof JumpParkNotConfiguredError) return { ok: false, errorType: "nao_configurado", status: null };
  if (error instanceof JumpParkRequestError) return { ok: false, errorType: "erro_http", status: error.status };
  if (error instanceof Error && error.name === "AbortError") return { ok: false, errorType: "timeout", status: null };
  return { ok: false, errorType: "erro_desconhecido", status: null };
}

/** Mesmo mecanismo de auth do `jumpParkClient.request` (Bearer token, nunca cookie/sessão), só
 * variando o path para não inserir o segmento "/public/" — usado apenas se a tentativa 1 (via
 * `jumpParkClient`, que sempre inclui "/public/") vier 404. */
async function requestWithoutPublicSegment(path: string, params: Record<string, string>) {
  const env = getJumpParkEnv();
  if (!env) throw new JumpParkNotConfiguredError();

  const url = new URL(`/api/${env.userId}/establishment/${env.establishmentId}${path}`, env.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new JumpParkRequestError(res.status, `JumpPark request failed: ${res.status}`);
    }
    return { json: (await res.json()) as Record<string, unknown>, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const startDate = "2026-09-03";
  const endDate = "2026-09-03";
  const result: Record<string, unknown> = { checkedAt, periodQueried: { startDate, endDate } };

  // Teste 1 — com operationSituation=1 ("No pátio" no painel), via jumpParkClient (padrão /public/ já comprovado).
  let workingVariant: "withPublic" | "withoutPublic" | null = null;
  try {
    const json = await jumpParkClient.request<Record<string, unknown>>("/serviceorders/list", {
      startDate, endDate, page: "1", operationSituation: "1",
    });
    result.test1_noPatio = { variant: "withPublic", ...summarize(json, 200) };
    workingVariant = "withPublic";
  } catch (error) {
    const classified = classifyError(error);
    result.test1_noPatio_withPublic = classified;

    if (classified.status === 404) {
      try {
        const { json, status } = await requestWithoutPublicSegment("/serviceorders/list", {
          startDate, endDate, page: "1", operationSituation: "1",
        });
        result.test1_noPatio = { variant: "withoutPublic", ...summarize(json, status) };
        workingVariant = "withoutPublic";
      } catch (error2) {
        result.test1_noPatio_withoutPublic = classifyError(error2);
      }
    }
  }

  // Teste 2 — mesmo endpoint/dia, sem operationSituation — só se o Teste 1 funcionou.
  if (workingVariant) {
    try {
      if (workingVariant === "withPublic") {
        const json = await jumpParkClient.request<Record<string, unknown>>("/serviceorders/list", {
          startDate, endDate, page: "1",
        });
        result.test2_semFiltro = summarize(json, 200);
      } else {
        const { json, status } = await requestWithoutPublicSegment("/serviceorders/list", { startDate, endDate, page: "1" });
        result.test2_semFiltro = summarize(json, status);
      }
    } catch (error) {
      result.test2_semFiltro = classifyError(error);
    }
  }

  return NextResponse.json(result);
}
