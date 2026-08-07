import { identityKey, normalizeName } from "@/lib/crm/normalize";

/**
 * Agregação pura (sem I/O) de Clientes e Veículos a partir das ordens já sincronizadas — núcleo
 * do CRM Inteligente derivado exclusivamente da JumpPark (Missão 26). Reaproveita a mesma chave
 * de identidade já usada e testada em `src/lib/crm/normalize.ts` (telefone > nome; aqui sempre
 * cai para nome, porque só temos o telefone mascarado — `normalizePhone` descarta strings com
 * menos de 8 dígitos, e uma máscara como "*******99" nunca chega a 8).
 *
 * Missão 28 (revisão segura de identidade, 07/08/2026) — auditoria real dos 210+ clientes já
 * formados mostrou que a regra "nome sozinho" é segura na maioria dos casos, mas tem um ponto
 * fraco real e mensurável: quando o nome tem um único token (ex.: só "Lucas") e o mesmo cliente
 * termina associado a várias placas distintas, pode ser uma pessoa com vários carros — ou pode
 * ser homônimo fundido por engano. Sem telefone completo nem id estruturado da JumpPark, não há
 * como provar qual dos dois casos é. Este módulo passa a:
 *
 *   1. Classificar cada cliente com um nível de confiança auditável (`identityConfidence`) em vez
 *      de tratar todo vínculo por nome como igualmente confiável.
 *   2. Enriquecer retroativamente ordens antigas sem nome quando a placa aparece, sem ambiguidade,
 *      numa ordem mais nova com cliente identificado (exatamente o cenário descrito na Missão 28).
 *   3. Nunca fundir automaticamente quando a mesma placa aparece em ordens de nomes diferentes —
 *      esses casos viram itens da fila de revisão manual (`reviewItems`), preservando as ordens
 *      exatamente como estão até uma decisão humana.
 *
 * Continua puro: nada aqui faz I/O nem decide nada por conta própria além de aplicar as regras
 * documentadas acima — a leitura/escrita fica em `customersRefresh.ts`.
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

export type IdentityConfidence = "confirmado" | "provavel" | "provisorio" | "ambiguo";

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
  identityConfidence: IdentityConfidence;
  identityConfidenceReason: string;
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

export interface IdentityReviewCandidate {
  customerExternalId: string;
  name: string;
  visitCount: number;
  totalSpent: number;
  orderIds: string[];
}

export interface IdentityReviewUnresolvedOrder {
  orderId: string;
  orderDate: string;
  vehicleModel: string | null;
  totalAmount: number;
}

/**
 * Um item por placa mascarada associada a mais de um nome de cliente distinto — a única situação
 * em que a regra atual encontra ambiguidade real (nunca resolvida automaticamente). `subjectKey`
 * é a chave natural usada para upsert idempotente na tabela `identity_review_items`.
 */
export interface IdentityReviewItemCandidate {
  subjectKey: string;
  plateMasked: string;
  rule: string;
  candidates: IdentityReviewCandidate[];
  unresolvedOrders: IdentityReviewUnresolvedOrder[];
}

export interface AggregationResult {
  customers: AggregatedCustomer[];
  vehicles: AggregatedVehicle[];
  /** id da ordem -> externalId do cliente resolvido (null quando a ordem não tem identidade — nem própria, nem enriquecida). */
  orderCustomerExternalId: Map<string, string | null>;
  /** id da ordem -> externalId do veículo resolvido (null quando a ordem não tem placa). */
  orderVehicleExternalId: Map<string, string | null>;
  /** Placas com mais de um nome distinto — cada uma vira um item na fila "Identidades para revisar". */
  reviewItems: IdentityReviewItemCandidate[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSingleToken(name: string): boolean {
  return name.trim().split(/\s+/).filter(Boolean).length <= 1;
}

function computeIdentityConfidence(name: string, distinctPlateCount: number): { confidence: IdentityConfidence; reason: string } {
  if (isSingleToken(name) && distinctPlateCount >= 2) {
    return {
      confidence: "ambiguo",
      reason: `Nome de um único token ("${name}") associado a ${distinctPlateCount} placas distintas nas ordens — risco real de homônimo fundido. Sem telefone completo ou identificador estruturado da JumpPark para desambiguar. Revisar manualmente antes de confiar neste vínculo.`,
    };
  }
  if (!isSingleToken(name)) {
    return {
      confidence: "provavel",
      reason: "Nome normalizado com dois ou mais termos, consistente nas ordens — mais poder discriminante que um primeiro nome sozinho, mas ainda não é telefone completo nem id estruturado da fonte.",
    };
  }
  return {
    confidence: "provisorio",
    reason: "Identidade baseada só em nome (sem telefone completo nem identificador estruturado da JumpPark nesta integração) — tratar como provisória, nunca como prova definitiva de que duas ordens são da mesma pessoa.",
  };
}

/** "Não informado" é o texto de exibição que `maskPlate()` produz quando a ordem não tem placa — nunca deve virar identidade de veículo. */
function plateKeyOf(plateMasked: string | null | undefined): string | null {
  const raw = plateMasked?.trim() || null;
  return raw && raw !== "Não informado" ? raw : null;
}

/**
 * `manualCustomerLinks` (id da ordem -> externalId do cliente) representa decisões humanas já
 * tomadas na fila "Identidades para revisar" (ação "Vincular") — a ordem correspondente tem
 * `customer_link_locked = true` no banco. Passar esse mapa garante que a ordem entra na contagem
 * de visitas/gasto total do cliente certo mesmo sem ter nome próprio, sem reabrir a decisão a
 * cada recálculo (a regra automática nunca teria escolhido esse candidato sozinha — por isso é
 * ambíguo — mas uma vez decidida por um humano, o dado deve refletir isso).
 */
export function aggregateJumpParkCustomersAndVehicles(orders: OrderForAggregation[], manualCustomerLinks?: Map<string, string>): AggregationResult {
  const orderCustomerExternalId = new Map<string, string | null>();
  const orderVehicleExternalId = new Map<string, string | null>();

  // Passo 1 — agrupa por placa (todas as ordens com placa útil, tenham nome ou não) e, dentro de
  // cada placa, pelos nomes distintos realmente informados nas ordens (nunca inclui ordens sem nome).
  const vehicleGroups = new Map<string, OrderForAggregation[]>();
  const namedCandidatesByPlate = new Map<string, Map<string, OrderForAggregation[]>>();

  for (const order of orders) {
    const plate = plateKeyOf(order.plateMasked);
    orderVehicleExternalId.set(order.id, plate ? `plate:${plate}` : null);
    if (!plate) continue;

    const list = vehicleGroups.get(plate) ?? [];
    list.push(order);
    vehicleGroups.set(plate, list);

    const name = normalizeName(order.clientName);
    if (!name) continue;
    const custKey = identityKey(order.clientPhoneMasked, order.clientName);
    if (!custKey) continue;
    const byName = namedCandidatesByPlate.get(plate) ?? new Map<string, OrderForAggregation[]>();
    const named = byName.get(custKey) ?? [];
    named.push(order);
    byName.set(custKey, named);
    namedCandidatesByPlate.set(plate, byName);
  }

  // Passo 2 — agrupa clientes: ordens com nome próprio sempre entram; ordens sem nome só entram
  // quando a placa resolve, sem ambiguidade, para um único candidato (enriquecimento retroativo).
  const customerGroups = new Map<string, OrderForAggregation[]>();
  const reviewItems: IdentityReviewItemCandidate[] = [];

  function addToCustomerGroup(key: string, order: OrderForAggregation) {
    const list = customerGroups.get(key) ?? [];
    list.push(order);
    customerGroups.set(key, list);
  }

  for (const order of orders) {
    const manualKey = manualCustomerLinks?.get(order.id);
    if (manualKey) {
      // Decisão humana já tomada — nunca reaberta pela regra automática (ver doc acima).
      addToCustomerGroup(manualKey, order);
      orderCustomerExternalId.set(order.id, manualKey);
      continue;
    }

    const ownKey = identityKey(order.clientPhoneMasked, order.clientName);
    if (ownKey) {
      addToCustomerGroup(ownKey, order);
      orderCustomerExternalId.set(order.id, ownKey);
      continue;
    }

    // Ordem sem nome — só pode ganhar identidade via enriquecimento por placa.
    const plate = plateKeyOf(order.plateMasked);
    const candidates = plate ? namedCandidatesByPlate.get(plate) : undefined;
    if (candidates && candidates.size === 1) {
      const [soleKey] = candidates.keys();
      addToCustomerGroup(soleKey, order);
      orderCustomerExternalId.set(order.id, soleKey);
    } else {
      // Sem candidato (placa nunca vista com nome, ou sem placa) → não resolvido, fica de fora.
      // Mais de um candidato (placa ambígua) → não resolvido automaticamente, vira item de revisão.
      orderCustomerExternalId.set(order.id, null);
    }
  }

  // Passo 3 — monta os itens da fila de revisão: uma placa por item, só quando há >1 nome distinto.
  for (const [plate, byName] of namedCandidatesByPlate) {
    if (byName.size < 2) continue;

    const candidates: IdentityReviewCandidate[] = Array.from(byName.entries()).map(([custKey, namedOrders]) => {
      const sorted = [...namedOrders].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
      return {
        customerExternalId: custKey,
        name: normalizeName(sorted[sorted.length - 1].clientName) ?? custKey.replace(/^name:/, ""),
        visitCount: sorted.length,
        totalSpent: round2(sorted.reduce((sum, o) => sum + o.totalAmount, 0)),
        orderIds: sorted.map((o) => o.id),
      };
    });

    const unresolvedOrders: IdentityReviewUnresolvedOrder[] = (vehicleGroups.get(plate) ?? [])
      .filter((o) => !normalizeName(o.clientName) && !manualCustomerLinks?.has(o.id))
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
      .map((o) => ({ orderId: o.id, orderDate: o.orderDate, vehicleModel: o.vehicleModel, totalAmount: o.totalAmount }));

    reviewItems.push({
      subjectKey: `plate:${plate}`,
      plateMasked: plate,
      rule: "Placa mascarada aparece em ordens com mais de um nome de cliente distinto — nunca fundido automaticamente, requer decisão manual.",
      candidates: candidates.sort((a, b) => b.visitCount - a.visitCount),
      unresolvedOrders,
    });
  }

  // Passo 4 — materializa clientes (com classificação de confiança) e veículos.
  const customers: AggregatedCustomer[] = [];
  for (const [externalId, group] of customerGroups) {
    const sorted = [...group].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const visitCount = sorted.length;
    const totalSpent = round2(sorted.reduce((sum, o) => sum + o.totalAmount, 0));
    const servicesOrderCount = sorted.filter((o) => o.servicesAmount > 0).length;
    const name = normalizeName(sorted[sorted.length - 1].clientName) ?? externalId.replace(/^name:/, "");
    const distinctPlates = new Set(sorted.map((o) => plateKeyOf(o.plateMasked)).filter((p): p is string => p !== null));
    const { confidence, reason } = computeIdentityConfidence(name, distinctPlates.size);

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
      identityConfidence: confidence,
      identityConfidenceReason: reason,
    });
  }

  const vehicles: AggregatedVehicle[] = [];
  for (const [externalId, group] of vehicleGroups) {
    const sorted = [...group].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const mostRecent = sorted[sorted.length - 1];

    // Dono do veículo = cliente resolvido (nome próprio, enriquecimento ou vínculo manual — a
    // mesma resolução usada por ordem) da ordem mais recente que tiver algum resolvido. Nunca
    // escolhe um candidato ambíguo — se nenhuma ordem deste veículo tem cliente resolvido, o
    // veículo fica sem dono neste recálculo (ver aviso em customersRefresh.ts).
    let ownerKey: string | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const resolved = orderCustomerExternalId.get(sorted[i].id) ?? null;
      if (resolved) {
        ownerKey = resolved;
        break;
      }
    }

    vehicles.push({
      externalId: `plate:${externalId}`,
      model: mostRecent.vehicleModel,
      firstSeenAt: sorted[0].orderDate,
      lastSeenAt: mostRecent.orderDate,
      visitCount: sorted.length,
      customerExternalId: ownerKey,
      orderIds: sorted.map((o) => o.id),
    });
  }

  return { customers, vehicles, orderCustomerExternalId, orderVehicleExternalId, reviewItems };
}
