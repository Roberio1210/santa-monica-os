import "server-only";
import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { auditLogs } from "@/db/schema/system";
import { extractPageMeta, fetchOrdersPage, listDays, type FetchOrdersPage } from "./gap-audit";
import { GAP_RECOVERY_ALLOWED_ID_HASHES, GAP_RECOVERY_AUDIT_SHA256, GAP_RECOVERY_EXPECTED, GAP_RECOVERY_WINDOW } from "./gap-recovery-allowlist";
import { mapServiceOrderForPersistence, type PersistableServiceOrder } from "./service";
import type { JumpParkServiceOrder } from "./types";
import { maskPlate } from "@/lib/utils/mask";

/**
 * Recuperação das 46 ordens JumpPark ausentes no Neon (saídas de 21 a 25/09/2026, lacuna de
 * sincronização de 21–30/09). Ferramenta de uso ÚNICO, separada de propósito de
 * `syncJumpParkServiceOrders`/`runHistoricalBackfill`, que:
 *   - sobrescrevem ordens existentes (upsert) e apagam/reinserem itens;
 *   - recalculam Clientes/Veículos e podem disparar consumo de estoque.
 *
 * Aqui, ao contrário:
 *   - só as ordens cujo SHA-256 do `serviceOrderId` está na lista fixa validada pela auditoria;
 *   - SÓ INSERT (`ON CONFLICT DO NOTHING` + conferência): nenhuma ordem existente é tocada — se
 *     qualquer uma das 46 já existir, a transação inteira é desfeita;
 *   - mesmo mapeamento da sincronização (`mapServiceOrderForPersistence`): ids, código, valores,
 *     itens, forma de pagamento e situação exatamente como a API devolve, sem reclassificar;
 *   - data/hora COMPLETAS de entrada e saída preservadas em `raw_payload_sanitized` (só esses dois
 *     campos — sem dado pessoal), já que `order_date`/`entry_time`/`exit_time` seguem a regra
 *     atual da sincronização (data da entrada, horas HH:MM);
 *   - uma única transação SERIALIZABLE; totais relidos dentro dela e comparados com o esperado —
 *     qualquer divergência desfaz tudo;
 *   - nunca chama recálculo de clientes, consumo de estoque, vínculo financeiro nem escreve em
 *     `jumppark_sync_logs` (não interfere na lógica de lotes do backfill);
 *   - registra a operação em `audit_logs`.
 */

export const GAP_RECOVERY_CONFIRM_PHRASE = "RECUPERAR 46 ORDENS";

export function hashExternalId(externalId: string): string {
  return createHash("sha256").update(externalId).digest("hex");
}

const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

export interface RecoveryOrder {
  persist: PersistableServiceOrder;
  entryDateTime: string | null;
  exitDateTime: string | null;
  exitDate: string | null;
}

export interface RecoveryTotals {
  orders: number;
  items: number;
  parkingAmountCents: number;
  servicesAmountCents: number;
  totalAmountCents: number;
  itemsAmountCents: number;
}

export interface RecoveryPreviewRow {
  code: string | null;
  plateMasked: string;
  entryDateTime: string | null;
  exitDateTime: string | null;
  orderDate: string;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  situation: string | null;
  items: Array<{ description: string; amount: number }>;
}

export interface RecoveryPlan {
  window: { from: string; to: string };
  orders: RecoveryOrder[];
  totals: RecoveryTotals;
  ordersByExitDate: Record<string, { orders: number; parkingAmount: number; servicesAmount: number; totalAmount: number }>;
  blockers: string[];
  /** Hash do conteúdo que seria gravado (muda se a API devolver qualquer valor diferente). */
  planHash: string;
  preview: RecoveryPreviewRow[];
  apiPagesTruncated: boolean;
}

function canonicalOrder(o: RecoveryOrder): unknown {
  const p = o.persist;
  return [
    p.externalId, p.code, p.orderDate, p.entryTime, p.exitTime, o.entryDateTime, o.exitDateTime,
    cents(p.parkingAmount), cents(p.servicesAmount), cents(p.totalAmount), p.discountAmount === null ? null : cents(p.discountAmount),
    p.paymentMethod, p.situation, p.situationId, p.financialSituationId,
    p.items.map((i) => [i.description, i.quantity, cents(i.amount)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ];
}

export function computeTotals(orders: RecoveryOrder[]): RecoveryTotals {
  return orders.reduce<RecoveryTotals>(
    (t, o) => ({
      orders: t.orders + 1,
      items: t.items + o.persist.items.length,
      parkingAmountCents: t.parkingAmountCents + cents(o.persist.parkingAmount),
      servicesAmountCents: t.servicesAmountCents + cents(o.persist.servicesAmount),
      totalAmountCents: t.totalAmountCents + cents(o.persist.totalAmount),
      itemsAmountCents: t.itemsAmountCents + o.persist.items.reduce((s, i) => s + cents(i.amount), 0),
    }),
    { orders: 0, items: 0, parkingAmountCents: 0, servicesAmountCents: 0, totalAmountCents: 0, itemsAmountCents: 0 },
  );
}

/**
 * Plano PURO: seleciona, das ordens devolvidas pela API, só as da lista fixa; valida contagens,
 * valores, datas e existência no Neon; calcula o hash do que seria gravado. Nunca grava nada.
 */
export function buildRecoveryPlan(input: {
  perDay: Array<{ day: string; orders: JumpParkServiceOrder[]; truncated?: boolean }>;
  existingExternalIds: ReadonlySet<string>;
  allowlist?: ReadonlySet<string>;
  expected?: typeof GAP_RECOVERY_EXPECTED;
  window?: { from: string; to: string };
}): RecoveryPlan {
  const allowlist = input.allowlist ?? GAP_RECOVERY_ALLOWED_ID_HASHES;
  const expected = input.expected ?? GAP_RECOVERY_EXPECTED;
  const window = input.window ?? GAP_RECOVERY_WINDOW;
  const blockers: string[] = [];
  const apiPagesTruncated = input.perDay.some((d) => d.truncated);
  if (apiPagesTruncated) blockers.push("A API sinalizou paginação/limite numa das consultas — recuperação bloqueada.");

  const byId = new Map<string, RecoveryOrder>();
  for (const { orders } of input.perDay) {
    for (const raw of orders) {
      if (!raw.serviceOrderId || !allowlist.has(hashExternalId(raw.serviceOrderId))) continue; // fora da lista fixa: ignorada
      const candidate: RecoveryOrder = {
        persist: mapServiceOrderForPersistence(raw),
        entryDateTime: raw.entryDateTime ?? null,
        exitDateTime: raw.exitDateTime ?? null,
        exitDate: raw.exitDateTime ? raw.exitDateTime.slice(0, 10) : null,
      };
      const previous = byId.get(raw.serviceOrderId);
      if (previous && JSON.stringify(canonicalOrder(previous)) !== JSON.stringify(canonicalOrder(candidate))) {
        blockers.push(`Ordem ${candidate.persist.code ?? "?"} veio com conteúdo diferente em consultas distintas.`);
      }
      byId.set(raw.serviceOrderId, candidate);
    }
  }
  const orders = [...byId.values()].sort((a, b) => a.persist.externalId.localeCompare(b.persist.externalId));

  if (orders.length !== allowlist.size) blockers.push(`A API devolveu ${orders.length} das ${allowlist.size} ordens da lista fixa.`);
  for (const o of orders) {
    const code = o.persist.code ?? "?";
    if (!o.exitDateTime || !o.exitDate) blockers.push(`Ordem ${code} sem data de saída (ainda no pátio?).`);
    else if (o.exitDate < window.from || o.exitDate > window.to) blockers.push(`Ordem ${code} com saída ${o.exitDate} fora de ${window.from}–${window.to}.`);
    if (!o.persist.orderDate) blockers.push(`Ordem ${code} sem data de entrada/saída para order_date.`);
    if (input.existingExternalIds.has(o.persist.externalId)) blockers.push(`Ordem ${code} JÁ EXISTE no Neon — nenhuma ordem existente é alterada.`);
  }

  const totals = computeTotals(orders);
  const checks: Array<[keyof RecoveryTotals, number]> = [
    ["orders", expected.orders],
    ["items", expected.items],
    ["parkingAmountCents", expected.parkingAmountCents],
    ["servicesAmountCents", expected.servicesAmountCents],
    ["totalAmountCents", expected.totalAmountCents],
    ["itemsAmountCents", expected.itemsAmountCents],
  ];
  for (const [k, v] of checks) if (totals[k] !== v) blockers.push(`Total "${k}" = ${totals[k]} difere do validado na auditoria (${v}).`);

  const ordersByExitDate: RecoveryPlan["ordersByExitDate"] = {};
  for (const day of listDays(window.from, window.to)) ordersByExitDate[day] = { orders: 0, parkingAmount: 0, servicesAmount: 0, totalAmount: 0 };
  for (const o of orders) {
    const d = o.exitDate && ordersByExitDate[o.exitDate];
    if (!d) continue;
    d.orders += 1;
    d.parkingAmount = (cents(d.parkingAmount) + cents(o.persist.parkingAmount)) / 100;
    d.servicesAmount = (cents(d.servicesAmount) + cents(o.persist.servicesAmount)) / 100;
    d.totalAmount = (cents(d.totalAmount) + cents(o.persist.totalAmount)) / 100;
  }
  for (const [day, n] of Object.entries(expected.ordersByExitDate)) {
    if ((ordersByExitDate[day]?.orders ?? 0) !== n) blockers.push(`Dia ${day}: ${ordersByExitDate[day]?.orders ?? 0} ordens (esperado ${n}).`);
  }

  const planHash = createHash("sha256")
    .update(JSON.stringify({ window, expected, orders: orders.map(canonicalOrder) }))
    .digest("hex");

  return {
    window,
    orders,
    totals,
    ordersByExitDate,
    blockers,
    planHash,
    apiPagesTruncated,
    preview: orders.map((o) => ({
      code: o.persist.code,
      plateMasked: maskPlate(o.persist.plateMasked),
      entryDateTime: o.entryDateTime,
      exitDateTime: o.exitDateTime,
      orderDate: o.persist.orderDate,
      parkingAmount: o.persist.parkingAmount,
      servicesAmount: o.persist.servicesAmount,
      totalAmount: o.persist.totalAmount,
      paymentMethod: o.persist.paymentMethod,
      situation: o.persist.situation,
      items: o.persist.items.map((i) => ({ description: i.description, amount: i.amount })),
    })),
  };
}

/** Linha de `jumppark_service_orders` — exatamente os campos que a sincronização grava, + data/hora completas. */
export function toOrderRow(o: RecoveryOrder) {
  const p = o.persist;
  return {
    externalId: p.externalId,
    code: p.code,
    entryTime: p.entryTime,
    exitTime: p.exitTime,
    orderDate: p.orderDate,
    plateMasked: p.plateMasked,
    vehicleModel: p.vehicleModel,
    vehicleColor: p.vehicleColor,
    clientName: p.clientName,
    clientPhoneMasked: p.clientPhoneMasked,
    clientEmail: p.clientEmail,
    parkingAmount: String(p.parkingAmount),
    servicesAmount: String(p.servicesAmount),
    totalAmount: String(p.totalAmount),
    paymentMethod: p.paymentMethod,
    situation: p.situation,
    operationSituationName: p.operationSituationName,
    situationId: p.situationId,
    financialSituationId: p.financialSituationId,
    discountAmount: p.discountAmount === null ? null : String(p.discountAmount),
    discountType: p.discountType,
    typePrice: p.typePrice,
    cardCode: p.cardCode,
    staffEntryName: p.staffEntryName,
    staffExitName: p.staffExitName,
    establishmentId: p.establishmentId,
    establishmentName: p.establishmentName,
    observations: p.observations,
    // Só as datas/horas completas — sem nome, telefone, placa ou operador.
    rawPayloadSanitized: { entryDateTime: o.entryDateTime, exitDateTime: o.exitDateTime, origem: "recuperacao-lacuna-2026-09" },
    source: "jumppark" as const,
    notes: `Recuperada da lacuna de sincronização 21–30/09/2026 (auditoria sha256 ${GAP_RECOVERY_AUDIT_SHA256.slice(0, 12)}).`,
  };
}

export function toItemRows(orderId: string, o: RecoveryOrder) {
  return o.persist.items.map((item) => ({
    serviceOrderId: orderId,
    description: item.description,
    quantity: item.quantity,
    amount: String(item.amount),
    serviceContractId: item.serviceContractId,
    commissioners: item.commissioners,
    source: "jumppark" as const,
  }));
}

// ---------------------------------------------------------------------------------------------
// Gravação — só INSERT, dentro de uma transação. O "writer" isola o banco para os testes.
// ---------------------------------------------------------------------------------------------

export interface RecoveryWriter {
  findExistingExternalIds(externalIds: string[]): Promise<string[]>;
  /** Devolve null quando a ordem já existia (conflito) — o chamador aborta a transação. */
  insertOrder(row: ReturnType<typeof toOrderRow>): Promise<{ id: string } | null>;
  insertItems(rows: ReturnType<typeof toItemRows>): Promise<number>;
  readBackTotals(externalIds: string[]): Promise<RecoveryTotals>;
  insertAuditLog(entry: { actorUserId: string; afterState: Record<string, unknown> }): Promise<void>;
}

export class RecoveryAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryAbortedError";
  }
}

export interface RecoveryResult {
  insertedOrders: number;
  insertedItems: number;
  totals: RecoveryTotals;
  planHash: string;
}

/**
 * Aplica o plano aprovado. Deve rodar DENTRO de uma transação: qualquer `throw` aqui desfaz tudo.
 */
export async function applyRecoveryPlan(writer: RecoveryWriter, plan: RecoveryPlan, approvedPlanHash: string, actorUserId: string, expected: typeof GAP_RECOVERY_EXPECTED = GAP_RECOVERY_EXPECTED): Promise<RecoveryResult> {
  if (plan.planHash !== approvedPlanHash) throw new RecoveryAbortedError("O plano mudou desde a simulação aprovada — nada foi gravado.");
  if (plan.blockers.length) throw new RecoveryAbortedError(`Plano com bloqueios — nada foi gravado: ${plan.blockers.join(" | ")}`);

  const ids = plan.orders.map((o) => o.persist.externalId);
  const existing = await writer.findExistingExternalIds(ids);
  if (existing.length) throw new RecoveryAbortedError(`${existing.length} ordem(ns) já existem no Neon — nada foi gravado (nenhuma ordem existente é alterada).`);

  let insertedOrders = 0;
  let insertedItems = 0;
  for (const order of plan.orders) {
    const inserted = await writer.insertOrder(toOrderRow(order));
    if (!inserted) throw new RecoveryAbortedError(`Conflito ao inserir a ordem ${order.persist.code ?? "?"} — transação desfeita.`);
    insertedOrders += 1;
    const items = toItemRows(inserted.id, order);
    if (items.length) {
      const n = await writer.insertItems(items);
      if (n !== items.length) throw new RecoveryAbortedError(`Itens da ordem ${order.persist.code ?? "?"} gravados parcialmente — transação desfeita.`);
      insertedItems += n;
    }
  }

  const readBack = await writer.readBackTotals(ids);
  const want: RecoveryTotals = {
    orders: expected.orders,
    items: expected.items,
    parkingAmountCents: expected.parkingAmountCents,
    servicesAmountCents: expected.servicesAmountCents,
    totalAmountCents: expected.totalAmountCents,
    itemsAmountCents: expected.itemsAmountCents,
  };
  if (JSON.stringify(readBack) !== JSON.stringify(want)) {
    throw new RecoveryAbortedError(`Conferência pós-gravação divergente (lido ${JSON.stringify(readBack)}, esperado ${JSON.stringify(want)}) — transação desfeita.`);
  }

  await writer.insertAuditLog({
    actorUserId,
    afterState: { orders: readBack.orders, items: readBack.items, totals: readBack, planHash: plan.planHash, auditSha256: GAP_RECOVERY_AUDIT_SHA256, window: plan.window },
  });
  return { insertedOrders, insertedItems, totals: readBack, planHash: plan.planHash };
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function drizzleWriter(tx: Tx): RecoveryWriter {
  return {
    async findExistingExternalIds(externalIds) {
      if (!externalIds.length) return [];
      const rows = await tx.select({ externalId: jumpParkServiceOrders.externalId }).from(jumpParkServiceOrders).where(inArray(jumpParkServiceOrders.externalId, externalIds));
      return rows.map((r) => r.externalId);
    },
    async insertOrder(row) {
      const rows = await tx.insert(jumpParkServiceOrders).values(row).onConflictDoNothing({ target: jumpParkServiceOrders.externalId }).returning({ id: jumpParkServiceOrders.id });
      return rows[0] ?? null;
    },
    async insertItems(rows) {
      const inserted = await tx.insert(jumpParkServiceOrderItems).values(rows).returning({ id: jumpParkServiceOrderItems.id });
      return inserted.length;
    },
    async readBackTotals(externalIds) {
      const [r] = (await tx.execute(sql`
        select count(*)::int as orders,
               coalesce(sum(o.parking_amount * 100), 0)::bigint::int as parking,
               coalesce(sum(o.services_amount * 100), 0)::bigint::int as services,
               coalesce(sum(o.total_amount * 100), 0)::bigint::int as total,
               (select count(*)::int from jumppark_service_order_items i join jumppark_service_orders x on x.id = i.service_order_id where x.external_id in (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)})) as items,
               (select coalesce(sum(i.amount * 100), 0)::bigint::int from jumppark_service_order_items i join jumppark_service_orders x on x.id = i.service_order_id where x.external_id in (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)})) as items_amount
        from jumppark_service_orders o
        where o.external_id in (${sql.join(externalIds.map((id) => sql`${id}`), sql`, `)})`)) as unknown as Array<{ orders: number; parking: number; services: number; total: number; items: number; items_amount: number }>;
      return { orders: r.orders, items: r.items, parkingAmountCents: r.parking, servicesAmountCents: r.services, totalAmountCents: r.total, itemsAmountCents: r.items_amount };
    },
    async insertAuditLog({ actorUserId, afterState }) {
      await tx.insert(auditLogs).values({
        actorUserId,
        action: "jumppark_gap_recovery_2026_09",
        entityType: "jumppark_service_orders",
        entityId: null,
        beforeState: null,
        afterState,
        source: "jumppark",
        notes: "Recuperação das 46 ordens ausentes (saídas 21–25/09/2026) — só INSERT, lista fixa validada pela auditoria.",
      });
    },
  };
}

/** Consulta a API (só GET) dia a dia na janela fixa. */
export async function fetchRecoveryWindow(fetchPage: FetchOrdersPage = fetchOrdersPage): Promise<Array<{ day: string; orders: JumpParkServiceOrder[]; truncated: boolean }>> {
  const out: Array<{ day: string; orders: JumpParkServiceOrder[]; truncated: boolean }> = [];
  for (const day of listDays(GAP_RECOVERY_WINDOW.from, GAP_RECOVERY_WINDOW.to)) {
    const response = await fetchPage(day, day);
    const meta = extractPageMeta(day, response);
    out.push({ day, orders: ((response as { data?: { content?: JumpParkServiceOrder[] } })?.data?.content ?? []) as JumpParkServiceOrder[], truncated: meta.possibleTruncation });
  }
  return out;
}

/** Simulação: API (GET) + Neon numa transação READ ONLY conferida. Nunca grava. */
export async function simulateGapRecovery(db: Database, fetchPage?: FetchOrdersPage): Promise<RecoveryPlan> {
  const perDay = await fetchRecoveryWindow(fetchPage);
  const candidateIds = perDay.flatMap((d) => d.orders.map((o) => o.serviceOrderId).filter((id): id is string => !!id && GAP_RECOVERY_ALLOWED_ID_HASHES.has(hashExternalId(id))));
  const existing = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const [{ transaction_read_only }] = (await tx.execute(sql`show transaction_read_only`)) as unknown as Array<{ transaction_read_only: string }>;
    if (transaction_read_only !== "on") throw new RecoveryAbortedError("Simulação abortada: a transação do Neon não ficou READ ONLY.");
    return drizzleWriter(tx).findExistingExternalIds(candidateIds);
  });
  return buildRecoveryPlan({ perDay, existingExternalIds: new Set(existing) });
}

/** Gravação: API (GET) fora da transação; existência, hash, INSERTs e conferência numa única transação SERIALIZABLE. */
export async function executeGapRecovery(db: Database, approvedPlanHash: string, actorUserId: string, fetchPage?: FetchOrdersPage): Promise<RecoveryResult> {
  const perDay = await fetchRecoveryWindow(fetchPage);
  return db.transaction(
    async (tx) => {
      const writer = drizzleWriter(tx);
      const candidateIds = perDay.flatMap((d) => d.orders.map((o) => o.serviceOrderId).filter((id): id is string => !!id && GAP_RECOVERY_ALLOWED_ID_HASHES.has(hashExternalId(id))));
      const existing = await writer.findExistingExternalIds(candidateIds);
      const plan = buildRecoveryPlan({ perDay, existingExternalIds: new Set(existing) });
      return applyRecoveryPlan(writer, plan, approvedPlanHash, actorUserId);
    },
    { isolationLevel: "serializable" },
  );
}
