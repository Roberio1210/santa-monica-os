import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";

export interface ServiceCatalogEntry {
  id: string;
  name: string;
  category: string | null;
}

/** Catálogo de serviços (Fase B) — honesto: retorna vazio quando não há Postgres configurado, nunca inventa serviços. */
export async function listServices(): Promise<ServiceCatalogEntry[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select({ id: services.id, name: services.name, category: services.category }).from(services).where(eq(services.active, true));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function fetchServiceNameMap(): Promise<Map<string, string>> {
  const list = await listServices();
  return new Map(list.map((s) => [s.id, s.name]));
}
