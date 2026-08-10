import "server-only";
import { eq, inArray, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured, type Database } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";

/**
 * Missão 29 (sistema gerencial completo) — "serviços mais realizados"/"serviços nunca
 * realizados"/oportunidades comerciais no perfil do cliente. Deriva uma categoria a partir da
 * descrição real do item de serviço (ex.: "Lavação Gold - SUV" e "Lavação Gold - Hatch" viram a
 * mesma categoria "Lavação Gold") — sem essa normalização, "nunca realizados" ficaria cheio de
 * ruído (todo cliente com só Hatch "nunca fez" a variante SUV do mesmo serviço). Limitação real e
 * documentada: a descrição é texto livre da JumpPark, então nomes inconsistentes (ex.: "Polimento
 * - Comercial" vs "Polimento Peça - Cliente") viram categorias diferentes mesmo sendo parecidos —
 * nunca inventamos uma correspondência entre elas.
 */

export function serviceCategoryOf(description: string): string {
  const idx = description.indexOf(" - ");
  return (idx === -1 ? description : description.slice(0, idx)).trim();
}

export interface ServiceCategoryCount {
  category: string;
  count: number;
  totalAmount: number;
}

export interface CustomerServiceProfile {
  /** Categorias que este cliente já realizou, da mais para a menos frequente. */
  topServices: ServiceCategoryCount[];
  /** Categorias que existem no catálogo real (alguma outra ordem da base já teve), mas este cliente nunca realizou. */
  neverDone: string[];
}

/** Todas as categorias distintas já vistas em QUALQUER ordem da base — usado como referência para "nunca realizados". */
export async function fetchCatalogServiceCategories(db: Database): Promise<string[]> {
  const rows = await db.select({ description: jumpParkServiceOrderItems.description }).from(jumpParkServiceOrderItems).where(sqlOp`${jumpParkServiceOrderItems.description} is not null`);
  const categories = new Set<string>();
  for (const row of rows) {
    if (row.description) categories.add(serviceCategoryOf(row.description));
  }
  return Array.from(categories).sort();
}

export async function fetchCustomerServiceProfile(db: Database, customerId: string, catalogCategories: string[]): Promise<CustomerServiceProfile> {
  const orderIdRows = await db.select({ id: jumpParkServiceOrders.id }).from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.customerId, customerId));
  const orderIds = orderIdRows.map((r) => r.id);
  if (orderIds.length === 0) return { topServices: [], neverDone: catalogCategories };

  const items = await db
    .select({ description: jumpParkServiceOrderItems.description, amount: jumpParkServiceOrderItems.amount })
    .from(jumpParkServiceOrderItems)
    .where(inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds));

  const byCategory = new Map<string, { count: number; totalAmount: number }>();
  for (const item of items) {
    if (!item.description) continue;
    const category = serviceCategoryOf(item.description);
    const current = byCategory.get(category) ?? { count: 0, totalAmount: 0 };
    current.count += 1;
    current.totalAmount += Number(item.amount ?? 0);
    byCategory.set(category, current);
  }

  const topServices = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, count: v.count, totalAmount: Math.round(v.totalAmount * 100) / 100 }))
    .sort((a, b) => b.count - a.count);

  const doneCategories = new Set(byCategory.keys());
  const neverDone = catalogCategories.filter((c) => !doneCategories.has(c));

  return { topServices, neverDone };
}

/** Ponto de entrada usado pela página de detalhe do cliente — cuida do guard de banco não configurado, mesma convenção do resto de `customersQuery.ts`. */
export async function fetchCustomerServiceProfileById(customerId: string): Promise<CustomerServiceProfile> {
  if (!isDatabaseConfigured()) return { topServices: [], neverDone: [] };
  const db = getDb();
  if (!db) return { topServices: [], neverDone: [] };

  const catalog = await fetchCatalogServiceCategories(db);
  return fetchCustomerServiceProfile(db, customerId, catalog);
}
