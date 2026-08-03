import { summarizeDiagnosticIssues } from "@/lib/attendance/diagnosticSummary";
import type { Diagnostic, ServiceOrder, ServiceVisit, TechnicalRecommendation } from "@/lib/attendance/types";
import type { Discount } from "@/lib/manager-assistant/types";
import type { CrmTimelineEntry } from "@/lib/crm-intelligente/types";

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/**
 * Timeline completa do CRM — puro, sem I/O. Mais rica que `attendance/timeline.ts` (que serve só
 * à lista de entradas): aqui entram diagnóstico, fotos, recomendações, descontos e status por
 * visita. `diagnostics` deve vir com `photos` já populado (`repo.listPhotosByDiagnostic` por
 * diagnóstico — `listDiagnosticsByCustomer` sozinho sempre traz `photos: []`).
 */
export function buildCrmTimeline(params: {
  visits: ServiceVisit[];
  diagnostics: Diagnostic[];
  recommendations: TechnicalRecommendation[];
  orders: ServiceOrder[];
  discounts: Discount[];
}): CrmTimelineEntry[] {
  const { visits, diagnostics, recommendations, orders, discounts } = params;

  const diagnosticByVisit = new Map(diagnostics.map((d) => [d.serviceVisitId, d]));
  const orderByVisit = new Map(orders.map((o) => [o.serviceVisitId, o]));
  const recsByVisit = groupBy(recommendations, (r) => r.serviceVisitId);
  const discountsByOrder = groupBy(discounts, (d) => d.serviceOrderId);

  return [...visits]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((visit) => {
      const diagnostic = diagnosticByVisit.get(visit.id) ?? null;
      const order = orderByVisit.get(visit.id) ?? null;
      const visitRecommendations = recsByVisit.get(visit.id) ?? [];
      const orderDiscounts = order ? (discountsByOrder.get(order.id) ?? []) : [];

      const executionMinutes = order && order.status === "entregue" ? Math.round((Date.parse(order.updatedAt) - Date.parse(visit.createdAt)) / 60_000) : null;

      return {
        visitId: visit.id,
        vehicleId: visit.vehicleId,
        dateIso: visit.createdAt,
        services: order?.items.map((item) => item.serviceName) ?? [],
        diagnosticIssues: diagnostic ? summarizeDiagnosticIssues(diagnostic) : [],
        diagnosticObservations: diagnostic?.observations ?? null,
        photos: diagnostic?.photos.map((p) => ({ area: p.area, caption: p.caption })) ?? [],
        recommendations: visitRecommendations.map((r) => ({ category: r.category, observations: r.observations })),
        discounts: orderDiscounts,
        executionMinutes,
        status: order?.status ?? null,
      };
    });
}
