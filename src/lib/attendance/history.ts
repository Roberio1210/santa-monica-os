import type { Customer, CustomerHistorySummary, Diagnostic, ServiceOrder, ServiceVisit, TechnicalRecommendation, Vehicle } from "@/lib/attendance/types";

/**
 * Resumo puro do histórico de um cliente para a Tela 1 — nunca faz I/O, sempre testável
 * isoladamente. `activeProtections` é sempre `[]`: depende de uma regra de negócio (qual serviço
 * garante quanto tempo de proteção) ainda não definida, e este módulo nunca inventa esse tipo de
 * dado. Estrutura pronta para receber a regra depois sem mudar a assinatura desta função.
 */
export function summarizeCustomerHistory(params: {
  customer: Customer;
  vehicles: Vehicle[];
  visits: ServiceVisit[];
  diagnostics: Diagnostic[];
  recommendations: TechnicalRecommendation[];
  orders: ServiceOrder[];
  servicePriceById: Record<string, number>;
}): CustomerHistorySummary {
  const { customer, vehicles, visits, diagnostics, recommendations, orders, servicePriceById } = params;

  const sortedVisits = [...visits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastVisitAt = sortedVisits[0]?.createdAt ?? null;

  const visitIdsWithOrder = new Set(orders.map((o) => o.serviceVisitId));

  const sortedOrders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastServices = sortedOrders[0]?.items.map((item) => item.serviceName) ?? [];

  const totalSpent = orders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + (servicePriceById[item.serviceId] ?? 0), 0), 0);

  const observations = diagnostics.map((d) => d.observations).filter((o): o is string => !!o && o.trim().length > 0);

  // "Pendente" = recomendação de uma visita que nunca resultou em Ordem de Serviço nenhuma.
  const pendingRecommendations = recommendations.filter((r) => !visitIdsWithOrder.has(r.serviceVisitId));

  return {
    customer,
    vehicles,
    lastVisitAt,
    lastServices,
    totalSpent: Math.round(totalSpent * 100) / 100,
    observations,
    pendingRecommendations,
    activeProtections: [],
  };
}
