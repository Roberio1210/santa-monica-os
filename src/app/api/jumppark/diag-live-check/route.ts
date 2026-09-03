import { NextResponse } from "next/server";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import type { JumpParkServiceOrdersResponse, JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";
import { maskPlate } from "@/lib/utils/mask";

/**
 * Missão JumpPark Live 7F — rota diagnóstica TEMPORÁRIA, protegida pelo Basic Auth já existente
 * (middleware.ts — não está em PUBLIC_PATHS). Estritamente GET/read-only: só chama
 * `jumpParkClient.request` (GET-only por construção), sem passar por `mapOperationOrders`,
 * `sync.ts` ou banco. Existe para um teste único e controlado: comparar o payload CRU de hoje
 * (03/09/2026) contra 4 veículos confirmados fisicamente no pátio pelo proprietário no momento
 * do teste. Nunca retorna token/segredo/placa completa/telefone completo. Deve ser removida
 * assim que o teste terminar — nunca deve permanecer no commit final.
 */

const SITUATION_KEY_PATTERN = /situ|status|pag|payment|entr|exit|sa[ií]da|cancel|perman|ticket|service|servic|order|os\b|product|typePrice/i;
const SENSITIVE_KEY_PATTERN = /name|nome|phone|telefone|email|e-mail|cpf|cnpj|document|documento|senha|password|token|secret|auth/i;

function sanitizeOpenOrder(order: JumpParkServiceOrder) {
  return {
    serviceOrderId: order.serviceOrderId ?? null,
    serviceOrderCode: order.serviceOrderCode ?? null,
    entryDateTime: order.entryDateTime ?? null,
    exitDateTime: order.exitDateTime ?? null,
    plateMasked: maskPlate(order.plate),
    vehicleModel: order.vehicleModel ?? null,
    services: (order.services ?? []).map((s) => ({ description: s.description ?? s.name ?? null, amount: s.amount ?? null })),
    situationId: order.situationId ?? null,
    operationSituationName: order.operationSituationName ?? null,
    financialSituationId: order.financialSituationId ?? null,
    financialSituationName: order.financialSituationName ?? null,
  };
}

function distinctSituationValues(orders: Record<string, unknown>[]) {
  const distinct = new Map<string, Set<string>>();
  for (const order of orders) {
    for (const [k, v] of Object.entries(order)) {
      if (!SITUATION_KEY_PATTERN.test(k) || SENSITIVE_KEY_PATTERN.test(k)) continue;
      if (v === null || typeof v === "object") continue;
      if (!distinct.has(k)) distinct.set(k, new Set());
      const set = distinct.get(k)!;
      if (set.size < 30) set.add(String(v));
    }
  }
  return Object.fromEntries(Array.from(distinct.entries()).map(([k, set]) => [k, Array.from(set)]));
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const checkedAtSaoPaulo = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const startDate = "2026-09-03";
  const endDate = "2026-09-03";

  const result: Record<string, unknown> = {
    checkedAt,
    checkedAtSaoPaulo,
    physicalCondition: { confirmedBy: "proprietário", vehiclesInLot: 4, note: "Confirmação externa, não derivada da API" },
    endpoint: "/serviceorders/export/json",
    periodQueried: { startDate, endDate },
  };

  try {
    const raw = await jumpParkClient.request<JumpParkServiceOrdersResponse & Record<string, unknown>>(
      "/serviceorders/export/json",
      { startDate, endDate },
    );
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const orders = (data.content ?? []) as JumpParkServiceOrder[];

    const withEntry = orders.filter((o) => !!o.entryDateTime);
    const withExit = orders.filter((o) => !!o.exitDateTime);
    const openOrders = orders.filter((o) => !!o.entryDateTime && !o.exitDateTime);

    result.httpStatus = 200;
    result.totalOrders = orders.length;
    result.withEntryDateTimeCount = withEntry.length;
    result.withExitDateTimeCount = withExit.length;
    result.openOrdersCount = openOrders.length;
    result.apiOpenOrders = openOrders.length;
    result.physicalVsApi = { physicalLot: 4, apiOpenOrders: openOrders.length };
    result.openOrdersSanitized = openOrders.map(sanitizeOpenOrder);
    result.situationLikeDistinctValues = distinctSituationValues(orders as unknown as Record<string, unknown>[]);
    result.search = data.search ?? null;
  } catch (error) {
    if (error instanceof JumpParkNotConfiguredError) {
      result.httpStatus = null;
      result.errorType = "nao_configurado";
    } else if (error instanceof JumpParkRequestError) {
      result.httpStatus = error.status;
      result.errorType = "erro_http";
    } else if (error instanceof Error && error.name === "AbortError") {
      result.httpStatus = null;
      result.errorType = "timeout";
    } else {
      result.httpStatus = null;
      result.errorType = "erro_desconhecido";
    }
  }

  return NextResponse.json(result);
}
