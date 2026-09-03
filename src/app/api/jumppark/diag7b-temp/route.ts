import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import type { JumpParkServiceOrdersResponse, JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";
import { maskPlate } from "@/lib/utils/mask";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão JumpPark Live 7B/7D/7E — rota diagnóstica TEMPORÁRIA, protegida pelo Basic Auth já
 * existente (middleware.ts — não está em PUBLIC_PATHS). Estritamente GET/read-only: usa só
 * `jumpParkClient.request` (que só sabe fazer GET). Nunca retorna token, userId,
 * establishmentId, baseUrl, ou qualquer valor de campo que pareça nome/telefone/e-mail/CPF —
 * `sanitizeDeep` abaixo redige por NOME de chave, não por endpoint específico, então cobre
 * qualquer campo novo que a API venha a retornar. Deve ser removida assim que o teste terminar.
 */

const RESERVED_PARAMS = new Set(["startDate", "endDate"]);

/** Nomes de chave que nunca devem ter o VALOR exposto, não importa onde apareçam no payload. */
const SENSITIVE_KEY_PATTERN = /name|nome|phone|telefone|email|e-mail|cpf|cnpj|document|documento|senha|password|token|secret|auth/i;

/** Campos de `JumpParkServiceOrder` cujos valores distintos ajudam a mapear situação/status. */
const SITUATION_KEY_PATTERN = /situ|status|pag|payment|entr|exit|sa[ií]da|cancel|perman|ticket|service|servic|order|os\b/i;

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

/** Perfil agregado de `content[]`: união de chaves, tipos observados, e valores distintos só para chaves "de situação". */
function profileContent(orders: Record<string, unknown>[]) {
  const unionKeys = new Set<string>();
  const typesByKey = new Map<string, Set<string>>();
  const distinctByKey = new Map<string, Set<string>>();

  for (const order of orders) {
    for (const [k, v] of Object.entries(order)) {
      unionKeys.add(k);
      if (!typesByKey.has(k)) typesByKey.set(k, new Set());
      typesByKey.get(k)!.add(v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

      if (SITUATION_KEY_PATTERN.test(k) && !SENSITIVE_KEY_PATTERN.test(k)) {
        if (!distinctByKey.has(k)) distinctByKey.set(k, new Set());
        const set = distinctByKey.get(k)!;
        if (set.size < 30 && v !== null && typeof v !== "object") set.add(String(v));
      }
    }
  }

  const KNOWN_TYPES_KEYS = new Set([
    "serviceOrderId", "serviceOrderCode", "entryDateTime", "exitDateTime", "plate", "vehicleModel", "vehicleColor",
    "paymentMethodName", "clientName", "clientPhone", "clientEmail", "amount", "amountServices", "totalAmount",
    "financialSituationName", "operationSituationName", "situationId", "financialSituationId", "discountId",
    "discountAmount", "discountType", "typePrice", "cardCode", "userName", "userOutputName", "observations",
    "establishmentId", "establishmentName", "services",
  ]);

  return {
    unionKeys: Array.from(unionKeys).sort(),
    keysNotInTypesTs: Array.from(unionKeys).filter((k) => !KNOWN_TYPES_KEYS.has(k)).sort(),
    typesByKey: Object.fromEntries(Array.from(typesByKey.entries()).map(([k, set]) => [k, Array.from(set)])),
    situationLikeDistinctValues: Object.fromEntries(Array.from(distinctByKey.entries()).map(([k, set]) => [k, Array.from(set)])),
  };
}

export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString();
  const today = saoPauloDateISO();
  const searchParams = request.nextUrl.searchParams;

  const startDate = searchParams.get("startDate") ?? "2026-01-01";
  const endDate = searchParams.get("endDate") ?? today;

  // Qualquer outro query param (fora startDate/endDate) é repassado direto para a chamada
  // JumpPark — permite testar UM parâmetro candidato por vez (ex.: ?status=1) sem precisar de
  // um novo deploy a cada tentativa. Só GET, mesmo mecanismo de sempre.
  const extraParams: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!RESERVED_PARAMS.has(key)) extraParams[key] = value;
  }

  const result: Record<string, unknown> = {
    checkedAt,
    periodQueried: { startDate, endDate },
    extraParamsForwarded: extraParams,
  };

  try {
    const raw = await jumpParkClient.request<JumpParkServiceOrdersResponse & Record<string, unknown>>(
      "/serviceorders/export/json",
      { startDate, endDate, ...extraParams },
    );
    const data = (raw.data ?? {}) as Record<string, unknown>;
    const orders = (data.content ?? []) as JumpParkServiceOrder[];
    const missingExit = orders.filter((o) => !o.exitDateTime);
    const missingEntry = orders.filter((o) => !o.entryDateTime);

    result.serviceOrders = {
      ok: true,
      totalOrders: orders.length,
      missingExitDateTimeCount: missingExit.length,
      missingEntryDateTimeCount: missingEntry.length,
      missingExitDateTimeSample: missingExit.slice(0, 10).map(sanitizeOpenOrder),
      topLevelDataKeys: Object.keys(data),
      resume: data.resume ?? null,
      totalPeriod: data.totalPeriod ?? null,
      mediumPeriod: data.mediumPeriod ?? null,
      search: sanitizeDeep(data.search ?? null, "search"),
      operator: sanitizeDeep(data.operator ?? null, "operator"),
      establishment: sanitizeDeep(data.establishment ?? null, "establishment"),
      contentProfile: profileContent(orders as unknown as Record<string, unknown>[]),
      sampleOrderSanitized: orders[0] ? sanitizeDeep(orders[0] as unknown as Record<string, unknown>) : null,
    };
  } catch (error) {
    result.serviceOrders = { ok: false, ...classifyForDiag(error) };
  }

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
