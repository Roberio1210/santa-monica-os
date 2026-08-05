import "server-only";
import { and, asc, desc, eq, gte, ilike, lte, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { jumpParkServiceOrders, jumpParkSyncLogs } from "@/db/schema/jumppark";

/**
 * Central de Ordens (Missão 26, Fase 1 — segunda entrega) — consulta somente leitura, direto do
 * Neon (`jumppark_service_orders`), NUNCA da API da JumpPark ao vivo. Filtros no banco (WHERE),
 * paginação no servidor (LIMIT/OFFSET) — nunca carrega o histórico inteiro no navegador.
 *
 * Sem `services` (nome/lista de serviços) porque a Fase 1 (primeira entrega) deliberadamente não
 * persiste esse detalhe por linha — só os agregados `parkingAmount`/`servicesAmount`. Busca e
 * exibição por "serviço" não são implementadas aqui por esse motivo, não por omissão — ver
 * "Limitações" no relatório da missão. Não ampliamos o pipeline de sincronização nesta entrega.
 */

export type OrderSortBy = "date" | "amount";
export type OrderSortDir = "asc" | "desc";

export interface OrdersQueryFilters {
  dateFrom: string | null;
  dateTo: string | null;
  clientQuery: string | null;
  plateQuery: string | null;
  vehicleQuery: string | null;
  status: string | null;
  sortBy: OrderSortBy;
  sortDir: OrderSortDir;
  page: number;
  pageSize: number;
}

export type JumpParkServiceOrderRow = typeof jumpParkServiceOrders.$inferSelect;

export interface OrdersQueryResult {
  items: JumpParkServiceOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  lastSyncAt: string | null;
  databaseConfigured: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

export function parseOrdersQueryFilters(params: Record<string, string | undefined>): OrdersQueryFilters {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sortBy: OrderSortBy = params.sort === "amount" ? "amount" : "date";
  const sortDir: OrderSortDir = params.dir === "asc" ? "asc" : "desc";

  return {
    dateFrom: params.from?.trim() || null,
    dateTo: params.to?.trim() || null,
    clientQuery: params.cliente?.trim() || null,
    plateQuery: params.placa?.trim() || null,
    vehicleQuery: params.veiculo?.trim() || null,
    status: params.status?.trim() || null,
    sortBy,
    sortDir,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

/** Lista de status realmente presentes na tabela — nunca uma lista fixa inventada. */
export async function listDistinctStatuses(): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ situation: jumpParkServiceOrders.situation }).from(jumpParkServiceOrders);
  return rows.map((r) => r.situation).filter((s): s is string => !!s).sort();
}

export async function fetchOrders(filters: OrdersQueryFilters): Promise<OrdersQueryResult> {
  if (!isDatabaseConfigured()) {
    return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, lastSyncAt: null, databaseConfigured: false };
  }
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, lastSyncAt: null, databaseConfigured: false };

  const conditions = [];
  if (filters.dateFrom) conditions.push(gte(jumpParkServiceOrders.orderDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(jumpParkServiceOrders.orderDate, filters.dateTo));
  if (filters.clientQuery) conditions.push(ilike(jumpParkServiceOrders.clientName, `%${filters.clientQuery}%`));
  if (filters.plateQuery) conditions.push(ilike(jumpParkServiceOrders.plateMasked, `%${filters.plateQuery}%`));
  if (filters.vehicleQuery) conditions.push(ilike(jumpParkServiceOrders.vehicleModel, `%${filters.vehicleQuery}%`));
  if (filters.status) conditions.push(eq(jumpParkServiceOrders.situation, filters.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderColumn = filters.sortBy === "amount" ? jumpParkServiceOrders.totalAmount : jumpParkServiceOrders.orderDate;
  const orderFn = filters.sortDir === "asc" ? asc : desc;

  const [items, totalRows, lastSyncRows] = await Promise.all([
    db
      .select()
      .from(jumpParkServiceOrders)
      .where(where)
      .orderBy(orderFn(orderColumn), desc(jumpParkServiceOrders.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: sqlOp<number>`count(*)::int` }).from(jumpParkServiceOrders).where(where),
    db.select({ finishedAt: jumpParkSyncLogs.finishedAt }).from(jumpParkSyncLogs).where(eq(jumpParkSyncLogs.status, "success")).orderBy(desc(jumpParkSyncLogs.finishedAt)).limit(1),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount,
    lastSyncAt: lastSyncRows[0]?.finishedAt ? lastSyncRows[0].finishedAt.toISOString() : null,
    databaseConfigured: true,
  };
}

export async function fetchOrderById(id: string): Promise<JumpParkServiceOrderRow | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, id)).limit(1);
  return rows[0] ?? null;
}
