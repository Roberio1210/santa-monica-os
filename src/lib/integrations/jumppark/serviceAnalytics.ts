import { comparePeriodValues, type PeriodComparison } from "@/lib/utils/timezone";
import { timeBucketOf, type TimeGranularity } from "@/lib/utils/timeBuckets";
import type { ServiceCombination } from "@/lib/integrations/jumppark/vehicleAnalytics";

export type { ServiceCombination } from "@/lib/integrations/jumppark/vehicleAnalytics";
export { topServiceCombinations } from "@/lib/integrations/jumppark/vehicleAnalytics";

/**
 * Missão 31 (módulo gerencial de Serviços) — agregações puras (sem I/O) sobre itens de serviço
 * já normalizados por categoria (`serviceCategoryOf`, `customerServiceProfile.ts` — reaproveitado,
 * nunca duplicado). "Serviço" neste módulo é sempre a CATEGORIA derivada, o mesmo conceito já
 * usado em Clientes (Missão 29) e Veículos (Missão 30) — consistência deliberada em todo o app.
 */

export interface ServiceOrderItemContext {
  orderId: string;
  orderDate: string;
  customerId: string | null;
  vehicleId: string | null;
  category: string;
  amount: number;
}

export interface ServiceStats {
  category: string;
  quantity: number;
  revenue: number;
  distinctOrders: number;
  distinctCustomers: number;
  distinctVehicles: number;
  averageTicket: number;
  /** Data da venda mais recente desta categoria no conjunto informado — null quando `quantity === 0`. */
  lastSoldDate: string | null;
  firstSoldDate: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Agrega por categoria a partir de itens já enriquecidos com o contexto da ordem (data, cliente, veículo). */
export function aggregateServiceStats(items: ServiceOrderItemContext[]): ServiceStats[] {
  const groups = new Map<string, ServiceOrderItemContext[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }

  return Array.from(groups.entries()).map(([category, list]) => {
    const revenue = round2(list.reduce((sum, i) => sum + i.amount, 0));
    const orders = new Set(list.map((i) => i.orderId));
    const customers = new Set(list.filter((i) => i.customerId).map((i) => i.customerId));
    const vehicles = new Set(list.filter((i) => i.vehicleId).map((i) => i.vehicleId));
    const dates = list.map((i) => i.orderDate).sort();
    return {
      category,
      quantity: list.length,
      revenue,
      distinctOrders: orders.size,
      distinctCustomers: customers.size,
      distinctVehicles: vehicles.size,
      averageTicket: list.length > 0 ? round2(revenue / list.length) : 0,
      lastSoldDate: dates[dates.length - 1] ?? null,
      firstSoldDate: dates[0] ?? null,
    };
  });
}

export type ServiceTrendDirection = "crescendo" | "caindo" | "estavel" | "novo" | "sem_venda";

export interface ServiceTrend {
  direction: ServiceTrendDirection;
  comparison: PeriodComparison;
}

/**
 * Classifica a tendência de um serviço comparando quantidade vendida no período atual com o
 * anterior — limiares objetivos e documentados (±20%), mesma ordem de grandeza já usada em
 * `vehicleAnalytics.ts` para tendência de frequência. "novo" = vendido agora, nunca antes;
 * "sem_venda" = não vendido em nenhum dos dois períodos.
 */
export function classifyServiceTrend(currentQuantity: number, previousQuantity: number): ServiceTrend {
  const comparison = comparePeriodValues(currentQuantity, previousQuantity);
  if (currentQuantity === 0 && previousQuantity === 0) return { direction: "sem_venda", comparison };
  if (previousQuantity === 0) return { direction: "novo", comparison };
  if (comparison.percent === null) return { direction: "estavel", comparison };
  if (comparison.percent > 20) return { direction: "crescendo", comparison };
  if (comparison.percent < -20) return { direction: "caindo", comparison };
  return { direction: "estavel", comparison };
}

export type EvolutionGranularity = TimeGranularity;

export interface EvolutionPoint {
  bucket: string;
  quantity: number;
  revenue: number;
}

/**
 * Evolução por granularidade, sempre preenchendo TODOS os buckets do intervalo (mesmo sem
 * venda) — nunca omite um dia/semana/mês silenciosamente. `items` já deve vir filtrado pela
 * categoria de interesse (ou não-filtrado, para evolução do total geral). Tipo do item propositalmente
 * mínimo (`orderDate`/`amount`) — qualquer item enriquecido do app (serviços, compras de
 * fornecedor) satisfaz essa forma estruturalmente, sem conversão.
 */
export function evolutionByGranularity(items: { orderDate: string; amount: number }[], granularity: EvolutionGranularity, allBuckets: string[]): EvolutionPoint[] {
  const totals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of items) {
    const bucket = timeBucketOf(item.orderDate, granularity);
    const current = totals.get(bucket) ?? { quantity: 0, revenue: 0 };
    current.quantity += 1;
    current.revenue = round2(current.revenue + item.amount);
    totals.set(bucket, current);
  }
  return allBuckets.map((bucket) => ({ bucket, quantity: totals.get(bucket)?.quantity ?? 0, revenue: totals.get(bucket)?.revenue ?? 0 }));
}

const STOPWORDS = new Set(["de", "da", "do", "dos", "das", "e", "com", "sem", "a", "o", "no", "na"]);

function normalizeTokens(text: string): Set<string> {
  const stripped = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const tokens = stripped.split(/[^a-z]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersectionSize = 0;
  for (const token of a) if (b.has(token)) intersectionSize += 1;
  const unionSize = new Set([...a, ...b]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

export interface PossibleDuplicatePair {
  a: string;
  b: string;
  similarity: number;
  sharedWords: string[];
}

/**
 * Varredura léxica best-effort (nunca exaustiva, nunca uma fusão) sobre os nomes reais de
 * categoria — sinaliza pares com sobreposição de palavras (dígitos e stopwords ignorados) acima
 * de `threshold`, para revisão HUMANA. Nunca funde, nunca decide sozinho. Limiar calibrado contra
 * casos reais conhecidos da base (ex.: "Serviço Martelinho 1..9" -> mesmo radical sem dígito;
 * "Revitalização dos Faróis" vs "Revitalização 1 Farol"; "Glaco/Cristalização" vs "Cristalização
 * da Pintura") — pares de nomes de tier deliberadamente distintos (Lavação Gold/Silver/Bronze)
 * também podem aparecer, porque compartilham a palavra "Lavação"; a lista é um ponto de partida
 * para revisão, não uma lista de duplicatas confirmadas.
 */
export function detectPossibleDuplicateCategories(categories: string[], threshold = 0.3, limit = 20): PossibleDuplicatePair[] {
  const results: PossibleDuplicatePair[] = [];
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const ta = normalizeTokens(categories[i]);
      const tb = normalizeTokens(categories[j]);
      const similarity = jaccard(ta, tb);
      if (similarity >= threshold) {
        results.push({ a: categories[i], b: categories[j], similarity: round2(similarity * 100), sharedWords: Array.from(ta).filter((t) => tb.has(t)) });
      }
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * Item de serviço já enriquecido com o nome do cliente/modelo do veículo daquela ordem — usado
 * só pelas funções de oportunidade comercial abaixo (as demais funções deste módulo não
 * precisam desses campos, mantidos fora de `ServiceOrderItemContext` para não carregar dado à
 * toa em cálculos que não o usam).
 */
export interface EnrichedServiceItem extends ServiceOrderItemContext {
  customerName: string | null;
  vehicleModel: string | null;
}

interface CustomerServiceHistory {
  name: string | null;
  categories: Map<string, number>;
  lastVehicleId: string | null;
  lastVehicleModel: string | null;
  lastDate: string;
}

function groupItemsByCustomer(items: EnrichedServiceItem[]): Map<string, CustomerServiceHistory> {
  const byCustomer = new Map<string, CustomerServiceHistory>();
  for (const item of items) {
    if (!item.customerId) continue;
    const entry = byCustomer.get(item.customerId) ?? { name: item.customerName, categories: new Map<string, number>(), lastVehicleId: item.vehicleId, lastVehicleModel: item.vehicleModel, lastDate: item.orderDate };
    entry.categories.set(item.category, (entry.categories.get(item.category) ?? 0) + 1);
    if (item.orderDate >= entry.lastDate) {
      entry.lastDate = item.orderDate;
      entry.lastVehicleId = item.vehicleId;
      entry.lastVehicleModel = item.vehicleModel;
    }
    if (item.customerName) entry.name = item.customerName;
    byCustomer.set(item.customerId, entry);
  }
  return byCustomer;
}

export interface ServiceOpportunity {
  kind: "cross_sell" | "upsell_basico";
  customerId: string;
  customerName: string | null;
  vehicleId: string | null;
  vehicleModel: string | null;
  currentService: string;
  suggestedService: string;
  reason: string;
  evidence: string;
}

/**
 * Cross-sell: parte das combinações REAIS mais frequentes (`topServiceCombinations`, já
 * observadas em ordens de verdade) e localiza clientes que já demonstraram interesse forte por
 * um dos dois serviços do par (`minCurrentVisits`+ vezes) mas nunca contrataram o outro. Nunca
 * sugere uma combinação que não tenha sido observada de verdade na base.
 */
export function buildCrossSellOpportunities(
  items: EnrichedServiceItem[],
  combinations: ServiceCombination[],
  options: { minCurrentVisits?: number; maxPairsConsidered?: number; maxOpportunitiesPerPair?: number } = {},
): ServiceOpportunity[] {
  const minCurrentVisits = options.minCurrentVisits ?? 2;
  const maxPairs = options.maxPairsConsidered ?? 8;
  const maxPerPair = options.maxOpportunitiesPerPair ?? 10;

  const byCustomer = groupItemsByCustomer(items);
  const topPairs = [...combinations].sort((a, b) => b.count - a.count).slice(0, maxPairs);
  const opportunities: ServiceOpportunity[] = [];

  for (const pair of topPairs) {
    const [a, b] = pair.categories;
    let addedForThisPair = 0;
    for (const [customerId, entry] of byCustomer) {
      if (addedForThisPair >= maxPerPair) break;
      const countA = entry.categories.get(a) ?? 0;
      const countB = entry.categories.get(b) ?? 0;

      if (countA >= minCurrentVisits && countB === 0) {
        opportunities.push({
          kind: "cross_sell",
          customerId,
          customerName: entry.name,
          vehicleId: entry.lastVehicleId,
          vehicleModel: entry.lastVehicleModel,
          currentService: a,
          suggestedService: b,
          reason: `Cliente já fez "${a}" ${countA}x mas nunca fez "${b}" — combinação observada ${pair.count}x na base entre clientes que fazem os dois.`,
          evidence: `${countA} ocorrência(s) de "${a}" neste cliente; combinação "${a}" + "${b}" confirmada em ${pair.count} ordem(ns) reais da base.`,
        });
        addedForThisPair += 1;
      } else if (countB >= minCurrentVisits && countA === 0 && addedForThisPair < maxPerPair) {
        opportunities.push({
          kind: "cross_sell",
          customerId,
          customerName: entry.name,
          vehicleId: entry.lastVehicleId,
          vehicleModel: entry.lastVehicleModel,
          currentService: b,
          suggestedService: a,
          reason: `Cliente já fez "${b}" ${countB}x mas nunca fez "${a}" — combinação observada ${pair.count}x na base entre clientes que fazem os dois.`,
          evidence: `${countB} ocorrência(s) de "${b}" neste cliente; combinação "${a}" + "${b}" confirmada em ${pair.count} ordem(ns) reais da base.`,
        });
        addedForThisPair += 1;
      }
    }
  }
  return opportunities;
}

/**
 * Upsell: cliente recorrente (`minVisits`+ visitas no total) cujo histórico inteiro fica em
 * categorias de ticket médio na metade mais barata da base (<= mediana) e que nunca contratou a
 * categoria de MAIOR ticket médio real da base — nunca inventa um valor "premium", usa o maior
 * ticket médio já observado de verdade.
 */
export function buildBasicOnlyUpsellOpportunities(items: EnrichedServiceItem[], serviceStats: ServiceStats[], minVisits = 3): ServiceOpportunity[] {
  if (serviceStats.length === 0) return [];
  const byTicketAsc = [...serviceStats].sort((a, b) => a.averageTicket - b.averageTicket);
  const medianTicket = byTicketAsc[Math.floor(byTicketAsc.length / 2)].averageTicket;
  const highestTicket = [...serviceStats].sort((a, b) => b.averageTicket - a.averageTicket)[0];
  const statByCategory = new Map(serviceStats.map((s) => [s.category, s]));

  const byCustomer = groupItemsByCustomer(items);
  const opportunities: ServiceOpportunity[] = [];

  for (const [customerId, entry] of byCustomer) {
    const totalVisits = Array.from(entry.categories.values()).reduce((sum, n) => sum + n, 0);
    if (totalVisits < minVisits) continue;
    if (entry.categories.has(highestTicket.category)) continue;

    const categories = Array.from(entry.categories.keys());
    const usesOnlyBasic = categories.every((cat) => (statByCategory.get(cat)?.averageTicket ?? 0) <= medianTicket);
    if (!usesOnlyBasic) continue;

    opportunities.push({
      kind: "upsell_basico",
      customerId,
      customerName: entry.name,
      vehicleId: entry.lastVehicleId,
      vehicleModel: entry.lastVehicleModel,
      currentService: categories.join(", "),
      suggestedService: highestTicket.category,
      reason: `Cliente recorrente (${totalVisits} visitas) só usou serviços com ticket médio até ${medianTicket} — "${highestTicket.category}" tem o maior ticket médio real da base (${highestTicket.averageTicket}).`,
      evidence: `Ticket médio de todas as categorias já usadas por este cliente ≤ mediana da base (${medianTicket}); nunca contratou "${highestTicket.category}".`,
    });
  }
  return opportunities;
}
