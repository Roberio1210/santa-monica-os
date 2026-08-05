import { identityKey, normalizeName } from "@/lib/crm/normalize";

/**
 * Agregação pura (sem I/O) de Clientes e Veículos a partir das ordens já sincronizadas — núcleo
 * do CRM Inteligente derivado exclusivamente da JumpPark (Missão 26). Reaproveita a mesma chave
 * de identidade já usada e testada em `src/lib/crm/normalize.ts` (telefone > nome; aqui sempre
 * cai para nome, porque só temos o telefone mascarado — `normalizePhone` descarta strings com
 * menos de 8 dígitos, e uma máscara como "*******99" nunca chega a 8).
 *
 * Limitação honesta e documentada: sem telefone real, dois clientes reais diferentes com o
 * exato mesmo nome cadastrado na JumpPark seriam fundidos num só registro aqui. Não há como
 * evitar isso com o dado disponível hoje — melhor sinalizar do que inventar uma chave falsa.
 */

export interface OrderForAggregation {
  id: string;
  clientName: string | null;
  clientPhoneMasked: string | null;
  plateMasked: string | null;
  vehicleModel: string | null;
  orderDate: string;
  totalAmount: number;
  servicesAmount: number;
}

export interface AggregatedCustomer {
  externalId: string;
  name: string;
  firstVisitAt: string;
  lastVisitAt: string;
  visitCount: number;
  totalSpent: number;
  averageTicket: number;
  servicesOrderCount: number;
  orderIds: string[];
}

export interface AggregatedVehicle {
  externalId: string;
  model: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  visitCount: number;
  /** externalId do cliente "dono atual" — resolvido pela ordem mais recente deste veículo. Null quando essa ordem não tem identidade de cliente. */
  customerExternalId: string | null;
  orderIds: string[];
}

export interface AggregationResult {
  customers: AggregatedCustomer[];
  vehicles: AggregatedVehicle[];
  /** id da ordem -> externalId do cliente resolvido (null quando a ordem não tem identidade). */
  orderCustomerExternalId: Map<string, string | null>;
  /** id da ordem -> externalId do veículo resolvido (null quando a ordem não tem placa). */
  orderVehicleExternalId: Map<string, string | null>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function aggregateJumpParkCustomersAndVehicles(orders: OrderForAggregation[]): AggregationResult {
  const customerGroups = new Map<string, OrderForAggregation[]>();
  const vehicleGroups = new Map<string, OrderForAggregation[]>();
  const orderCustomerExternalId = new Map<string, string | null>();
  const orderVehicleExternalId = new Map<string, string | null>();

  for (const order of orders) {
    const custKey = identityKey(order.clientPhoneMasked, order.clientName);
    orderCustomerExternalId.set(order.id, custKey);
    if (custKey) {
      const list = customerGroups.get(custKey) ?? [];
      list.push(order);
      customerGroups.set(custKey, list);
    }

    // "Não informado" é o texto de exibição que `maskPlate()` produz quando a ordem não tem
    // placa — nunca deve virar identidade de veículo (criaria um veículo fictício agrupando
    // todas as ordens sem placa). Ver Missão 27.
    const plateRaw = order.plateMasked?.trim() || null;
    const plate = plateRaw && plateRaw !== "Não informado" ? plateRaw : null;
    const vehKey = plate ? `plate:${plate}` : null;
    orderVehicleExternalId.set(order.id, vehKey);
    if (vehKey) {
      const list = vehicleGroups.get(vehKey) ?? [];
      list.push(order);
      vehicleGroups.set(vehKey, list);
    }
  }

  const customers: AggregatedCustomer[] = [];
  for (const [externalId, group] of customerGroups) {
    const sorted = [...group].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const visitCount = sorted.length;
    const totalSpent = round2(sorted.reduce((sum, o) => sum + o.totalAmount, 0));
    const servicesOrderCount = sorted.filter((o) => o.servicesAmount > 0).length;
    const name = normalizeName(sorted[sorted.length - 1].clientName) ?? externalId.replace(/^name:/, "");

    customers.push({
      externalId,
      name,
      firstVisitAt: sorted[0].orderDate,
      lastVisitAt: sorted[sorted.length - 1].orderDate,
      visitCount,
      totalSpent,
      averageTicket: visitCount > 0 ? round2(totalSpent / visitCount) : 0,
      servicesOrderCount,
      orderIds: sorted.map((o) => o.id),
    });
  }

  const vehicles: AggregatedVehicle[] = [];
  for (const [externalId, group] of vehicleGroups) {
    const sorted = [...group].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const mostRecent = sorted[sorted.length - 1];

    vehicles.push({
      externalId,
      model: mostRecent.vehicleModel,
      firstSeenAt: sorted[0].orderDate,
      lastSeenAt: mostRecent.orderDate,
      visitCount: sorted.length,
      customerExternalId: identityKey(mostRecent.clientPhoneMasked, mostRecent.clientName),
      orderIds: sorted.map((o) => o.id),
    });
  }

  return { customers, vehicles, orderCustomerExternalId, orderVehicleExternalId };
}
