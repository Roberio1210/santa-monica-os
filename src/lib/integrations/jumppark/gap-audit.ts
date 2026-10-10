import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { jumpParkClient } from "./client";
import { mapServiceOrderForPersistence } from "./service";
import type { JumpParkServiceOrder } from "./types";
import { maskPlate } from "@/lib/utils/mask";
import { addDaysIso } from "@/lib/utils/timezone";

/**
 * Auditoria de lacuna JumpPark × Neon (Etapa 2 da investigação da falha de sincronização de
 * 21–30/09/2026) — SOMENTE LEITURA, de ponta a ponta:
 *
 *  - JumpPark: só `jumpParkClient.request` (GET — garantido por `read-only-guard.test.ts`), uma
 *    consulta por dia + uma do período inteiro, para detectar paginação/limite;
 *  - Neon: `SET TRANSACTION READ ONLY` conferido com `SHOW transaction_read_only` ANTES de qualquer
 *    SELECT — se a transação não ficar READ ONLY, a auditoria aborta;
 *  - nunca importa sync/backfill/clientes/consumo/mapeamento de serviços (ver `gap-audit.test.ts`).
 *
 * Compara pelo identificador externo (`serviceOrderId` = `jumppark_service_orders.external_id`),
 * exatamente com o mapeamento que a sincronização usaria (`mapServiceOrderForPersistence`), e
 * atribui cada ordem ao dia da SAÍDA (= pagamento) pela data/hora completa da API — um pagamento
 * às 00:30 de 10/10 é de 10/10, mesmo com entrada em 09/10.
 *
 * Saída sem dado pessoal: placa mascarada, nenhum nome/telefone/operador.
 */

export const GAP_AUDIT_MAX_DAYS = 31;

export interface AuditItem {
  description: string;
  amount: number;
}

/** Ordem como a API devolve hoje, já no formato que a sincronização gravaria. */
export interface ApiOrderSnapshot {
  externalId: string;
  code: string | null;
  entryDateTime: string | null;
  exitDateTime: string | null;
  /** Dia da saída/pagamento (AAAA-MM-DD) — null quando ainda no pátio. */
  exitDate: string | null;
  /** O que a sincronização grava hoje em `order_date` (data da ENTRADA). */
  orderDate: string;
  entryTime: string | null;
  exitTime: string | null;
  plateMasked: string;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  discountAmount: number | null;
  paymentMethod: string | null;
  situation: string | null;
  items: AuditItem[];
  /** Dias consultados em que a ordem apareceu (revela o critério de data da API). */
  queriedDays: string[];
}

export interface NeonOrderSnapshot {
  externalId: string;
  code: string | null;
  orderDate: string;
  entryTime: string | null;
  exitTime: string | null;
  plateMasked: string;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  discountAmount: number | null;
  paymentMethod: string | null;
  situation: string | null;
  items: AuditItem[];
}

export interface PageMeta {
  /** Dia consultado, ou "periodo" para a consulta do intervalo inteiro. */
  query: string;
  returned: number;
  finalized: number;
  /** Só valores escalares de `data` (e da raiz) fora de `content` — paginação, totais. */
  meta: Record<string, string | number | boolean | null>;
  possibleTruncation: boolean;
  truncationReason: string | null;
}

export interface FieldDiff {
  field: string;
  neon: unknown;
  api: unknown;
}

export interface DaySummary {
  day: string;
  apiOrders: number;
  neonOrders: number;
  missingOrders: number;
  missingParkingAmount: number;
  missingServicesAmount: number;
  missingTotalAmount: number;
  missingWashOrders: number;
  divergentOrders: number;
  crossMidnightOrders: number;
}

export interface GapAuditReport {
  period: { from: string; to: string };
  generatedAt: string;
  neonTransactionReadOnly: string;
  apiQueries: PageMeta[];
  pagination: { anyPossibleTruncation: boolean; periodQueryCount: number; distinctFromDailyQueries: number; note: string };
  days: DaySummary[];
  consolidated: Omit<DaySummary, "day"> & { openOrdersIgnored: number; ordersOutsidePeriod: number; neonOnlyOrders: number };
  missing: Array<ApiOrderSnapshot>;
  divergent: Array<{ externalId: string; exitDateTime: string | null; diffs: FieldDiff[] }>;
  neonOnly: Array<NeonOrderSnapshot & { note: string }>;
  outsidePeriod: Array<{ externalId: string; exitDateTime: string | null; inNeon: boolean }>;
  duplicates: { sameIdInSeveralDays: number; sameCodeDifferentIds: string[] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

export function listDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export function toApiSnapshot(order: JumpParkServiceOrder, queriedDay: string): ApiOrderSnapshot {
  const p = mapServiceOrderForPersistence(order);
  return {
    externalId: p.externalId,
    code: p.code,
    entryDateTime: order.entryDateTime ?? null,
    exitDateTime: order.exitDateTime ?? null,
    exitDate: order.exitDateTime ? order.exitDateTime.slice(0, 10) : null,
    orderDate: p.orderDate,
    entryTime: p.entryTime,
    exitTime: p.exitTime,
    plateMasked: maskPlate(p.plateMasked),
    parkingAmount: p.parkingAmount,
    servicesAmount: p.servicesAmount,
    totalAmount: p.totalAmount,
    discountAmount: p.discountAmount,
    paymentMethod: p.paymentMethod,
    situation: p.situation,
    items: p.items.map((i) => ({ description: i.description, amount: i.amount })),
    queriedDays: [queriedDay],
  };
}

/** Metadados de paginação sem dado pessoal: só escalares fora de `content`. */
export function extractPageMeta(query: string, response: unknown): PageMeta {
  const root = (response ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const content = Array.isArray(data.content) ? (data.content as JumpParkServiceOrder[]) : [];
  const meta: PageMeta["meta"] = {};
  for (const [source, obj] of [["", root], ["data.", data]] as const) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "content" || k === "data") continue;
      if (v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 40)) meta[`${source}${k}`] = v as string | number | boolean | null;
    }
  }
  const reasons: string[] = [];
  const num = (k: string) => (typeof meta[k] === "number" ? (meta[k] as number) : null);
  const totalElements = num("data.totalElements") ?? num("data.total") ?? num("totalElements");
  const totalPages = num("data.totalPages") ?? num("totalPages");
  const size = num("data.size") ?? num("size");
  if (totalElements !== null && totalElements > content.length) reasons.push(`totalElements ${totalElements} > retornados ${content.length}`);
  if (totalPages !== null && totalPages > 1) reasons.push(`totalPages ${totalPages}`);
  if (meta["data.last"] === false || meta.last === false) reasons.push("last=false");
  if (size !== null && size > 0 && content.length === size) reasons.push(`retornou exatamente o tamanho da página (${size})`);
  return {
    query,
    returned: content.length,
    finalized: content.filter((o) => !!o.exitDateTime).length,
    meta,
    possibleTruncation: reasons.length > 0,
    truncationReason: reasons.length ? reasons.join("; ") : null,
  };
}

function itemsKey(items: AuditItem[]): string {
  return JSON.stringify(items.map((i) => `${i.description.trim().toUpperCase()}|${cents(i.amount)}`).sort());
}

export function diffOrder(api: ApiOrderSnapshot, neon: NeonOrderSnapshot): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const f of ["parkingAmount", "servicesAmount", "totalAmount"] as const) {
    if (cents(api[f]) !== cents(neon[f])) diffs.push({ field: f, neon: neon[f], api: api[f] });
  }
  if ((api.discountAmount === null) !== (neon.discountAmount === null) || cents(api.discountAmount) !== cents(neon.discountAmount)) {
    diffs.push({ field: "discountAmount", neon: neon.discountAmount, api: api.discountAmount });
  }
  for (const f of ["code", "orderDate", "entryTime", "exitTime", "paymentMethod", "situation"] as const) {
    if ((api[f] ?? null) !== (neon[f] ?? null)) diffs.push({ field: f, neon: neon[f], api: api[f] });
  }
  if (itemsKey(api.items) !== itemsKey(neon.items)) diffs.push({ field: "items", neon: neon.items, api: api.items });
  return diffs;
}

/** Junta as ordens das consultas diárias pelo identificador externo (uma ordem pode aparecer em mais de um dia). */
export function mergeApiOrders(perDay: Array<{ day: string; orders: JumpParkServiceOrder[] }>): { orders: Map<string, ApiOrderSnapshot>; sameIdInSeveralDays: number } {
  const orders = new Map<string, ApiOrderSnapshot>();
  let sameIdInSeveralDays = 0;
  for (const { day, orders: raw } of perDay) {
    for (const o of raw) {
      const snap = toApiSnapshot(o, day);
      const existing = orders.get(snap.externalId);
      if (existing) {
        if (!existing.queriedDays.includes(day)) existing.queriedDays.push(day);
        sameIdInSeveralDays += 1;
      } else {
        orders.set(snap.externalId, snap);
      }
    }
  }
  return { orders, sameIdInSeveralDays };
}

export function compareApiWithNeon(input: {
  from: string;
  to: string;
  apiOrders: Map<string, ApiOrderSnapshot>;
  neonOrders: NeonOrderSnapshot[];
}): Pick<GapAuditReport, "days" | "consolidated" | "missing" | "divergent" | "neonOnly" | "outsidePeriod"> & { sameCodeDifferentIds: string[] } {
  const { from, to, apiOrders, neonOrders } = input;
  const neonById = new Map(neonOrders.map((o) => [o.externalId, o]));
  const days = new Map<string, DaySummary>(
    listDays(from, to).map((day) => [day, { day, apiOrders: 0, neonOrders: 0, missingOrders: 0, missingParkingAmount: 0, missingServicesAmount: 0, missingTotalAmount: 0, missingWashOrders: 0, divergentOrders: 0, crossMidnightOrders: 0 }]),
  );
  const missing: ApiOrderSnapshot[] = [];
  const divergent: GapAuditReport["divergent"] = [];
  const outsidePeriod: GapAuditReport["outsidePeriod"] = [];
  let openOrdersIgnored = 0;

  for (const order of [...apiOrders.values()].sort((a, b) => (a.exitDateTime ?? "").localeCompare(b.exitDateTime ?? ""))) {
    // Mesma regra da sincronização: só ordem finalizada (com saída) é gravada.
    if (!order.exitDateTime || !order.exitDate) {
      openOrdersIgnored += 1;
      continue;
    }
    const neon = neonById.get(order.externalId);
    const day = days.get(order.exitDate);
    if (!day) {
      outsidePeriod.push({ externalId: order.externalId, exitDateTime: order.exitDateTime, inNeon: !!neon });
      continue;
    }
    day.apiOrders += 1;
    if (order.entryDateTime && order.entryDateTime.slice(0, 10) !== order.exitDate) day.crossMidnightOrders += 1;
    if (!neon) {
      missing.push(order);
      day.missingOrders += 1;
      day.missingParkingAmount = round2(day.missingParkingAmount + order.parkingAmount);
      day.missingServicesAmount = round2(day.missingServicesAmount + order.servicesAmount);
      day.missingTotalAmount = round2(day.missingTotalAmount + order.totalAmount);
      if (order.items.length > 0 || order.servicesAmount > 0) day.missingWashOrders += 1;
      continue;
    }
    day.neonOrders += 1;
    const diffs = diffOrder(order, neon);
    if (diffs.length) {
      day.divergentOrders += 1;
      divergent.push({ externalId: order.externalId, exitDateTime: order.exitDateTime, diffs });
    }
  }

  // No Neon (entrada no período) e não devolvida por nenhuma consulta. Sem data de saída no Neon,
  // pode ser só uma ordem que saiu depois do fim do período — por isso é reportada, não concluída.
  const neonOnly = neonOrders
    .filter((o) => !apiOrders.has(o.externalId) && o.orderDate >= from && o.orderDate <= to)
    .map((o) => ({ ...o, note: "não devolvida pela API no período — pode ter saído depois do fim do período, ou ter sido excluída/alterada no JumpPark" }));

  const byCode = new Map<string, Set<string>>();
  for (const o of apiOrders.values()) if (o.code) byCode.set(o.code, (byCode.get(o.code) ?? new Set()).add(o.externalId));
  const sameCodeDifferentIds = [...byCode.entries()].filter(([, ids]) => ids.size > 1).map(([code]) => code);

  const dayList = [...days.values()];
  const sum = (k: keyof Omit<DaySummary, "day">) => round2(dayList.reduce((a, d) => a + d[k], 0));
  return {
    days: dayList,
    consolidated: {
      apiOrders: sum("apiOrders"),
      neonOrders: sum("neonOrders"),
      missingOrders: sum("missingOrders"),
      missingParkingAmount: sum("missingParkingAmount"),
      missingServicesAmount: sum("missingServicesAmount"),
      missingTotalAmount: sum("missingTotalAmount"),
      missingWashOrders: sum("missingWashOrders"),
      divergentOrders: sum("divergentOrders"),
      crossMidnightOrders: sum("crossMidnightOrders"),
      openOrdersIgnored,
      ordersOutsidePeriod: outsidePeriod.length,
      neonOnlyOrders: neonOnly.length,
    },
    missing,
    divergent,
    neonOnly,
    outsidePeriod,
    sameCodeDifferentIds,
  };
}

// ---------------------------------------------------------------------------------------------
// I/O — Neon (READ ONLY) e JumpPark (GET).
// ---------------------------------------------------------------------------------------------

/** Executor mínimo de SQL — `Database` em produção; um falso nos testes. */
export interface ReadOnlyExecutor {
  transaction<T>(fn: (tx: { execute: (query: SQL) => Promise<unknown> }) => Promise<T>): Promise<T>;
}

interface NeonOrderRow {
  id: string;
  external_id: string;
  code: string | null;
  order_date: string;
  entry_time: string | null;
  exit_time: string | null;
  plate: string | null;
  parking_amount: string;
  services_amount: string;
  total_amount: string;
  discount_amount: string | null;
  payment_method: string | null;
  situation: string | null;
}

/**
 * Lê as ordens do Neon numa transação READ ONLY: as devolvidas pela API (por identificador
 * externo) e as com `order_date` entre (from − 3 dias) e `to` (para achar as que só existem no
 * Neon). Aborta se o banco não confirmar a transação como READ ONLY.
 */
export async function loadNeonOrdersReadOnly(db: ReadOnlyExecutor, externalIds: string[], from: string, to: string): Promise<{ orders: NeonOrderSnapshot[]; transactionReadOnly: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const check = (await tx.execute(sql`show transaction_read_only`)) as Array<{ transaction_read_only: string }>;
    const transactionReadOnly = check[0]?.transaction_read_only ?? "desconhecido";
    if (transactionReadOnly !== "on") throw new Error("Auditoria abortada: a transação do Neon não ficou READ ONLY.");

    const byId = externalIds.length ? sql`o.external_id in (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)}) or ` : sql``;
    const rows = (await tx.execute(sql`
      select o.id::text as id, o.external_id, o.code, o.order_date::text as order_date, o.entry_time, o.exit_time, o.plate_masked as plate,
             o.parking_amount::text as parking_amount, o.services_amount::text as services_amount, o.total_amount::text as total_amount,
             o.discount_amount::text as discount_amount, o.payment_method, o.situation
      from jumppark_service_orders o
      where ${byId}o.order_date between ${addDaysIso(from, -3)} and ${to}`)) as NeonOrderRow[];

    const itemsByOrder = new Map<string, AuditItem[]>();
    if (rows.length) {
      const items = (await tx.execute(sql`
        select i.service_order_id::text as service_order_id, i.description, i.amount::text as amount
        from jumppark_service_order_items i
        where i.service_order_id in (${sql.join(rows.map((r) => sql`${r.id}::uuid`), sql`, `)})`)) as Array<{ service_order_id: string; description: string; amount: string }>;
      for (const it of items) itemsByOrder.set(it.service_order_id, [...(itemsByOrder.get(it.service_order_id) ?? []), { description: it.description, amount: Number(it.amount) }]);
    }

    return {
      transactionReadOnly,
      orders: rows.map((r) => ({
        externalId: r.external_id,
        code: r.code,
        orderDate: r.order_date,
        entryTime: r.entry_time,
        exitTime: r.exit_time,
        plateMasked: maskPlate(r.plate),
        parkingAmount: Number(r.parking_amount),
        servicesAmount: Number(r.services_amount),
        totalAmount: Number(r.total_amount),
        discountAmount: r.discount_amount === null ? null : Number(r.discount_amount),
        paymentMethod: r.payment_method,
        situation: r.situation,
        items: itemsByOrder.get(r.id) ?? [],
      })),
    };
  });
}

export type FetchOrdersPage = (startDate: string, endDate: string) => Promise<unknown>;

/** Única chamada à API: o mesmo endpoint e o mesmo cliente (GET) da sincronização. */
export const fetchOrdersPage: FetchOrdersPage = (startDate, endDate) => jumpParkClient.request<unknown>("/serviceorders/export/json", { startDate, endDate });

export async function runJumpParkGapAudit(from: string, to: string, deps: { db: ReadOnlyExecutor | Database; fetchPage?: FetchOrdersPage; now?: () => Date }): Promise<GapAuditReport> {
  const fetchPage = deps.fetchPage ?? fetchOrdersPage;
  const apiQueries: PageMeta[] = [];
  const perDay: Array<{ day: string; orders: JumpParkServiceOrder[] }> = [];

  // Sequencial (não paralelo): carga mínima na API do JumpPark.
  for (const day of listDays(from, to)) {
    const response = await fetchPage(day, day);
    apiQueries.push(extractPageMeta(day, response));
    const content = ((response as { data?: { content?: JumpParkServiceOrder[] } })?.data?.content ?? []) as JumpParkServiceOrder[];
    perDay.push({ day, orders: content });
  }
  const periodResponse = await fetchPage(from, to);
  const periodMeta = extractPageMeta("periodo", periodResponse);
  apiQueries.push(periodMeta);

  const { orders: apiOrders, sameIdInSeveralDays } = mergeApiOrders(perDay);
  const periodIds = new Set((((periodResponse as { data?: { content?: JumpParkServiceOrder[] } })?.data?.content ?? []) as JumpParkServiceOrder[]).map((o) => toApiSnapshot(o, "periodo").externalId));
  const notInDaily = [...periodIds].filter((id) => !apiOrders.has(id)).length;

  const { orders: neonOrders, transactionReadOnly } = await loadNeonOrdersReadOnly(deps.db as ReadOnlyExecutor, [...apiOrders.keys()], from, to);
  const compared = compareApiWithNeon({ from, to, apiOrders, neonOrders });

  return {
    period: { from, to },
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    neonTransactionReadOnly: transactionReadOnly,
    apiQueries,
    pagination: {
      anyPossibleTruncation: apiQueries.some((q) => q.possibleTruncation) || notInDaily > 0,
      periodQueryCount: periodMeta.returned,
      distinctFromDailyQueries: apiOrders.size,
      note:
        notInDaily > 0
          ? `${notInDaily} ordem(ns) só apareceram na consulta do período inteiro — as consultas diárias podem estar incompletas.`
          : periodMeta.returned < apiOrders.size
            ? "A consulta do período inteiro devolveu menos ordens que a soma das diárias — indício de limite por requisição; as consultas diárias foram usadas."
            : "Consultas diárias e do período são consistentes.",
    },
    days: compared.days,
    consolidated: compared.consolidated,
    missing: compared.missing,
    divergent: compared.divergent,
    neonOnly: compared.neonOnly,
    outsidePeriod: compared.outsidePeriod,
    duplicates: { sameIdInSeveralDays, sameCodeDifferentIds: compared.sameCodeDifferentIds },
  };
}
