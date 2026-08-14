import "server-only";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";
import { fetchHistoricalOrders, type HistoricalOrderRow } from "@/lib/jumppark-orders/historical-theoretical-consumption";
import { listServiceMappings } from "@/lib/jumppark-orders/service-mapping";
import { isJumpParkOfficialPeriod } from "@/lib/config/historical-source-precedence";
import type { ServiceMapping } from "@/lib/jumppark-orders/types";
import type { VehicleCategory } from "@/lib/recipes/types";

/**
 * Missão de Wiring do Consumo Gerencial V1 — achado de auditoria (Fase 0): o TEXTO do serviço
 * JumpPark para Bronze/Silver/Gold já carrega o porte do veículo como sufixo (ex.: "Lavação
 * Bronze - Hatch", "Lavação Gold - SUV"), independente de `vehicle_category_assignments`
 * (mecanismo por placa, hoje com ZERO linhas em produção — confirmado por auditoria real no
 * Neon). Isso é uma fonte de porte MELHOR que a usada em `historical-theoretical-consumption.ts`
 * (que sempre trata como "desconhecido" em lote).
 *
 * "SUV/SEDAN" é uma faixa de PREÇO combinada (confirmado: é a maior fatia do volume — ~50% das
 * ordens Bronze/Silver/Gold) — nunca escolhemos sozinhos se o carro era SUV ou Sedan (Missão de
 * Wiring, seção 29). Até a Missão de Estoque Gerencial V2 isso virava bucket "indeterminado"
 * genérico. A partir da V2, por DECISÃO DE NEGÓCIO EXPLÍCITA do gestor (seção 1 daquela missão):
 * SUV e SEDAN são tratados como a MESMA categoria de referência para fins de ESTOQUE/CONSUMO
 * GERENCIAL (nunca para preço/classificação comercial, que ficam intocados em outras partes do
 * sistema). Por isso "SUV/SEDAN" ganha seu PRÓPRIO bucket explícito, `suv_sedan_combinado` —
 * nunca mais confundido com "indeterminado" (que continua reservado para nomes genuinamente sem
 * nenhum sufixo de porte reconhecível, ex. "Lavagem Gold"). A tradução de `suv_sedan_combinado`
 * para uma categoria concreta de receita (`toRecipeVehicleCategory`, em
 * managerial-consumption-analysis.ts) é inofensiva matematicamente desde a V2, porque o
 * multiplicador gerencial de "sedan" e "suv" agora é idêntico (1.00) — mas o bucket em si nunca
 * é silenciosamente apagado aqui.
 */
export type ManagerialVehicleCategoryBucket = VehicleCategory | "indeterminado" | "suv_sedan_combinado";

export const MANAGERIAL_VEHICLE_CATEGORY_BUCKETS: ManagerialVehicleCategoryBucket[] = ["hatch", "sedan", "suv", "caminhonete", "suv_sedan_combinado", "indeterminado"];

/** Só olha substrings explícitos no texto — nunca infere/adivinha porte por qualquer outro sinal. */
export function extractVehicleCategoryBucketFromServiceName(description: string): ManagerialVehicleCategoryBucket {
  const lower = description.toLowerCase();
  if (lower.includes("suv/sedan") || lower.includes("sedan/suv")) return "suv_sedan_combinado";
  if (lower.includes("caminhonete")) return "caminhonete";
  if (lower.includes("suv")) return "suv";
  if (lower.includes("hatch")) return "hatch";
  if (lower.includes("sedan")) return "sedan";
  return "indeterminado";
}

export interface ServicesRealizedCell {
  serviceId: string;
  serviceName: string;
  vehicleCategoryBucket: ManagerialVehicleCategoryBucket;
  /** Contagem de ORDENS distintas (nunca linhas) — uma ordem com 2 itens que mapeiam para o mesmo (serviço, bucket) conta 1 vez. */
  servicesRealized: number;
}

export interface ManagerialServicesRealizedResult {
  periodStart: string;
  periodEnd: string;
  cells: ServicesRealizedCell[];
  ordersEvaluated: number;
  ordersOutsideJumpParkOfficialPeriod: number;
  ordersUnmapped: number;
  unmappedDescriptions: string[];
}

type MinimalMapping = Pick<ServiceMapping, "canonicalServiceId" | "status">;

/**
 * Núcleo puro (sem I/O, 100% testável com fixtures — mesmo padrão de
 * `computeTheoreticalConsumptionForOrder`/`classifyOrderForAutomaticConsumption`): recebe ordens
 * já buscadas (`fetchHistoricalOrders` — que já filtra `exitTime IS NOT NULL`, ou seja "ordem
 * finalizada" = serviço efetivamente realizado) e decide a contagem. Uma ordem com 2 itens que
 * mapeiam para o mesmo (serviço, bucket de porte) conta 1 vez — nunca duplicidade dentro da
 * mesma ordem. Ordens fora do período oficial JumpPark (`isJumpParkOfficialPeriod`) são
 * excluídas — nesse período a planilha histórica é a fonte oficial, fora do escopo desta função.
 */
export function computeServicesRealizedFromOrders(
  orders: HistoricalOrderRow[],
  mappingByDescription: Map<string, MinimalMapping>,
  serviceNameById: Map<string, string>,
): Omit<ManagerialServicesRealizedResult, "periodStart" | "periodEnd"> {
  const countsByKey = new Map<string, ServicesRealizedCell>();
  let ordersOutsideJumpParkOfficialPeriod = 0;
  let ordersUnmapped = 0;
  const unmappedDescriptionsSeen = new Set<string>();

  for (const order of orders) {
    if (!isJumpParkOfficialPeriod(order.orderDate)) {
      ordersOutsideJumpParkOfficialPeriod++;
      continue;
    }

    const matchedThisOrder = new Set<string>(); // "serviceId:bucket" — dedup por ordem
    let anyMatched = false;

    for (const description of order.descriptions) {
      const mapping = mappingByDescription.get(description);
      if (!mapping || mapping.status !== "mapeado" || !mapping.canonicalServiceId) {
        unmappedDescriptionsSeen.add(description);
        continue;
      }
      anyMatched = true;
      const bucket = extractVehicleCategoryBucketFromServiceName(description);
      const key = `${mapping.canonicalServiceId}:${bucket}`;
      if (matchedThisOrder.has(key)) continue;
      matchedThisOrder.add(key);

      const existing = countsByKey.get(key);
      if (existing) {
        existing.servicesRealized += 1;
      } else {
        countsByKey.set(key, {
          serviceId: mapping.canonicalServiceId,
          serviceName: serviceNameById.get(mapping.canonicalServiceId) ?? mapping.canonicalServiceId,
          vehicleCategoryBucket: bucket,
          servicesRealized: 1,
        });
      }
    }

    if (!anyMatched) ordersUnmapped++;
  }

  return {
    cells: Array.from(countsByKey.values()).sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR") || a.vehicleCategoryBucket.localeCompare(b.vehicleCategoryBucket)),
    ordersEvaluated: orders.length,
    ordersOutsideJumpParkOfficialPeriod,
    ordersUnmapped,
    unmappedDescriptions: Array.from(unmappedDescriptionsSeen).sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

/**
 * Casca de I/O: busca ordens/mapeamentos/serviços reais e delega ao núcleo puro. Nunca duplica a
 * lógica de contagem, nunca uma segunda fonte de ordens paralela a `fetchHistoricalOrders`.
 */
export async function getManagerialServicesRealized(periodStart: string, periodEnd: string): Promise<ManagerialServicesRealizedResult> {
  const db = getDb();
  if (!db) {
    return { periodStart, periodEnd, cells: [], ordersEvaluated: 0, ordersOutsideJumpParkOfficialPeriod: 0, ordersUnmapped: 0, unmappedDescriptions: [] };
  }

  const [orders, mappingRows, allServices] = await Promise.all([
    fetchHistoricalOrders(periodStart, periodEnd),
    listServiceMappings(),
    db.select({ id: services.id, name: services.name }).from(services),
  ]);

  const mappingByDescription = new Map(mappingRows.map((m) => [m.jumpparkServiceName, m]));
  const serviceNameById = new Map(allServices.map((s) => [s.id, s.name]));

  const core = computeServicesRealizedFromOrders(orders, mappingByDescription, serviceNameById);
  return { periodStart, periodEnd, ...core };
}
