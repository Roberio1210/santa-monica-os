import { describe, expect, it } from "vitest";
import { computeServicesRealizedFromOrders, extractVehicleCategoryBucketFromServiceName } from "@/lib/jumppark-orders/managerial-services-realized";
import type { HistoricalOrderRow } from "@/lib/jumppark-orders/historical-theoretical-consumption";

const BRONZE_ID = "bronze-id";
const SILVER_ID = "silver-id";
const GOLD_ID = "gold-id";
const SERVICE_NAMES = new Map([
  [BRONZE_ID, "Bronze"],
  [SILVER_ID, "Silver"],
  [GOLD_ID, "Gold"],
]);

const MAPPINGS = new Map([
  ["Lavação Bronze - Hatch", { canonicalServiceId: BRONZE_ID, status: "mapeado" as const }],
  ["Lavação Bronze - SUV", { canonicalServiceId: BRONZE_ID, status: "mapeado" as const }],
  ["Lavação Bronze - Caminhonete", { canonicalServiceId: BRONZE_ID, status: "mapeado" as const }],
  ["Lavação Bronze - SUV/SEDAN", { canonicalServiceId: BRONZE_ID, status: "mapeado" as const }],
  ["Lavação Silver - Hatch", { canonicalServiceId: SILVER_ID, status: "mapeado" as const }],
  ["Lavação Gold - Hatch", { canonicalServiceId: GOLD_ID, status: "mapeado" as const }],
  ["Lavagem Gold", { canonicalServiceId: GOLD_ID, status: "mapeado" as const }],
  ["Serviço Legado Não Confirmado", { canonicalServiceId: null, status: "nao_mapeado" as const }],
]);

function order(overrides: Partial<HistoricalOrderRow> = {}): HistoricalOrderRow {
  return { externalId: "ord-1", orderDate: "2026-08-01", descriptions: [], ...overrides };
}

describe("extractVehicleCategoryBucketFromServiceName", () => {
  it("reconhece hatch/suv/caminhonete isolados", () => {
    expect(extractVehicleCategoryBucketFromServiceName("Lavação Bronze - Hatch")).toBe("hatch");
    expect(extractVehicleCategoryBucketFromServiceName("Lavação Bronze - SUV")).toBe("suv");
    expect(extractVehicleCategoryBucketFromServiceName("Lavação Bronze - Caminhonete")).toBe("caminhonete");
  });

  it("Missão de Estoque Gerencial V2, seção 1/19 — SUV/SEDAN ganha bucket próprio, nunca 'indeterminado' genérico", () => {
    expect(extractVehicleCategoryBucketFromServiceName("Lavação Bronze - SUV/SEDAN")).toBe("suv_sedan_combinado");
    expect(extractVehicleCategoryBucketFromServiceName("Lavação Silver - Sedan/SUV")).toBe("suv_sedan_combinado");
  });

  it("nome sem sufixo de porte permanece indeterminado (ex.: 'Lavagem Gold') — nunca confundido com suv_sedan_combinado", () => {
    expect(extractVehicleCategoryBucketFromServiceName("Lavagem Gold")).toBe("indeterminado");
  });
});

describe("computeServicesRealizedFromOrders — Missão de Wiring do Consumo Gerencial V1, seção 4/5/6/25", () => {
  it("serviço Bronze corretamente contado", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Bronze - Hatch"] }), order({ externalId: "o2", descriptions: ["Lavação Bronze - Hatch"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    const bronzeHatch = result.cells.find((c) => c.serviceId === BRONZE_ID && c.vehicleCategoryBucket === "hatch");
    expect(bronzeHatch?.servicesRealized).toBe(2);
  });

  it("Silver corretamente contado", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Silver - Hatch"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells.find((c) => c.serviceId === SILVER_ID)?.servicesRealized).toBe(1);
  });

  it("Gold corretamente contado, mesmo com nome sem sufixo ('Lavagem Gold')", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Gold - Hatch"] }), order({ externalId: "o2", descriptions: ["Lavagem Gold"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    const goldHatch = result.cells.find((c) => c.serviceId === GOLD_ID && c.vehicleCategoryBucket === "hatch");
    const goldIndeterminado = result.cells.find((c) => c.serviceId === GOLD_ID && c.vehicleCategoryBucket === "indeterminado");
    expect(goldHatch?.servicesRealized).toBe(1);
    expect(goldIndeterminado?.servicesRealized).toBe(1);
  });

  it("ordem fora do período oficial JumpPark (antes do corte) não é contada", () => {
    const orders = [order({ externalId: "o1", orderDate: "2026-04-15", descriptions: ["Lavação Bronze - Hatch"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells).toEqual([]);
    expect(result.ordersOutsideJumpParkOfficialPeriod).toBe(1);
  });

  it("serviço não mapeado não é contado", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Serviço Legado Não Confirmado"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells).toEqual([]);
    expect(result.ordersUnmapped).toBe(1);
    expect(result.unmappedDescriptions).toEqual(["Serviço Legado Não Confirmado"]);
  });

  it("categoria correta aplicada — Bronze Hatch e Bronze SUV não se misturam", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Bronze - Hatch"] }), order({ externalId: "o2", descriptions: ["Lavação Bronze - SUV"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "hatch")?.servicesRealized).toBe(1);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "suv")?.servicesRealized).toBe(1);
  });

  it("SUV/SEDAN vira bucket 'suv_sedan_combinado' isolado, nunca somado a hatch/suv/sedan/indeterminado", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Bronze - Hatch"] }), order({ externalId: "o2", descriptions: ["Lavação Bronze - SUV/SEDAN"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "hatch")?.servicesRealized).toBe(1);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "suv_sedan_combinado")?.servicesRealized).toBe(1);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "sedan")).toBeUndefined();
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "indeterminado")).toBeUndefined();
  });

  it("outra descrição realmente desconhecida (sem SUV/SEDAN) continua indeterminada/não mapeada — nunca confundida com suv_sedan_combinado", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavagem Gold"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "indeterminado")?.servicesRealized).toBe(1);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "suv_sedan_combinado")).toBeUndefined();
  });

  it("2 itens da mesma ordem mapeando para o mesmo (serviço,bucket) contam a ordem 1 vez, nunca duplicidade", () => {
    const orders = [order({ externalId: "o1", descriptions: ["Lavação Bronze - Hatch", "Lavação Bronze - Hatch"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.cells.find((c) => c.vehicleCategoryBucket === "hatch")?.servicesRealized).toBe(1);
  });

  it("ordensEvaluated conta todas as ordens recebidas, mesmo as excluídas por período/mapeamento", () => {
    const orders = [order({ externalId: "o1", orderDate: "2026-04-01" }), order({ externalId: "o2", descriptions: ["Serviço Legado Não Confirmado"] })];
    const result = computeServicesRealizedFromOrders(orders, MAPPINGS, SERVICE_NAMES);
    expect(result.ordersEvaluated).toBe(2);
  });
});
