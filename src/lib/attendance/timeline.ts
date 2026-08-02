import type { Diagnostic, ServiceOrder, ServiceVisit, TechnicalRecommendation } from "@/lib/attendance/types";

/**
 * Uma linha da timeline — sempre ancorada numa visita real. `services`/`value` ficam vazios
 * quando a visita ainda não tem Ordem de Serviço com itens (ex.: parada no diagnóstico) — nunca
 * inventa um serviço ou valor que não existe.
 */
export interface TimelineEntry {
  visitId: string;
  date: string;
  services: string[];
  recommendationCategories: string[];
  value: number | null;
  observations: string | null;
}

/**
 * Linha do tempo pura — nunca faz I/O. Usada tanto pela Timeline do Cliente (todas as visitas do
 * cliente) quanto pela Timeline do Veículo (só as visitas daquele veículo): quem chama decide o
 * escopo montando `visits`/`diagnostics`/`recommendations`/`orders` já filtrados.
 */
export function summarizeTimeline(params: {
  visits: ServiceVisit[];
  diagnostics: Diagnostic[];
  recommendations: TechnicalRecommendation[];
  orders: ServiceOrder[];
  servicePriceById: Record<string, number>;
}): TimelineEntry[] {
  const { visits, diagnostics, recommendations, orders, servicePriceById } = params;

  const diagnosticByVisit = new Map(diagnostics.map((d) => [d.serviceVisitId, d]));
  const orderByVisit = new Map(orders.map((o) => [o.serviceVisitId, o]));
  const recommendationsByVisit = new Map<string, TechnicalRecommendation[]>();
  for (const r of recommendations) {
    const list = recommendationsByVisit.get(r.serviceVisitId) ?? [];
    list.push(r);
    recommendationsByVisit.set(r.serviceVisitId, list);
  }

  return [...visits]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((visit) => {
      const order = orderByVisit.get(visit.id) ?? null;
      const diagnostic = diagnosticByVisit.get(visit.id) ?? null;
      const visitRecommendations = recommendationsByVisit.get(visit.id) ?? [];

      return {
        visitId: visit.id,
        date: visit.createdAt,
        services: order?.items.map((item) => item.serviceName) ?? [],
        recommendationCategories: visitRecommendations.map((r) => r.category),
        value: order && order.items.length > 0 ? Math.round(order.items.reduce((sum, item) => sum + (servicePriceById[item.serviceId] ?? 0), 0) * 100) / 100 : null,
        observations: diagnostic?.observations ?? null,
      };
    });
}
