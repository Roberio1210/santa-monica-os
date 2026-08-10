import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, ilike, inArray, lte, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured, type Database } from "@/db/client";
import { customers, identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { RECORRENTE_VISIT_THRESHOLD } from "@/lib/crm-intelligente/profile";
import { VEHICLE_SEGMENT_KEYS, type VehicleSegmentKey } from "@/lib/integrations/jumppark/vehicleSegments";
import { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, type FrequencyTrend } from "@/lib/integrations/jumppark/vehicleAnalytics";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão 30 (módulo gerencial de Veículos) — consulta somente leitura sobre `vehicles`
 * (`source = 'jumppark'`) + agregações sobre `jumppark_service_orders`/`jumppark_service_order_items`.
 * `vehicles` não guarda `totalSpent`/`averageTicket` (ao contrário de `customers`) — sempre
 * recalculado por subquery correlacionada. Mesma técnica "texto puro nos identificadores" já
 * usada em `customersQuery.ts` (`vehicleCountSql`) para evitar o bug real do Drizzle documentado
 * lá: reaproveitar uma referência de coluna do Drizzle dentro de uma subquery correlacionada,
 * junto de `getTableColumns()` no mesmo `select()`, faz o qualificador de tabela sumir e a
 * subquery autocorrelacionar contra a tabela errada.
 */

export type VehicleSortBy = "lastVisit" | "visitCount" | "totalSpent" | "averageTicket" | "model";
export type VehicleSortDir = "asc" | "desc";

const SORT_KEYS: VehicleSortBy[] = ["lastVisit", "visitCount", "totalSpent", "averageTicket", "model"];
const DEFAULT_PAGE_SIZE = 25;

export interface VehiclesQueryFilters {
  modelQuery: string | null;
  plateQuery: string | null;
  customerQuery: string | null;
  serviceQuery: string | null;
  minVisits: number | null;
  minSpent: number | null;
  maxSpent: number | null;
  /**
   * Ao contrário de Clientes (onde "novos"/"reativados" dependem de um período escolhido), nenhum
   * segmento de Veículos depende de período selecionável — todos são janelas fixas relativas a
   * hoje ("últimos 30 dias") ou condições estruturais (recorrente, identidade ambígua etc.). O
   * período global só é usado pela seção de rankings (`fetchVehicleRankings`), separadamente.
   */
  segment: VehicleSegmentKey | null;
  sortBy: VehicleSortBy;
  sortDir: VehicleSortDir;
  page: number;
  pageSize: number;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseVehiclesQueryFilters(params: Record<string, string | undefined>): VehiclesQueryFilters {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sortBy: VehicleSortBy = SORT_KEYS.includes(params.sort as VehicleSortBy) ? (params.sort as VehicleSortBy) : "lastVisit";
  const sortDir: VehicleSortDir = params.dir === "asc" ? "asc" : "desc";
  const segment = VEHICLE_SEGMENT_KEYS.includes(params.segmento as VehicleSegmentKey) ? (params.segmento as VehicleSegmentKey) : null;

  return {
    modelQuery: params.modelo?.trim() || null,
    plateQuery: params.placa?.trim() || null,
    customerQuery: params.cliente?.trim() || null,
    serviceQuery: params.servico?.trim() || null,
    minVisits: parseOptionalNumber(params.minVisitas),
    minSpent: parseOptionalNumber(params.gastoMin),
    maxSpent: parseOptionalNumber(params.gastoMax),
    segment,
    sortBy,
    sortDir,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(fromIso)) / 86_400_000);
}

export function plateFromExternalId(externalId: string | null): string | null {
  if (!externalId?.startsWith("plate:")) return null;
  return externalId.slice("plate:".length);
}

export interface VehicleListItem {
  id: string;
  model: string | null;
  plateMasked: string | null;
  customerId: string | null;
  customerName: string | null;
  visitCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  daysSinceLastVisit: number | null;
  totalSpent: number;
  averageTicket: number;
  customerCount: number;
  hasAmbiguousIdentity: boolean;
}

export interface VehiclesQueryResult {
  items: VehicleListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  databaseConfigured: boolean;
}

/** Fragmentos SQL correlacionados, sempre gerados NOVOS a cada chamada — nunca reaproveitar a mesma instância em mais de uma posição da query (ver nota acima). */
function vehicleTotalSpentSql() {
  return sqlOp<number>`(select coalesce(sum("o"."total_amount"),0) from "jumppark_service_orders" "o" where "o"."vehicle_id" = "vehicles"."id")`;
}
function vehicleAverageTicketSql() {
  return sqlOp<number>`(select case when count(*) > 0 then coalesce(sum("o"."total_amount"),0) / count(*) else 0 end from "jumppark_service_orders" "o" where "o"."vehicle_id" = "vehicles"."id")`;
}
function vehicleCustomerCountSql() {
  return sqlOp<number>`(select count(distinct "o"."customer_id")::int from "jumppark_service_orders" "o" where "o"."vehicle_id" = "vehicles"."id" and "o"."customer_id" is not null)`;
}
function vehicleHasAmbiguousIdentitySql() {
  return sqlOp<boolean>`(exists (select 1 from "identity_review_items" "r" where "r"."subject_key" = "vehicles"."external_id" and "r"."active" = true and "r"."status" = 'pending'))`;
}
function vehicleMultiServiceExistsSql() {
  return sqlOp`(exists (select 1 from "jumppark_service_orders" "o" join "jumppark_service_order_items" "i" on "i"."service_order_id" = "o"."id" where "o"."vehicle_id" = "vehicles"."id" group by "o"."id" having count("i"."id") > 1))`;
}
function vehicleServiceQueryExistsSql(query: string) {
  return sqlOp`(exists (select 1 from "jumppark_service_orders" "o" join "jumppark_service_order_items" "i" on "i"."service_order_id" = "o"."id" where "o"."vehicle_id" = "vehicles"."id" and "i"."description" ilike ${`%${query}%`}))`;
}

function toListItem(row: {
  id: string;
  model: string | null;
  externalId: string | null;
  customerId: string;
  customerName: string | null;
  visitCount: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  totalSpent: number | string;
  averageTicket: number | string;
  customerCount: number;
  hasAmbiguousIdentity: boolean;
}, now: Date): VehicleListItem {
  return {
    id: row.id,
    model: row.model,
    plateMasked: plateFromExternalId(row.externalId),
    customerId: row.customerId,
    customerName: row.customerName,
    visitCount: row.visitCount ?? 0,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    daysSinceLastVisit: row.lastSeenAt ? daysBetween(row.lastSeenAt, now) : null,
    totalSpent: Math.round(Number(row.totalSpent) * 100) / 100,
    averageTicket: Math.round(Number(row.averageTicket) * 100) / 100,
    customerCount: row.customerCount,
    hasAmbiguousIdentity: row.hasAmbiguousIdentity,
  };
}

/**
 * Todas as datas de ordem por veículo (id -> datas ordenadas) — base comum para tudo que depende
 * do histórico completo (não expressável como WHERE simples): "parou_de_vir", ranking de
 * frequência. Uma consulta só, reaproveitada pelos dois. Mesma arquitetura de
 * `computeReactivatedCustomerIds` em `customersQuery.ts`.
 */
async function fetchAllVehicleOrderDates(db: Database): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ vehicleId: jumpParkServiceOrders.vehicleId, orderDate: jumpParkServiceOrders.orderDate })
    .from(jumpParkServiceOrders)
    .where(sqlOp`${jumpParkServiceOrders.vehicleId} is not null`)
    .orderBy(asc(jumpParkServiceOrders.vehicleId), asc(jumpParkServiceOrders.orderDate));

  const datesByVehicle = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.vehicleId) continue;
    const list = datesByVehicle.get(row.vehicleId) ?? [];
    list.push(row.orderDate);
    datesByVehicle.set(row.vehicleId, list);
  }
  return datesByVehicle;
}

async function computeStoppedComingVehicleIds(db: Database): Promise<Set<string>> {
  const datesByVehicle = await fetchAllVehicleOrderDates(db);
  const today = saoPauloDateISO();
  const stopped = new Set<string>();
  for (const [vehicleId, dates] of datesByVehicle) {
    const sorted = [...dates].sort();
    const lastDate = sorted[sorted.length - 1];
    const daysSince = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000);
    if (hasStoppedComing(sorted, daysSince)) stopped.add(vehicleId);
  }
  return stopped;
}

export async function fetchVehicles(filters: VehiclesQueryFilters): Promise<VehiclesQueryResult> {
  if (!isDatabaseConfigured()) return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };

  const conditions = [eq(vehicles.source, "jumppark")];
  if (filters.modelQuery) conditions.push(ilike(vehicles.model, `%${filters.modelQuery}%`));
  if (filters.plateQuery) conditions.push(ilike(vehicles.externalId, `%${filters.plateQuery}%`));
  if (filters.customerQuery) conditions.push(ilike(customers.name, `%${filters.customerQuery}%`));
  if (filters.serviceQuery) conditions.push(vehicleServiceQueryExistsSql(filters.serviceQuery));
  if (filters.minVisits !== null) conditions.push(gte(vehicles.visitCount, filters.minVisits));
  if (filters.minSpent !== null) conditions.push(sqlOp`${vehicleTotalSpentSql()} >= ${filters.minSpent}`);
  if (filters.maxSpent !== null) conditions.push(sqlOp`${vehicleTotalSpentSql()} <= ${filters.maxSpent}`);

  const today = saoPauloDateISO();
  switch (filters.segment) {
    case "atendido_hoje":
      conditions.push(gte(vehicles.lastSeenAt, today));
      break;
    case "ultimos_7_dias":
      conditions.push(gte(vehicles.lastSeenAt, addDaysIso(today, -6)));
      break;
    case "ultimos_30_dias":
      conditions.push(gte(vehicles.lastSeenAt, addDaysIso(today, -29)));
      break;
    case "ultimos_60_dias":
      conditions.push(gte(vehicles.lastSeenAt, addDaysIso(today, -59)));
      break;
    case "ultimos_90_dias":
      conditions.push(gte(vehicles.lastSeenAt, addDaysIso(today, -89)));
      break;
    case "sem_retorno_30":
      conditions.push(lte(vehicles.lastSeenAt, addDaysIso(today, -30)));
      break;
    case "sem_retorno_45":
      conditions.push(lte(vehicles.lastSeenAt, addDaysIso(today, -45)));
      break;
    case "sem_retorno_60":
      conditions.push(lte(vehicles.lastSeenAt, addDaysIso(today, -60)));
      break;
    case "sem_retorno_90":
      conditions.push(lte(vehicles.lastSeenAt, addDaysIso(today, -90)));
      break;
    case "recorrentes":
      conditions.push(gte(vehicles.visitCount, RECORRENTE_VISIT_THRESHOLD));
      break;
    case "unica_visita":
      conditions.push(eq(vehicles.visitCount, 1));
      break;
    case "multi_cliente":
      conditions.push(sqlOp`${vehicleCustomerCountSql()} > 1`);
      break;
    case "multi_servico":
      conditions.push(vehicleMultiServiceExistsSql());
      break;
    case "identidade_ambigua":
      conditions.push(vehicleHasAmbiguousIdentitySql());
      break;
    case "parou_de_vir": {
      const stoppedComingIds = await computeStoppedComingVehicleIds(db);
      conditions.push(stoppedComingIds.size > 0 ? inArray(vehicles.id, Array.from(stoppedComingIds)) : sqlOp`false`);
      break;
    }
  }

  const where = and(...conditions);

  const sortColumn =
    filters.sortBy === "visitCount"
      ? vehicles.visitCount
      : filters.sortBy === "totalSpent"
        ? vehicleTotalSpentSql()
        : filters.sortBy === "averageTicket"
          ? vehicleAverageTicketSql()
          : filters.sortBy === "model"
            ? vehicles.model
            : vehicles.lastSeenAt;
  const orderFn = filters.sortDir === "asc" ? asc : desc;

  const baseQuery = db
    .select({
      ...getTableColumns(vehicles),
      customerName: customers.name,
      totalSpent: vehicleTotalSpentSql(),
      averageTicket: vehicleAverageTicketSql(),
      customerCount: vehicleCustomerCountSql(),
      hasAmbiguousIdentity: vehicleHasAmbiguousIdentitySql(),
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.customerId, customers.id));

  const countQuery = db.select({ value: sqlOp<number>`count(*)::int` }).from(vehicles).leftJoin(customers, eq(vehicles.customerId, customers.id));

  const [rows, totalRows] = await Promise.all([
    baseQuery
      .where(where)
      // Desempate estável por id — sem isso, empates no critério de ordenação (ex.: dois
      // veículos com o mesmo total gasto) podem mudar de ordem entre páginas, fazendo a
      // paginação pular ou repetir linhas.
      .orderBy(orderFn(sortColumn), asc(vehicles.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    countQuery.where(where),
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

/** Contagem por segmento — alimenta os tiles clicáveis no topo de `/ordens/veiculos`. Nenhum segmento de veículo depende de período (ver nota em `VehiclesQueryFilters`). */
export async function fetchVehicleSegmentCounts(): Promise<Record<VehicleSegmentKey, number>> {
  const zero = Object.fromEntries(VEHICLE_SEGMENT_KEYS.map((k) => [k, 0])) as Record<VehicleSegmentKey, number>;
  if (!isDatabaseConfigured()) return zero;
  const db = getDb();
  if (!db) return zero;

  const today = saoPauloDateISO();
  const base = eq(vehicles.source, "jumppark");

  const [row] = await db
    .select({
      atendido_hoje: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} >= ${today})::int`,
      ultimos_7_dias: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} >= ${addDaysIso(today, -6)})::int`,
      ultimos_30_dias: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} >= ${addDaysIso(today, -29)})::int`,
      ultimos_60_dias: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} >= ${addDaysIso(today, -59)})::int`,
      ultimos_90_dias: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} >= ${addDaysIso(today, -89)})::int`,
      sem_retorno_30: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} <= ${addDaysIso(today, -30)})::int`,
      sem_retorno_45: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} <= ${addDaysIso(today, -45)})::int`,
      sem_retorno_60: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} <= ${addDaysIso(today, -60)})::int`,
      sem_retorno_90: sqlOp<number>`count(*) filter (where ${vehicles.lastSeenAt} <= ${addDaysIso(today, -90)})::int`,
      recorrentes: sqlOp<number>`count(*) filter (where ${vehicles.visitCount} >= ${RECORRENTE_VISIT_THRESHOLD})::int`,
      unica_visita: sqlOp<number>`count(*) filter (where ${vehicles.visitCount} = 1)::int`,
      multi_cliente: sqlOp<number>`count(*) filter (where ${vehicleCustomerCountSql()} > 1)::int`,
      multi_servico: sqlOp<number>`count(*) filter (where ${vehicleMultiServiceExistsSql()})::int`,
      identidade_ambigua: sqlOp<number>`count(*) filter (where ${vehicleHasAmbiguousIdentitySql()})::int`,
    })
    .from(vehicles)
    .where(base);

  const stoppedComingIds = await computeStoppedComingVehicleIds(db);

  return { ...zero, ...row, parou_de_vir: stoppedComingIds.size };
}

export type VehicleOrderRow = typeof jumpParkServiceOrders.$inferSelect;
export type VehicleOrderItemRow = typeof jumpParkServiceOrderItems.$inferSelect;

export interface VehicleLinkedCustomer {
  customerId: string;
  name: string | null;
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
}

export interface VehicleDetail {
  vehicle: typeof vehicles.$inferSelect;
  plateMasked: string | null;
  currentCustomerName: string | null;
  daysSinceLastVisit: number | null;
  totalSpent: number;
  averageTicket: number;
  averageIntervalDays: number | null;
  frequencyTrend: FrequencyTrend;
  hasStoppedComing: boolean;
  linkedCustomers: VehicleLinkedCustomer[];
  orders: VehicleOrderRow[];
  itemsByOrderId: Map<string, VehicleOrderItemRow[]>;
  identityReviewItemId: string | null;
}

export async function fetchVehicleById(id: string): Promise<VehicleDetail | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.source, "jumppark"))).limit(1);
  const vehicle = rows[0];
  if (!vehicle) return null;

  const [currentCustomerRows, orders, reviewItemRows] = await Promise.all([
    vehicle.customerId ? db.select({ name: customers.name }).from(customers).where(eq(customers.id, vehicle.customerId)).limit(1) : Promise.resolve([]),
    db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.vehicleId, id)).orderBy(desc(jumpParkServiceOrders.orderDate)),
    vehicle.externalId
      ? db.select({ id: identityReviewItems.id }).from(identityReviewItems).where(and(eq(identityReviewItems.subjectKey, vehicle.externalId), eq(identityReviewItems.active, true))).limit(1)
      : Promise.resolve([]),
  ]);

  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length > 0 ? await db.select().from(jumpParkServiceOrderItems).where(inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds)) : [];
  const itemsByOrderId = new Map<string, VehicleOrderItemRow[]>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.serviceOrderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.serviceOrderId, list);
  }

  const now = new Date();
  const daysSinceLastVisit = vehicle.lastSeenAt ? daysBetween(vehicle.lastSeenAt, now) : null;
  const totalSpent = Math.round(orders.reduce((sum, o) => sum + Number(o.totalAmount), 0) * 100) / 100;
  const visitCount = vehicle.visitCount ?? orders.length;
  const averageTicket = visitCount > 0 ? Math.round((totalSpent / visitCount) * 100) / 100 : 0;

  const orderDates = orders.map((o) => o.orderDate).sort();
  const avgInterval = averageIntervalDays(orderDates);
  const trend = computeFrequencyTrend(orderDates);
  const stoppedComing = hasStoppedComing(orderDates, daysSinceLastVisit);

  const customersByOrder = new Map<string, { name: string | null; dates: string[] }>();
  for (const order of orders) {
    if (!order.customerId) continue;
    const entry = customersByOrder.get(order.customerId) ?? { name: order.clientName, dates: [] };
    entry.dates.push(order.orderDate);
    if (order.clientName) entry.name = order.clientName;
    customersByOrder.set(order.customerId, entry);
  }
  const linkedCustomers: VehicleLinkedCustomer[] = Array.from(customersByOrder.entries())
    .map(([customerId, v]) => ({
      customerId,
      name: v.name,
      visitCount: v.dates.length,
      firstVisit: [...v.dates].sort()[0],
      lastVisit: [...v.dates].sort()[v.dates.length - 1],
    }))
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));

  return {
    vehicle,
    plateMasked: plateFromExternalId(vehicle.externalId),
    currentCustomerName: currentCustomerRows[0]?.name ?? null,
    daysSinceLastVisit,
    totalSpent,
    averageTicket,
    averageIntervalDays: avgInterval,
    frequencyTrend: trend,
    hasStoppedComing: stoppedComing,
    linkedCustomers,
    orders,
    itemsByOrderId,
    identityReviewItemId: reviewItemRows[0]?.id ?? null,
  };
}

export interface VehicleRankingEntry {
  vehicleId: string;
  model: string | null;
  plateMasked: string | null;
  customerName: string | null;
  value: number;
}

export interface VehicleRankings {
  /** Contagem de veículos distintos (por vehicleId) com ao menos uma ordem no período — "quantidade total de veículos por período". */
  vehicleCountInPeriod: number;
  /** Visitas, gasto, ticket médio e nº de serviços — sempre restritos ao período informado (ordens com `orderDate` no intervalo). */
  topByVisitsInPeriod: VehicleRankingEntry[];
  topBySpendInPeriod: VehicleRankingEntry[];
  topByAverageTicketInPeriod: VehicleRankingEntry[];
  topByServiceCountInPeriod: VehicleRankingEntry[];
  /**
   * Frequência (intervalo médio) e dias sem retornar são conceitos vitalícios por natureza — um
   * veículo com 1 visita dentro de uma janela de 7 dias não tem "frequência" alguma para medir
   * ali dentro. Por isso estes dois rankings usam o histórico completo do veículo, não o período
   * selecionado — documentado explicitamente na UI via "Como foi calculado".
   */
  topByFrequencyLifetime: VehicleRankingEntry[];
  topByDaysSinceReturnLifetime: VehicleRankingEntry[];
}

function toRankingEntry(row: { vehicleId: string; model: string | null; externalId: string | null; customerName: string | null; value: number }): VehicleRankingEntry {
  return { vehicleId: row.vehicleId, model: row.model, plateMasked: plateFromExternalId(row.externalId), customerName: row.customerName, value: Math.round(row.value * 100) / 100 };
}

export async function fetchVehicleRankings(period: { from: string; to: string }, limit = 10): Promise<VehicleRankings> {
  const empty: VehicleRankings = { vehicleCountInPeriod: 0, topByVisitsInPeriod: [], topBySpendInPeriod: [], topByAverageTicketInPeriod: [], topByServiceCountInPeriod: [], topByFrequencyLifetime: [], topByDaysSinceReturnLifetime: [] };
  if (!isDatabaseConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;

  const periodOrders = await db
    .select({
      vehicleId: jumpParkServiceOrders.vehicleId,
      id: jumpParkServiceOrders.id,
      totalAmount: jumpParkServiceOrders.totalAmount,
      model: jumpParkServiceOrders.vehicleModel,
      plateMasked: jumpParkServiceOrders.plateMasked,
      clientName: jumpParkServiceOrders.clientName,
    })
    .from(jumpParkServiceOrders)
    .where(and(gte(jumpParkServiceOrders.orderDate, period.from), lte(jumpParkServiceOrders.orderDate, period.to), sqlOp`${jumpParkServiceOrders.vehicleId} is not null`));

  if (periodOrders.length === 0) return empty;

  const orderIds = periodOrders.map((o) => o.id);
  const itemCounts = await db
    .select({ serviceOrderId: jumpParkServiceOrderItems.serviceOrderId, n: sqlOp<number>`count(*)::int` })
    .from(jumpParkServiceOrderItems)
    .where(inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds))
    .groupBy(jumpParkServiceOrderItems.serviceOrderId);
  const itemCountByOrderId = new Map(itemCounts.map((r) => [r.serviceOrderId, r.n]));

  interface Agg {
    model: string | null;
    plateMasked: string | null;
    customerName: string | null;
    visits: number;
    spend: number;
    services: number;
  }
  const byVehicle = new Map<string, Agg>();
  for (const order of periodOrders) {
    if (!order.vehicleId) continue;
    const agg = byVehicle.get(order.vehicleId) ?? { model: order.model, plateMasked: order.plateMasked, customerName: order.clientName, visits: 0, spend: 0, services: 0 };
    agg.visits += 1;
    agg.spend += Number(order.totalAmount);
    agg.services += itemCountByOrderId.get(order.id) ?? 0;
    if (order.model) agg.model = order.model;
    if (order.clientName) agg.customerName = order.clientName;
    byVehicle.set(order.vehicleId, agg);
  }

  const entries = Array.from(byVehicle.entries()).map(([vehicleId, agg]) => ({ vehicleId, ...agg, averageTicket: agg.visits > 0 ? agg.spend / agg.visits : 0 }));

  const topByVisitsInPeriod = [...entries]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
    .map((e) => toRankingEntry({ vehicleId: e.vehicleId, model: e.model, externalId: e.plateMasked ? `plate:${e.plateMasked}` : null, customerName: e.customerName, value: e.visits }));
  const topBySpendInPeriod = [...entries]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit)
    .map((e) => toRankingEntry({ vehicleId: e.vehicleId, model: e.model, externalId: e.plateMasked ? `plate:${e.plateMasked}` : null, customerName: e.customerName, value: e.spend }));
  const topByAverageTicketInPeriod = [...entries]
    .sort((a, b) => b.averageTicket - a.averageTicket)
    .slice(0, limit)
    .map((e) => toRankingEntry({ vehicleId: e.vehicleId, model: e.model, externalId: e.plateMasked ? `plate:${e.plateMasked}` : null, customerName: e.customerName, value: e.averageTicket }));
  const topByServiceCountInPeriod = [...entries]
    .sort((a, b) => b.services - a.services)
    .slice(0, limit)
    .map((e) => toRankingEntry({ vehicleId: e.vehicleId, model: e.model, externalId: e.plateMasked ? `plate:${e.plateMasked}` : null, customerName: e.customerName, value: e.services }));

  const allDatesByVehicle = await fetchAllVehicleOrderDates(db);
  const vehicleRows = await db
    .select({ id: vehicles.id, model: vehicles.model, externalId: vehicles.externalId, lastSeenAt: vehicles.lastSeenAt, customerId: vehicles.customerId })
    .from(vehicles)
    .where(and(eq(vehicles.source, "jumppark"), inArray(vehicles.id, Array.from(allDatesByVehicle.keys()))));
  const customerIds = Array.from(new Set(vehicleRows.map((v) => v.customerId)));
  const customerNameById = new Map(
    customerIds.length > 0 ? (await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds))).map((c) => [c.id, c.name]) : [],
  );

  const today = saoPauloDateISO();
  const frequencyEntries = vehicleRows
    .map((v) => {
      const dates = allDatesByVehicle.get(v.id) ?? [];
      const avg = averageIntervalDays(dates);
      return avg === null ? null : { vehicleId: v.id, model: v.model, externalId: v.externalId, customerName: customerNameById.get(v.customerId) ?? null, value: avg };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.value - b.value)
    .slice(0, limit)
    .map(toRankingEntry);

  const daysSinceReturnEntries = vehicleRows
    .filter((v) => v.lastSeenAt !== null)
    .map((v) => ({
      vehicleId: v.id,
      model: v.model,
      externalId: v.externalId,
      customerName: customerNameById.get(v.customerId) ?? null,
      value: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${v.lastSeenAt}T00:00:00Z`)) / 86_400_000),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(toRankingEntry);

  return {
    vehicleCountInPeriod: byVehicle.size,
    topByVisitsInPeriod,
    topBySpendInPeriod,
    topByAverageTicketInPeriod,
    topByServiceCountInPeriod,
    topByFrequencyLifetime: frequencyEntries,
    topByDaysSinceReturnLifetime: daysSinceReturnEntries,
  };
}

/** Ordens reais de um conjunto de veículos dentro de um período — base do drill-down "abrir as ordens correspondentes" nos rankings (ex.: soma do Top 10 por gasto). */
export async function fetchOrdersForVehiclesInPeriod(vehicleIds: string[], period: { from: string; to: string }): Promise<VehicleOrderRow[]> {
  if (vehicleIds.length === 0) return [];
  if (!isDatabaseConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  return db
    .select()
    .from(jumpParkServiceOrders)
    .where(and(inArray(jumpParkServiceOrders.vehicleId, vehicleIds), gte(jumpParkServiceOrders.orderDate, period.from), lte(jumpParkServiceOrders.orderDate, period.to)))
    .orderBy(desc(jumpParkServiceOrders.orderDate));
}
