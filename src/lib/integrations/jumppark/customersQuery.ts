import "server-only";
import { and, asc, desc, eq, ilike, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { customers, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { computeCustomerStatus, VIP_VISIT_THRESHOLD, RECORRENTE_VISIT_THRESHOLD, AT_RISK_CUSTOMER_DAYS, LOST_CUSTOMER_DAYS } from "@/lib/crm-intelligente/profile";
import type { CustomerStatus } from "@/lib/crm-intelligente/types";

/**
 * Consulta somente leitura do núcleo de Clientes/Veículos derivado da JumpPark (Missão 26, terceira
 * entrega) — sempre filtrada por `source = 'jumppark'`, nunca mistura com clientes cadastrados
 * manualmente no Atendimento (que usam a mesma tabela `customers`, mas nunca têm `external_id`).
 * "Dias sem retornar" e status (VIP/recorrente/em risco/perdido) são calculados em tempo de leitura,
 * reaproveitando exatamente os mesmos limiares já definidos e testados em `crm-intelligente/profile.ts`
 * — nenhuma regra nova de negócio nasce aqui.
 */

export type CustomerSortBy = "lastVisit" | "totalSpent" | "visitCount";
export type CustomerSortDir = "asc" | "desc";

export interface CustomersQueryFilters {
  nameQuery: string | null;
  sortBy: CustomerSortBy;
  sortDir: CustomerSortDir;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;

export function parseCustomersQueryFilters(params: Record<string, string | undefined>): CustomersQueryFilters {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sortBy: CustomerSortBy = params.sort === "totalSpent" ? "totalSpent" : params.sort === "visitCount" ? "visitCount" : "lastVisit";
  const sortDir: CustomerSortDir = params.dir === "asc" ? "asc" : "desc";

  return {
    nameQuery: params.cliente?.trim() || null,
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
  status: CustomerStatus;
  statusReason: string;
}

export interface CustomersQueryResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  databaseConfigured: boolean;
}

function toListItem(row: typeof customers.$inferSelect, now: Date): CustomerListItem {
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
    status,
    statusReason: reason,
  };
}

export async function fetchCustomers(filters: CustomersQueryFilters): Promise<CustomersQueryResult> {
  if (!isDatabaseConfigured()) {
    return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };
  }
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1, pageSize: filters.pageSize, pageCount: 0, databaseConfigured: false };

  const conditions = [eq(customers.source, "jumppark")];
  if (filters.nameQuery) conditions.push(ilike(customers.name, `%${filters.nameQuery}%`));
  const where = and(...conditions);

  const sortColumn = filters.sortBy === "totalSpent" ? customers.totalSpent : filters.sortBy === "visitCount" ? customers.visitCount : customers.lastVisit;
  const orderFn = filters.sortDir === "asc" ? asc : desc;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
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
