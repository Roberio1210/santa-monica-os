import "server-only";
import { and, eq, gte, isNotNull, lte, sql as sqlOp } from "drizzle-orm";
import { getDb } from "@/db/client";
import { historicalSpreadsheetWashRecords, historicalTheoreticalConsumption, jumpParkServiceOrderItems, jumpParkServiceOrders, services } from "@/db/schema";
import { pickRecipeReference, type YieldConfidence } from "@/lib/inventory/yield";
import { getVehicleSizeMultiplier } from "@/lib/recipes/vehicle-size-multiplier";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { listServiceMappings } from "@/lib/jumppark-orders/service-mapping";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { isJumpParkOfficialPeriod, isSpreadsheetOfficialPeriod, DATA_CORTE_JUMPPARK } from "@/lib/config/historical-source-precedence";
import type { OrderVehicleCategory, ServiceMapping } from "@/lib/jumppark-orders/types";
import type { Recipe } from "@/lib/recipes/types";

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface TheoreticalConsumptionLine {
  itemId: string;
  serviceId: string;
  serviceName: string;
  processStep: Recipe["processStep"];
  recipeId: string;
  confidenceTier: YieldConfidence;
  quantity: number;
  unit: Recipe["unit"];
  unitCost: number | null;
  cost: number | null;
}

export interface TheoreticalConsumptionResult {
  lines: TheoreticalConsumptionLine[];
  matchedServiceIds: string[];
  unmappedDescriptions: string[];
}

/**
 * Uma ordem/registro pode ter a mesma etapa gerada duas vezes (ex.: 2 lavações Bronze na mesma
 * ordem JumpPark) — soma por (item, etapa) em vez de deixar a segunda ocorrência colidir e ser
 * silenciosamente descartada pelo external_id determinístico (fonte+item+etapa).
 */
export function aggregateLinesByItemAndStep(lines: TheoreticalConsumptionLine[]): TheoreticalConsumptionLine[] {
  const aggregated = new Map<string, TheoreticalConsumptionLine>();
  for (const line of lines) {
    const key = `${line.itemId}:${line.processStep}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity = round(existing.quantity + line.quantity, 3);
      existing.cost = existing.cost !== null && line.cost !== null ? round(existing.cost + line.cost, 2) : null;
    } else {
      aggregated.set(key, { ...line });
    }
  }
  return Array.from(aggregated.values());
}

/**
 * Núcleo puro (Missão de Histórico Retroativo) — nunca decide sozinho sobre consumo REAL, só
 * estima o teórico. Ao contrário do consumo automático real (`classifyOrderForAutomaticConsumption`,
 * que só usa receita "aprovada"), este usa a MELHOR referência disponível (aprovada > em
 * calibração > técnica, via `pickRecipeReference`) — seguro porque nunca escreve saldo, é só
 * análise histórica/comparativa.
 */
/**
 * `service_consumption_rules.vehicle_category` só tem 4 valores reais (hatch/sedan/suv/
 * caminhonete) — nunca "desconhecido". Quando a categoria do pedido é desconhecida (sempre o
 * caso no processamento histórico, já que a JumpPark não persiste placa real em Neon), a busca
 * de receita usa "sedan" como âncora — é exatamente a categoria de multiplicador neutro (1.00),
 * então o valor retornado já é a referência "sem ajuste de porte", coerente com
 * `getVehicleSizeMultiplier("desconhecido", ...)` também retornar sempre 1.00.
 */
export const FALLBACK_RECIPE_CATEGORY = "sedan";

export function computeTheoreticalConsumptionForOrder(
  serviceDescriptions: string[],
  vehicleCategory: OrderVehicleCategory,
  mappings: Map<string, Pick<ServiceMapping, "canonicalServiceId" | "canonicalServiceName" | "status">>,
  recipesByServiceCategory: Map<string, Recipe[]>,
  itemCostById: Map<string, number | null>,
): TheoreticalConsumptionResult {
  const lines: TheoreticalConsumptionLine[] = [];
  const matchedServiceIds: string[] = [];
  const unmappedDescriptions: string[] = [];
  const recipeLookupCategory = vehicleCategory === "desconhecido" ? FALLBACK_RECIPE_CATEGORY : vehicleCategory;

  for (const description of serviceDescriptions) {
    const mapping = mappings.get(description);
    if (!mapping || mapping.status !== "mapeado" || !mapping.canonicalServiceId) {
      unmappedDescriptions.push(description);
      continue;
    }
    matchedServiceIds.push(mapping.canonicalServiceId);

    const recipes = recipesByServiceCategory.get(`${mapping.canonicalServiceId}:${recipeLookupCategory}`) ?? [];
    for (const recipe of recipes) {
      const reference = pickRecipeReference(recipe);
      if (!reference) continue;

      const multiplier = getVehicleSizeMultiplier(vehicleCategory, recipe.processStep);
      const quantity = round(reference.value * multiplier, 3);
      const unitCost = itemCostById.get(recipe.itemId) ?? null;
      const cost = unitCost !== null ? round(quantity * unitCost, 2) : null;

      lines.push({
        itemId: recipe.itemId,
        serviceId: mapping.canonicalServiceId,
        serviceName: mapping.canonicalServiceName ?? "Serviço",
        processStep: recipe.processStep,
        recipeId: recipe.id,
        confidenceTier: reference.confidence,
        quantity,
        unit: recipe.unit,
        unitCost,
        cost,
      });
    }
  }

  return { lines, matchedServiceIds, unmappedDescriptions };
}

interface HistoricalOrderRow {
  externalId: string;
  orderDate: string;
  descriptions: string[];
}

/**
 * Fonte de ordens histórica — direto do Neon já sincronizado, nunca a API viva da JumpPark
 * (necessária só para a placa real, que a JumpPark não persiste sem máscara — ver
 * `docs/jumppark-sync-strategy.md`). Por isso a categoria de veículo é sempre "desconhecida"
 * neste processamento em lote — limitação documentada, sem efeito real hoje porque
 * `vehicle_category_assignments` ainda não tem nenhuma placa confirmada de qualquer forma.
 */
async function fetchHistoricalOrders(fromDate: string, toDate: string): Promise<HistoricalOrderRow[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      externalId: jumpParkServiceOrders.externalId,
      orderDate: jumpParkServiceOrders.orderDate,
      description: jumpParkServiceOrderItems.description,
    })
    .from(jumpParkServiceOrders)
    .innerJoin(jumpParkServiceOrderItems, sqlOp`${jumpParkServiceOrderItems.serviceOrderId} = ${jumpParkServiceOrders.id}`)
    .where(and(isNotNull(jumpParkServiceOrders.exitTime), gte(jumpParkServiceOrders.orderDate, fromDate), lte(jumpParkServiceOrders.orderDate, toDate), isNotNull(jumpParkServiceOrderItems.description)));

  const byOrder = new Map<string, HistoricalOrderRow>();
  for (const row of rows) {
    if (!row.description) continue;
    const existing = byOrder.get(row.externalId);
    if (existing) existing.descriptions.push(row.description);
    else byOrder.set(row.externalId, { externalId: row.externalId, orderDate: row.orderDate, descriptions: [row.description] });
  }
  return Array.from(byOrder.values());
}

export interface HistoricalProcessingSummary {
  ordersEvaluated: number;
  ordersWithMatchedService: number;
  ordersUnmapped: number;
  linesWritten: number;
  linesAlreadyExisted: number;
  serviceCounts: Record<string, number>;
  fromDate: string;
  toDate: string;
}

const BATCH_SIZE = 500;

/**
 * Processa (idempotente) consumo teórico histórico para um período (Missão de Histórico
 * Retroativo). NUNCA escreve em `inventory_items`/`inventory_movements`/
 * `inventory_consumption_lines` — só na tabela separada `historical_theoretical_consumption`.
 * Reprocessar o mesmo período nunca duplica: `external_id` determinístico
 * (`hist:{orderExternalId}:{itemId}:{processStep}`) com `onConflictDoNothing` numa constraint
 * UNIQUE real.
 */
export async function processHistoricalTheoreticalConsumption(fromDate: string, toDate: string): Promise<HistoricalProcessingSummary> {
  const db = getDb();
  if (!db) {
    return { ordersEvaluated: 0, ordersWithMatchedService: 0, ordersUnmapped: 0, linesWritten: 0, linesAlreadyExisted: 0, serviceCounts: {}, fromDate, toDate };
  }

  const [orders, mappingRows, allRecipes, allItems, allServices] = await Promise.all([
    fetchHistoricalOrders(fromDate, toDate),
    listServiceMappings(),
    getRecipeRepository().listRecipes(),
    getInventoryRepository().listItems(),
    db.select({ id: services.id, name: services.name }).from(services),
  ]);

  const mappings = new Map(mappingRows.map((m) => [m.jumpparkServiceName, { canonicalServiceId: m.canonicalServiceId, canonicalServiceName: m.canonicalServiceName, status: m.status }]));
  const itemCostById = new Map(allItems.map((i) => [i.id, i.unitCost]));
  const serviceNameById = new Map(allServices.map((s) => [s.id, s.name]));

  const recipesByServiceCategory = new Map<string, Recipe[]>();
  for (const recipe of allRecipes) {
    if (!recipe.isActiveVersion) continue;
    const key = `${recipe.serviceId}:${recipe.vehicleCategory}`;
    const list = recipesByServiceCategory.get(key) ?? [];
    list.push(recipe);
    recipesByServiceCategory.set(key, list);
  }

  const vehicleCategory: OrderVehicleCategory = "desconhecido";
  const serviceCounts: Record<string, number> = {};
  let ordersWithMatchedService = 0;
  let ordersUnmapped = 0;

  const rowsToInsert: (typeof historicalTheoreticalConsumption.$inferInsert)[] = [];

  for (const order of orders) {
    // Segurança da Etapa 3 (Missão de Consolidação do Histórico) — nunca grava um registro
    // JumpPark fora do período em que ele é a fonte oficial, mesmo que o chamador tenha passado
    // um fromDate/toDate mais amplo por engano.
    if (!isJumpParkOfficialPeriod(order.orderDate)) continue;

    const result = computeTheoreticalConsumptionForOrder(order.descriptions, vehicleCategory, mappings, recipesByServiceCategory, itemCostById);

    if (result.matchedServiceIds.length > 0) ordersWithMatchedService += 1;
    if (result.unmappedDescriptions.length > 0) ordersUnmapped += 1;

    for (const serviceId of new Set(result.matchedServiceIds)) {
      const name = serviceNameById.get(serviceId) ?? serviceId;
      serviceCounts[name] = (serviceCounts[name] ?? 0) + 1;
    }

    for (const line of aggregateLinesByItemAndStep(result.lines)) {
      rowsToInsert.push({
        jumpparkOrderExternalId: order.externalId,
        sourceRecordType: "jumppark",
        orderDate: order.orderDate,
        itemId: line.itemId,
        serviceId: line.serviceId,
        vehicleCategory,
        processStep: line.processStep,
        recipeId: line.recipeId,
        confidenceTier: line.confidenceTier,
        theoreticalQuantity: String(line.quantity),
        unit: line.unit,
        theoreticalUnitCost: line.unitCost !== null ? String(line.unitCost) : null,
        theoreticalCost: line.cost !== null ? String(line.cost) : null,
        source: "jumppark-historico",
        externalId: `hist:${order.externalId}:${line.itemId}:${line.processStep}`,
      });
    }
  }

  let linesWritten = 0;
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    const inserted = await db.insert(historicalTheoreticalConsumption).values(batch).onConflictDoNothing({ target: historicalTheoreticalConsumption.externalId }).returning({ id: historicalTheoreticalConsumption.id });
    linesWritten += inserted.length;
  }

  return {
    ordersEvaluated: orders.length,
    ordersWithMatchedService,
    ordersUnmapped,
    linesWritten,
    linesAlreadyExisted: rowsToInsert.length - linesWritten,
    serviceCounts,
    fromDate,
    toDate,
  };
}

export interface SpreadsheetProcessingSummary {
  recordsEvaluated: number;
  recordsWithMatchedService: number;
  recordsPending: number;
  recordsWithoutRecipe: number;
  linesWritten: number;
  linesAlreadyExisted: number;
  serviceCounts: Record<string, number>;
}

/**
 * Consumo teórico histórico a partir da PLANILHA (Missão de Consolidação do Histórico 2026) —
 * mesmo motor de cálculo (`computeTheoreticalConsumptionForOrder`, `pickRecipeReference`,
 * `getVehicleSizeMultiplier`) do processador JumpPark, mas a fonte é
 * `historical_spreadsheet_wash_records`. Cada registro já tem `canonicalServiceId` resolvido na
 * importação (Etapa 5 da missão anterior) — nunca remapeado aqui, nunca aproximado por texto.
 * Registros com `canonicalServiceId` nulo (Convencional/Cortesia/sem tipo) são sempre ignorados
 * — nunca geram consumo inventado. Escreve só dentro do período oficial da planilha
 * (`isSpreadsheetOfficialPeriod`), mesma segurança do processador JumpPark.
 */
export async function processHistoricalTheoreticalConsumptionFromSpreadsheet(): Promise<SpreadsheetProcessingSummary> {
  const db = getDb();
  if (!db) {
    return { recordsEvaluated: 0, recordsWithMatchedService: 0, recordsPending: 0, recordsWithoutRecipe: 0, linesWritten: 0, linesAlreadyExisted: 0, serviceCounts: {} };
  }

  const [washRecords, allRecipes, allItems, allServices] = await Promise.all([
    db.select().from(historicalSpreadsheetWashRecords).where(eq(historicalSpreadsheetWashRecords.active, true)),
    getRecipeRepository().listRecipes(),
    getInventoryRepository().listItems(),
    db.select({ id: services.id, name: services.name }).from(services),
  ]);

  const itemCostById = new Map(allItems.map((i) => [i.id, i.unitCost]));
  const serviceNameByServiceId = new Map(allServices.map((s) => [s.id, s.name]));

  const recipesByServiceCategory = new Map<string, Recipe[]>();
  for (const recipe of allRecipes) {
    if (!recipe.isActiveVersion) continue;
    const key = `${recipe.serviceId}:${recipe.vehicleCategory}`;
    const list = recipesByServiceCategory.get(key) ?? [];
    list.push(recipe);
    recipesByServiceCategory.set(key, list);
  }

  const vehicleCategory: OrderVehicleCategory = "desconhecido";
  const serviceCounts: Record<string, number> = {};
  let recordsWithMatchedService = 0;
  let recordsPending = 0;
  let recordsWithoutRecipe = 0;

  const rowsToInsert: (typeof historicalTheoreticalConsumption.$inferInsert)[] = [];

  for (const record of washRecords) {
    if (!isSpreadsheetOfficialPeriod(record.recordDate)) continue; // segurança Etapa 3 — nunca além do corte

    if (!record.canonicalServiceId) {
      recordsPending += 1;
      continue; // Convencional/Cortesia/sem tipo — nunca aproximado, nunca gera consumo
    }
    recordsWithMatchedService += 1;

    const serviceName = serviceNameByServiceId.get(record.canonicalServiceId) ?? "Serviço";
    serviceCounts[serviceName] = (serviceCounts[serviceName] ?? 0) + 1;

    const pseudoDescription = record.serviceTypeRaw ?? record.canonicalServiceId;
    const mappings = new Map([[pseudoDescription, { canonicalServiceId: record.canonicalServiceId, canonicalServiceName: serviceName, status: "mapeado" as const }]]);

    const result = computeTheoreticalConsumptionForOrder([pseudoDescription], vehicleCategory, mappings, recipesByServiceCategory, itemCostById);
    if (result.lines.length === 0) {
      recordsWithoutRecipe += 1;
      continue; // serviço mapeado, mas sem nenhuma receita técnica configurada para ele ainda
    }

    for (const line of aggregateLinesByItemAndStep(result.lines)) {
      rowsToInsert.push({
        jumpparkOrderExternalId: record.externalId,
        sourceRecordType: "historical_spreadsheet",
        orderDate: record.recordDate,
        itemId: line.itemId,
        serviceId: line.serviceId,
        vehicleCategory,
        processStep: line.processStep,
        recipeId: line.recipeId,
        confidenceTier: line.confidenceTier,
        theoreticalQuantity: String(line.quantity),
        unit: line.unit,
        theoreticalUnitCost: line.unitCost !== null ? String(line.unitCost) : null,
        theoreticalCost: line.cost !== null ? String(line.cost) : null,
        source: "historical-spreadsheet",
        externalId: `hist:${record.externalId}:${line.itemId}:${line.processStep}`,
      });
    }
  }

  let linesWritten = 0;
  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    const inserted = await db.insert(historicalTheoreticalConsumption).values(batch).onConflictDoNothing({ target: historicalTheoreticalConsumption.externalId }).returning({ id: historicalTheoreticalConsumption.id });
    linesWritten += inserted.length;
  }

  return {
    recordsEvaluated: washRecords.length,
    recordsWithMatchedService,
    recordsPending,
    recordsWithoutRecipe,
    linesWritten,
    linesAlreadyExisted: rowsToInsert.length - linesWritten,
    serviceCounts,
  };
}

export interface RebuildSummary {
  truncated: boolean;
  spreadsheet: SpreadsheetProcessingSummary;
  jumppark: HistoricalProcessingSummary;
}

/**
 * Reconstrução completa do consumo teórico histórico (Missão de Consolidação do Histórico
 * 2026) — limpa a tabela (só ela; nunca toca em ordens JumpPark, registros da planilha,
 * movimentações físicas, contagens, compras ou receitas) e reprocessa do zero: planilha para
 * todo o período em que ela é oficial, JumpPark para `DATA_CORTE_JUMPPARK` até `today`.
 */
export async function rebuildHistoricalTheoreticalConsumption(today: string): Promise<RebuildSummary> {
  const db = getDb();
  if (!db) {
    return {
      truncated: false,
      spreadsheet: { recordsEvaluated: 0, recordsWithMatchedService: 0, recordsPending: 0, recordsWithoutRecipe: 0, linesWritten: 0, linesAlreadyExisted: 0, serviceCounts: {} },
      jumppark: { ordersEvaluated: 0, ordersWithMatchedService: 0, ordersUnmapped: 0, linesWritten: 0, linesAlreadyExisted: 0, serviceCounts: {}, fromDate: DATA_CORTE_JUMPPARK, toDate: today },
    };
  }

  await db.delete(historicalTheoreticalConsumption);

  const spreadsheet = await processHistoricalTheoreticalConsumptionFromSpreadsheet();
  const jumppark = await processHistoricalTheoreticalConsumption(DATA_CORTE_JUMPPARK, today);

  return { truncated: true, spreadsheet, jumppark };
}
