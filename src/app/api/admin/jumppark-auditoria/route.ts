import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { isJumpParkConfigured } from "@/lib/config/env";
import { JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import { GAP_AUDIT_MAX_DAYS, listDays, runJumpParkGapAudit } from "@/lib/integrations/jumppark/gap-audit";
import { isValidIsoDate } from "@/lib/utils/timezone";

/**
 * Auditoria JumpPark × Neon — SOMENTE LEITURA (Etapa 2 da investigação da lacuna de
 * sincronização de 21–30/09/2026). Roda no servidor da Vercel para usar as credenciais
 * Sensitive do JumpPark sem nunca expô-las.
 *
 *   GET /api/admin/jumppark-auditoria?from=2026-09-19&to=2026-10-01
 *
 * - Só administrador com sessão individual real (`getCurrentUser()`), sempre — independente de
 *   `INDIVIDUAL_AUTH_ENABLED` (mesmo padrão de `/api/admin/stone-payload-diagnostic`). Não está em
 *   `PUBLIC_PATHS`: o middleware também exige o Basic Auth quando ativo.
 * - JumpPark só por GET (cliente oficial); Neon só dentro de transação READ ONLY conferida.
 * - Rota de API: não carrega o layout global (que registraria nomes de serviço no banco).
 * - Nunca chama sincronização, backfill, recálculo de clientes, consumo de estoque, mapeamento de
 *   serviços nem nada financeiro — ver `route.test.ts`.
 * - Resposta sem dado pessoal (placa mascarada, sem nome/telefone/operador) e sem credencial.
 *
 * Ferramenta temporária: remover quando a lacuna de setembro estiver resolvida.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function sanitizeError(error: unknown): string {
  if (error instanceof JumpParkRequestError) return `A API do JumpPark respondeu com erro (HTTP ${error.status}).`;
  if (error instanceof Error && error.name === "AbortError") return "A API do JumpPark não respondeu a tempo (timeout).";
  if (error instanceof Error && error.message.startsWith("Auditoria abortada")) return error.message;
  return "Falha na auditoria (detalhes omitidos por segurança).";
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonNoStore({ error: "Não autorizado." }, 401);
  if (user.role !== "admin") return jsonNoStore({ error: "Acesso restrito a administradores." }, 403);

  const params = new URL(request.url).searchParams;
  const allowed = new Set(["from", "to"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) return jsonNoStore({ error: `Parâmetro não permitido: "${key}". Só "from" e "to" são aceitos.` }, 400);
  }
  const from = params.get("from");
  const to = params.get("to");
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return jsonNoStore({ error: 'Informe "from" e "to" no formato AAAA-MM-DD.' }, 400);
  if (from > to) return jsonNoStore({ error: '"from" deve ser anterior ou igual a "to".' }, 400);
  if (listDays(from, to).length > GAP_AUDIT_MAX_DAYS) return jsonNoStore({ error: `Período máximo: ${GAP_AUDIT_MAX_DAYS} dias.` }, 400);

  if (!isJumpParkConfigured()) return jsonNoStore({ error: "JumpPark não configurado neste ambiente." }, 503);
  const db = getDb();
  if (!db) return jsonNoStore({ error: "Banco de dados não configurado neste ambiente." }, 503);

  try {
    const report = await runJumpParkGapAudit(from, to, { db });
    return jsonNoStore(report, 200);
  } catch (error) {
    return jsonNoStore({ error: sanitizeError(error) }, 502);
  }
}
