import type { Customer, ServiceOrder, ServiceVisit, Vehicle } from "@/lib/attendance/types";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";

/** Mesmo limiar de "cliente recorrente" já usado em manager-assistant/clientAttention.ts e planning/clientSignals.ts — decisão consistente do projeto. */
export const RECORRENTE_VISIT_THRESHOLD = 3;

/**
 * "Cliente VIP (calculado)" — a Missão 21 pede este campo de forma explícita e repetida.
 * Missões anteriores (18 — Assistente do Gerente; 20 — Planejamento Operacional) decidiram NUNCA
 * calcular VIP por não existir regra formal de negócio (ver `manager-assistant/clientAttention.ts`
 * e `planning/clientSignals.ts`). Como a Missão 21 exige o campo, definimos aqui — pela primeira
 * vez — uma regra formal e documentada: cliente muito recorrente (>= `VIP_VISIT_THRESHOLD`
 * visitas) E ainda ativo (não sumiu há mais de `VIP_MAX_INACTIVITY_DAYS` dias). Um cliente muito
 * recorrente que desapareceu não é VIP, é "recorrente distante" — por isso as duas condições.
 * Limiares são decisão desta sprint, não uma regra recebida do negócio.
 */
export const VIP_VISIT_THRESHOLD = 5;
export const VIP_MAX_INACTIVITY_DAYS = 90;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(fromIso)) / 86_400_000);
}

/** Perfil puro do cliente — nunca faz I/O. `now` é parâmetro só para manter a função testável. */
export function computeCustomerProfile(params: {
  customer: Customer;
  vehicles: Vehicle[];
  visits: ServiceVisit[];
  orders: ServiceOrder[];
  servicePriceById: Record<string, number>;
  now?: Date;
}): CustomerProfile {
  const { customer, vehicles, visits, orders, servicePriceById } = params;
  const now = params.now ?? new Date();

  const sortedVisits = [...visits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const firstVisitAt = sortedVisits[0]?.createdAt ?? null;
  const lastVisitAt = sortedVisits[sortedVisits.length - 1]?.createdAt ?? null;

  const daysAsCustomer = firstVisitAt ? daysBetween(firstVisitAt, now) : null;
  const daysSinceLastVisit = lastVisitAt ? daysBetween(lastVisitAt, now) : null;

  const totalSpent = round2(orders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + (servicePriceById[item.serviceId] ?? 0), 0), 0));
  const ordersWithItems = orders.filter((o) => o.items.length > 0);
  const averageTicket = ordersWithItems.length > 0 ? round2(totalSpent / ordersWithItems.length) : null;

  const visitCount = visits.length;
  const isRecurring = visitCount >= RECORRENTE_VISIT_THRESHOLD;
  const isVip = visitCount >= VIP_VISIT_THRESHOLD && daysSinceLastVisit !== null && daysSinceLastVisit <= VIP_MAX_INACTIVITY_DAYS;

  return {
    customer,
    firstVisitAt,
    daysAsCustomer,
    visitCount,
    vehicleCount: vehicles.length,
    lastVisitAt,
    daysSinceLastVisit,
    totalSpent,
    averageTicket,
    isRecurring,
    isVip,
  };
}
