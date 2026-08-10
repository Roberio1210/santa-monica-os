import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured, type Database } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { fetchCatalogServiceCategories, serviceCategoryOf, type ServiceCategoryCount } from "@/lib/integrations/jumppark/customerServiceProfile";
import { topServiceCombinations, type ServiceCombination } from "@/lib/integrations/jumppark/vehicleAnalytics";

/**
 * Missão 30 (módulo gerencial de Veículos) — "serviços realizados"/"nunca realizados"/
 * "combinações mais frequentes" no perfil do veículo. Reaproveita `serviceCategoryOf`/
 * `fetchCatalogServiceCategories` de `customerServiceProfile.ts` (Missão 29) — mesma
 * normalização de categoria, nunca duplicada. "Nunca realizado" só é mostrado como oportunidade
 * quando o veículo já tem visitas suficientes para a ausência ser um sinal real (ver
 * `MIN_VISITS_FOR_OPPORTUNITY`), não em veículos com uma visita isolada.
 */

const MIN_VISITS_FOR_OPPORTUNITY = 3;

export interface VehicleServiceProfile {
  topServices: ServiceCategoryCount[];
  /** Só preenchido quando o veículo tem `MIN_VISITS_FOR_OPPORTUNITY`+ visitas — evidência insuficiente antes disso. */
  neverDoneOpportunities: string[];
  topCombinations: ServiceCombination[];
  /** Ordens deste veículo com 2 ou mais itens de serviço distintos na mesma visita. */
  multiServiceOrderCount: number;
}

export async function fetchVehicleServiceProfile(db: Database, vehicleId: string, catalogCategories: string[], visitCount: number): Promise<VehicleServiceProfile> {
  const orderIdRows = await db.select({ id: jumpParkServiceOrders.id }).from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.vehicleId, vehicleId));
  const orderIds = orderIdRows.map((r) => r.id);
  if (orderIds.length === 0) return { topServices: [], neverDoneOpportunities: [], topCombinations: [], multiServiceOrderCount: 0 };

  const items = await db
    .select({ serviceOrderId: jumpParkServiceOrderItems.serviceOrderId, description: jumpParkServiceOrderItems.description, amount: jumpParkServiceOrderItems.amount })
    .from(jumpParkServiceOrderItems)
    .where(inArray(jumpParkServiceOrderItems.serviceOrderId, orderIds));

  const byCategory = new Map<string, { count: number; totalAmount: number }>();
  const categoriesByOrder = new Map<string, string[]>();
  const itemCountByOrder = new Map<string, number>();

  for (const item of items) {
    itemCountByOrder.set(item.serviceOrderId, (itemCountByOrder.get(item.serviceOrderId) ?? 0) + 1);
    if (!item.description) continue;
    const category = serviceCategoryOf(item.description);
    const current = byCategory.get(category) ?? { count: 0, totalAmount: 0 };
    current.count += 1;
    current.totalAmount += Number(item.amount ?? 0);
    byCategory.set(category, current);

    const list = categoriesByOrder.get(item.serviceOrderId) ?? [];
    list.push(category);
    categoriesByOrder.set(item.serviceOrderId, list);
  }

  const topServices = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, count: v.count, totalAmount: Math.round(v.totalAmount * 100) / 100 }))
    .sort((a, b) => b.count - a.count);

  const doneCategories = new Set(byCategory.keys());
  const neverDoneOpportunities = visitCount >= MIN_VISITS_FOR_OPPORTUNITY ? catalogCategories.filter((c) => !doneCategories.has(c)) : [];

  const topCombinations = topServiceCombinations(Array.from(categoriesByOrder.values()));
  const multiServiceOrderCount = Array.from(itemCountByOrder.values()).filter((n) => n > 1).length;

  return { topServices, neverDoneOpportunities, topCombinations, multiServiceOrderCount };
}

export async function fetchVehicleServiceProfileById(vehicleId: string, visitCount: number): Promise<VehicleServiceProfile> {
  if (!isDatabaseConfigured()) return { topServices: [], neverDoneOpportunities: [], topCombinations: [], multiServiceOrderCount: 0 };
  const db = getDb();
  if (!db) return { topServices: [], neverDoneOpportunities: [], topCombinations: [], multiServiceOrderCount: 0 };

  const catalog = await fetchCatalogServiceCategories(db);
  return fetchVehicleServiceProfile(db, vehicleId, catalog, visitCount);
}
