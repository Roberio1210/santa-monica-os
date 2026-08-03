import type { ServiceOrder } from "@/lib/attendance/types";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { CommercialHistory, CommercialHistoryBucket } from "@/lib/crm-intelligente/types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * "Histórico Comercial" (Missão 21) — a missão cita nomes ilustrativos ("Sanitizações",
 * "Higienizações", "Motores") que não existem literalmente no catálogo real (ver
 * `src/db/seed/recipe-engine-services.ts`: os nomes reais são "Higienização Interna", "Lavagem de
 * Motor"/"Lavagem de Chassi"). Em vez de inventar categorias que não existem no banco, agrupamos
 * pelos dados reais: pacotes (Bronze/Silver/Gold/Premium Detail) individualmente — são nomeados
 * um a um no pedido — e o restante pela `category` real do catálogo (Polimento, Vitrificação,
 * Motor e chassi, Higienização, Vidros, Lavagem, Faróis, Outros).
 */
export function buildCommercialHistory(params: { orders: ServiceOrder[]; catalog: ServiceCatalogEntry[] }): CommercialHistory {
  const catalogById = new Map(params.catalog.map((s) => [s.id, s]));
  const items = params.orders.flatMap((o) => o.items);

  const buckets = new Map<string, { label: string; category: string; count: number; totalValue: number }>();
  for (const item of items) {
    const svc = catalogById.get(item.serviceId);
    const name = svc?.name ?? item.serviceName;
    const category = svc?.category ?? "Outros";
    const price = svc?.defaultPrice ?? 0;
    const key = category === "Pacote" ? name : category;

    const existing = buckets.get(key) ?? { label: key, category, count: 0, totalValue: 0 };
    existing.count += 1;
    existing.totalValue = round2(existing.totalValue + price);
    buckets.set(key, existing);
  }

  const all = [...buckets.values()];
  const toBucket = (b: (typeof all)[number]): CommercialHistoryBucket => ({ label: b.label, count: b.count, totalValue: b.totalValue });

  return {
    totalSpent: round2(all.reduce((sum, b) => sum + b.totalValue, 0)),
    packages: all.filter((b) => b.category === "Pacote").map(toBucket),
    byCategory: all.filter((b) => b.category !== "Pacote").map(toBucket),
  };
}
