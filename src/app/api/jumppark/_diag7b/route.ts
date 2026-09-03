import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import type { JumpParkServiceOrdersResponse, JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";
import { maskPlate } from "@/lib/utils/mask";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão JumpPark Live 7B — rota diagnóstica TEMPORÁRIA, protegida pelo Basic Auth já existente
 * (middleware.ts — não está em PUBLIC_PATHS, então exige a mesma autenticação de qualquer outra
 * página do app). Estritamente GET/read-only: usa só `jumpParkClient.request` (que só sabe fazer
 * GET) e nenhum outro lado-efeito. Nunca retorna token, userId, establishmentId, baseUrl,
 * clientName ou clientPhone. Existe só para responder, com dados reais de produção, se a API do
 * JumpPark devolve ordens sem exitDateTime (abertas) fora do filtro já aplicado por
 * `mapOperationOrders`/`sync.ts`. Deve ser removida assim que o teste terminar — nunca deve
 * permanecer no commit final.
 */

function sanitizeOpenOrder(order: JumpParkServiceOrder) {
  return {
    plateMasked: maskPlate(order.plate),
    entryDateTime: order.entryDateTime ?? null,
    exitDateTimePresent: !!order.exitDateTime,
    serviceCount: order.services?.length ?? 0,
    parkingAmount: order.amount ?? null,
    servicesAmount: order.amountServices ?? null,
    totalAmount: order.totalAmount ?? null,
    financialSituationName: order.financialSituationName ?? null,
    operationSituationName: order.operationSituationName ?? null,
    situationId: order.situationId ?? null,
    financialSituationId: order.financialSituationId ?? null,
  };
}

export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  const today = saoPauloDateISO();
  const searchParams = request.nextUrl.searchParams;

  const startDate = searchParams.get("startDate") ?? "2026-01-01";
  const endDate = searchParams.get("endDate") ?? today;

  const result: Record<string, unknown> = { checkedAt, periodQueried: { startDate, endDate } };

  // Endpoint 1: /serviceorders/export/json — bypassa mapOperationOrders (que já filtra
  // !!exitDateTime) para inspecionar a resposta CRUA da API, antes de qualquer filtro nosso.
  try {
    const raw = await jumpParkClient.request<JumpParkServiceOrdersResponse & Record<string, unknown>>(
      "/serviceorders/export/json",
      { startDate, endDate },
    );
    const orders = raw.data?.content ?? [];
    const missingExit = orders.filter((o) => !o.exitDateTime);
    const missingEntry = orders.filter((o) => !o.entryDateTime);

    result.serviceOrders = {
      ok: true,
      totalOrders: orders.length,
      missingExitDateTimeCount: missingExit.length,
      missingEntryDateTimeCount: missingEntry.length,
      missingExitDateTimeSample: missingExit.slice(0, 10).map(sanitizeOpenOrder),
      // Nomes de chave no nível raiz do payload (não os valores) — para detectar campos como
      // `resume`/`establishment` que existem na resposta real mas não em types.ts.
      topLevelDataKeys: raw.data ? Object.keys(raw.data as Record<string, unknown>) : [],
      // `resume`, se existir, é um resumo agregado (contagens/totais do período) — não é dado de
      // cliente, seguro para reportar como está.
      resume: (raw.data as Record<string, unknown> | undefined)?.resume ?? null,
      // Só o nome do estabelecimento, se vier — nunca endereço completo/coordenadas.
      establishmentName: (raw as Record<string, unknown>).establishment
        ? ((raw as Record<string, unknown>).establishment as Record<string, unknown>).establishmentName ?? null
        : null,
    };
  } catch (error) {
    result.serviceOrders = { ok: false, ...classifyForDiag(error) };
  }

  // Endpoint 2: /reports/financial — só para confirmar se ainda responde 404 (achado da auditoria
  // de 04/08/2026) ou se voltou a funcionar.
  try {
    await jumpParkClient.request("/reports/financial", { startDate: today, endDate: today });
    result.financialReport = { ok: true };
  } catch (error) {
    result.financialReport = { ok: false, ...classifyForDiag(error) };
  }

  return NextResponse.json(result);
}

function classifyForDiag(error: unknown): { errorType: string; status: number | null } {
  if (error instanceof JumpParkNotConfiguredError) return { errorType: "nao_configurado", status: null };
  if (error instanceof JumpParkRequestError) return { errorType: "erro_http", status: error.status };
  if (error instanceof Error && error.name === "AbortError") return { errorType: "timeout", status: null };
  return { errorType: "erro_desconhecido", status: null };
}
