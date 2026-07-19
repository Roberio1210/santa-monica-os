import "server-only";
import { listServiceMappings } from "@/lib/orders/service-mapping";
import type { OperationalOrder } from "./operations-summary";

export interface WashCategoryGroup {
  label: string;
  count: number;
  amount: number;
}

/**
 * Agrupa os serviços de lavação por categoria canônica já curada em /estoque/mapeamentos
 * (Fase D) — nunca classifica por aproximação de texto. Serviço sem mapeamento confirmado cai
 * em "Outros", mostrando o texto original do JumpPark nunca é escondido.
 */
export async function computeWashCategoryGroups(orders: OperationalOrder[]): Promise<WashCategoryGroup[]> {
  const mappings = await listServiceMappings();
  const nameByDescription = new Map(mappings.filter((m) => m.status === "mapeado" && m.canonicalServiceName).map((m) => [m.jumpparkServiceName, m.canonicalServiceName as string]));

  const groups = new Map<string, WashCategoryGroup>();
  for (const order of orders) {
    for (const service of order.services) {
      const label = nameByDescription.get(service.description) ?? `Outros (${service.description})`;
      const existing = groups.get(label) ?? { label, count: 0, amount: 0 };
      existing.count += 1;
      existing.amount = Math.round((existing.amount + service.amount) * 100) / 100;
      groups.set(label, existing);
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
}
