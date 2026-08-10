import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, sql as sqlOp } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { customers, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { computeCustomerStatus, VIP_VISIT_THRESHOLD, RECORRENTE_VISIT_THRESHOLD, VIP_MAX_INACTIVITY_DAYS, AT_RISK_CUSTOMER_DAYS, LOST_CUSTOMER_DAYS } from "@/lib/crm-intelligente/profile";
import type { CustomerStatus } from "@/lib/crm-intelligente/types";
import { CUSTOMER_SEGMENT_KEYS, isReactivatedInPeriod, type CustomerSegmentKey } from "@/lib/integrations/jumppark/customerSegments";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Consulta somente leitura do núcleo de Clientes/Veículos derivado da JumpPark (Missão 26, terceira
 * entrega) — sempre filtrada por `source = 'jumppark'`, nunca mistura com clientes cadastrados
 * manualmente no Atendimento (que usam a mesma tabela `customers`, mas nunca têm `external_id`).
 * "Dias sem retornar" e status (VIP/recorrente/em risco/perdido) são calculados em tempo de leitura,
 * reaproveitando exatamente os mesmos limiares já definidos e testados em `crm-intelligente/profile.ts`
 * — nenhuma regra nova de negócio nasce aqui.
 */

export type CustomerSortBy = "lastVisit" | "totalSpent" | "visitCount" | "averageTicket" | "vehicleCount";
export type CustomerSortDir = "asc" | "desc";

const SORT_KEYS: CustomerSortBy[] = ["lastVisit", "totalSpent", "visitCount", "averageTicket", "vehicleCount"];

export interface CustomersQueryFilters {
  nameQuery: string | null;
  /** Missão 29 — segmento gerencial (novos/recorrentes/reativados/vip/sem-retorno/mais-veículos). Null = todos os clientes. */
  segment: CustomerSegmentKey | null;
  /**
   * Janela usada pelos segmentos que dependem de período ("novos", "reativados") — ignorada pelos
   * demais segmentos. Sempre um `PeriodRange` já resolvido pela página (nunca inventado aqui).
   */
  segmentPeriod: { from: string; to: string };
  sortBy: CustomerSortBy;
  sortDir: CustomerSortDir;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;

export function parseCustomersQueryFilters(params: Record<string, string | undefined>, segmentPeriod: { from: string; to: string }): CustomersQueryFilters {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sortBy: CustomerSortBy = SORT_KEYS.includes(params.sort as CustomerSortBy) ? (params.sort as CustomerSortBy) : "lastVisit";
  const sortDir: CustomerSortDir = params.dir === "asc" ? "asc" : "desc";
  const segment = CUSTOMER_SEGMENT_KEYS.includes(params.segmento as CustomerSegmentKey) ? (params.segmento as CustomerSegmentKey) : null;

  return {
    nameQuery: params.cliente?.trim() || null,
    segment,
    segmentPeriod,
    sortBy,
    sortDir,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(fromIso)) / 86_400_000);
}

export interface CustomerListItem {
  id: string;
  name: string | null;
  visitCount: number;
  firstVisitAt: string | null;
  lastVisit: string | null;
  daysSinceLastVisit: number | null;
  totalSpent: number;
  averageTicket: number;
  servicesOrderCount: number;
  vehicleCount: number;
  status: CustomerStatus;
  statusReason: string;
  /** Missão 28 — nível de confiança do vínculo de identidade (ver `src/db/schema/crm.ts`, `identityConfidenceEnum`). */
  identityConfidence: string;
  identityConfidenceReason: string | null;
}

export interface CustomersQueryResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  databaseConfigured: boolean;
}

function toListItem(row: typeof customers.$inferSelect & { vehicleCount: number }, now: Date): CustomerListItem {
  const visitCount = row.visitCount ?? 0;
  const daysSinceLastVisit = row.lastVisit ? daysBetween(row.lastVisit, now) : null;
  const { status, reason } = computeCustomerStatus({ visitCount, daysSinceLastVisit });

  return {
    id: row.id,
    name: row.name,
    visitCount,
    firstVisitAt: row.firstVisitAt,
    lastVisit: row.lastVisit,
    daysSinceLastVisit,
    totalSpent: row.totalSpent ? Number(row.totalSpent) : 0,
    averageTicket: row.averageTicket ? Number(row.averageTicket) : 0,
    servicesOrderCount: row.servicesOrderCount ?? 0,
    vehicleCount: row.vehicleCount,
    status,
    statusReason: reason,
    identityConfidence: row.identityConfidence,
    identityConfidenceReason: row.identityConfidenceReason,
  };
}

/**
 * "Reativados" não é expressável como WHERE simples na tabela `customers` (depende do histórico
 * completo de datas de visita) — calcula à parte, em JS, sobre `jumppark_service_orders`, e
 * devolve o conjunto de ids elegível para entrar no `inArray` da consulta principal. Ver
 * `isReactivatedInPeriod` (pura, testada) em `customerSegments.ts`.
 */
async function computeReactivatedCustomerIds(db: NonNullable<ReturnType<typeof getDb>>, period: { from: string; to: string }): Promise<string[]> {
  const rows = await db
    .select({ customerId: jumpParkServiceOrders.customerId, orderDate: jumpParkServiceOrders.orderDate })
    .from(jumpParkServiceOrders)
    .where(sqlOp`${jumpParkServiceOrders.customerId} is not null`)
    .orderBy(asc(jumpParkServiceOrders.customerId), asc(jumpParkServiceOrders.orderDate));

  const datesByCustomer = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const list = datesByCustomer.get(row.customerId) ?? [];
    list.push(row.orderDate);
    datesByCustomer.set(row.customerId, list);
  }

  const reactivated: string[] = [];
  for (const [customerId, dates] of datesByCustomer) {
    if (isReactivatedInPeriod(dates, period)) reactivated.push(customerId);
  }
  return reactivated;
}

/**
 * Gera um NOVO fragmento SQL a cada chamada — nunca reaproveitar uma única instância de `sql`
 * em mais de uma posição da mesma query (WHERE + SELECT + ORDER BY). Os identificadores são
 * texto puro (`"vehicles" "v"`/`"customers"."id"`), não referências de coluna do Drizzle
 * (`vehicles.customerId`/`customers.id`): usar a referência de coluna aqui faz o Drizzle, ao
 * combinar esta subquery correlacionada com `getTableColumns(customers)` no mesmo `select()`,
 * remover silenciosamente o qualificador de tabela de `customers.id` — a subquery então
 * autocorrelaciona contra `vehicles.id` (sua própria PK) em vez de `customers.id`, e a contagem
 * sempre dá 0. Comprovado com `.toSQL()` antes de corrigir — texto puro nos identificadores evita
 * a classe inteira do bug, sem risco de injeção (nenhuma entrada de usuário aqui).
 */
function vehicleCountSql() {
  return sqlOp<number>`(select count(*)::int from "vehicles" "v" where "v"."customer_id" = "customers"."id")`;
}

export async function fetchCustomers(filters: CustomersQueryFilters): Promise<CustomersQueryResult> {
  if (!isDatabaseConfigured()) {
    return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };
  }
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };

  const conditions = [eq(customers.source, "jumppark")];
  if (filters.nameQuery) conditions.push(ilike(customers.name, `%${filters.nameQuery}%`));

  const today = saoPauloDateISO();
  switch (filters.segment) {
    case "novos":
      conditions.push(gte(customers.firstVisitAt, filters.segmentPeriod.from), lte(customers.firstVisitAt, filters.segmentPeriod.to));
      break;
    case "recorrentes":
      conditions.push(gte(customers.visitCount, RECORRENTE_VISIT_THRESHOLD));
      break;
    case "vip":
      conditions.push(gte(customers.visitCount, VIP_VISIT_THRESHOLD), gte(customers.lastVisit, addDaysIso(today, -VIP_MAX_INACTIVITY_DAYS)));
      break;
    case "sem_retorno_30":
      conditions.push(lte(customers.lastVisit, addDaysIso(today, -30)));
      break;
    case "sem_retorno_45":
      conditions.push(lte(customers.lastVisit, addDaysIso(today, -45)));
      break;
    case "sem_retorno_60":
      conditions.push(lte(customers.lastVisit, addDaysIso(today, -60)));
      break;
    case "sem_retorno_90":
      conditions.push(lte(customers.lastVisit, addDaysIso(today, -90)));
      break;
    case "mais_veiculos":
      conditions.push(sqlOp`${vehicleCountSql()} > 1`);
      break;
    case "reativados": {
      const ids = await computeReactivatedCustomerIds(db, filters.segmentPeriod);
      conditions.push(ids.length > 0 ? inArray(customers.id, ids) : sqlOp`false`);
      break;
    }
  }

  const where = and(...conditions);

  const sortColumn =
    filters.sortBy === "totalSpent"
      ? customers.totalSpent
      : filters.sortBy === "visitCount"
        ? customers.visitCount
        : filters.sortBy === "averageTicket"
          ? customers.averageTicket
          : filters.sortBy === "vehicleCount"
            ? vehicleCountSql()
            : customers.lastVisit;
  const orderFn = filters.sortDir === "asc" ? asc : desc;

  const [rows, totalRows] = await Promise.all([
    db
      .select({ ...getTableColumns(customers), vehicleCount: vehicleCountSql() })
      .from(customers)
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: sqlOp<number>`count(*)::int` }).from(customers).where(where),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const now = new Date();

  return {
    items: rows.map((row) => toListItem(row, now)),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount,
    databaseConfigured: true,
  };
}

/**
 * Contagem de clientes em cada segmento — alimenta os tiles clicáveis no topo de `/ordens/clientes`.
 * Uma consulta só, com `count(*) filter (where ...)` por segmento, exceto "reativados" (calculado
 * à parte, mesma lógica de `fetchCustomers`). Sempre em relação ao mesmo `segmentPeriod`.
 */
export async function fetchCustomerSegmentCounts(segmentPeriod: { from: string; to: string }): Promise<Record<CustomerSegmentKey, number>> {
  const zero = Object.fromEntries(CUSTOMER_SEGMENT_KEYS.map((k) => [k, 0])) as Record<CustomerSegmentKey, number>;
  if (!isDatabaseConfigured()) return zero;
  const db = getDb();
  if (!db) return zero;

  const today = saoPauloDateISO();
  const base = eq(customers.source, "jumppark");

  const [row] = await db
    .select({
      novos: sqlOp<number>`count(*) filter (where ${customers.firstVisitAt} >= ${segmentPeriod.from} and ${customers.firstVisitAt} <= ${segmentPeriod.to})::int`,
      recorrentes: sqlOp<number>`count(*) filter (where ${customers.visitCount} >= ${RECORRENTE_VISIT_THRESHOLD})::int`,
      vip: sqlOp<number>`count(*) filter (where ${customers.visitCount} >= ${VIP_VISIT_THRESHOLD} and ${customers.lastVisit} >= ${addDaysIso(today, -VIP_MAX_INACTIVITY_DAYS)})::int`,
      sem_retorno_30: sqlOp<number>`count(*) filter (where ${customers.lastVisit} <= ${addDaysIso(today, -30)})::int`,
      sem_retorno_45: sqlOp<number>`count(*) filter (where ${customers.lastVisit} <= ${addDaysIso(today, -45)})::int`,
      sem_retorno_60: sqlOp<number>`count(*) filter (where ${customers.lastVisit} <= ${addDaysIso(today, -60)})::int`,
      sem_retorno_90: sqlOp<number>`count(*) filter (where ${customers.lastVisit} <= ${addDaysIso(today, -90)})::int`,
      mais_veiculos: sqlOp<number>`count(*) filter (where ${vehicleCountSql()} > 1)::int`,
    })
    .from(customers)
    .where(base);

  const reactivatedIds = await computeReactivatedCustomerIds(db, segmentPeriod);

  return { ...zero, ...row, reativados: reactivatedIds.length };
}

export type CustomerVehicleRow = typeof vehicles.$inferSelect;
export type CustomerOrderRow = typeof jumpParkServiceOrders.$inferSelect;

export interface CustomerDetail {
  customer: typeof customers.$inferSelect;
  status: CustomerStatus;
  statusReason: string;
  daysSinceLastVisit: number | null;
  vehicles: CustomerVehicleRow[];
  orders: CustomerOrderRow[];
}

export async function fetchCustomerById(id: string): Promise<CustomerDetail | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.source, "jumppark")))
    .limit(1);
  const customer = rows[0];
  if (!customer) return null;

  const [customerVehicles, orders] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.customerId, id)).orderBy(desc(vehicles.lastSeenAt)),
    db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.customerId, id)).orderBy(desc(jumpParkServiceOrders.orderDate)),
  ]);

  const now = new Date();
  const visitCount = customer.visitCount ?? 0;
  const daysSinceLastVisit = customer.lastVisit ? daysBetween(customer.lastVisit, now) : null;
  const { status, reason } = computeCustomerStatus({ visitCount, daysSinceLastVisit });

  return { customer, status, statusReason: reason, daysSinceLastVisit, vehicles: customerVehicles, orders };
}

export { VIP_VISIT_THRESHOLD, RECORRENTE_VISIT_THRESHOLD, AT_RISK_CUSTOMER_DAYS, LOST_CUSTOMER_DAYS };
