import { describe, expect, it } from "vitest";
import { fetchVehicleById, fetchVehicles, parseVehiclesQueryFilters, plateFromExternalId } from "@/lib/integrations/jumppark/vehiclesQuery";

describe("plateFromExternalId", () => {
  it("extrai a placa mascarada do externalId", () => {
    expect(plateFromExternalId("plate:AB***12")).toBe("AB***12");
  });

  it("null quando não tem o prefixo plate: (ou é null)", () => {
    expect(plateFromExternalId(null)).toBeNull();
    expect(plateFromExternalId("outracoisa")).toBeNull();
  });
});

describe("parseVehiclesQueryFilters", () => {
  it("valores padrão: página 1, ordenação por última visita desc, nenhum filtro", () => {
    const filters = parseVehiclesQueryFilters({});
    expect(filters.page).toBe(1);
    expect(filters.sortBy).toBe("lastVisit");
    expect(filters.sortDir).toBe("desc");
    expect(filters.modelQuery).toBeNull();
    expect(filters.plateQuery).toBeNull();
    expect(filters.customerQuery).toBeNull();
    expect(filters.serviceQuery).toBeNull();
    expect(filters.minVisits).toBeNull();
    expect(filters.minSpent).toBeNull();
    expect(filters.maxSpent).toBeNull();
    expect(filters.segment).toBeNull();
  });

  it("nunca aceita página menor que 1", () => {
    expect(parseVehiclesQueryFilters({ page: "0" }).page).toBe(1);
    expect(parseVehiclesQueryFilters({ page: "-3" }).page).toBe(1);
  });

  it("aceita sortBy válido; qualquer outro valor cai em lastVisit", () => {
    expect(parseVehiclesQueryFilters({ sort: "visitCount" }).sortBy).toBe("visitCount");
    expect(parseVehiclesQueryFilters({ sort: "totalSpent" }).sortBy).toBe("totalSpent");
    expect(parseVehiclesQueryFilters({ sort: "averageTicket" }).sortBy).toBe("averageTicket");
    expect(parseVehiclesQueryFilters({ sort: "model" }).sortBy).toBe("model");
    expect(parseVehiclesQueryFilters({ sort: "xyz" }).sortBy).toBe("lastVisit");
  });

  it("aceita um segmento válido; segmento desconhecido vira null (nunca inventa)", () => {
    expect(parseVehiclesQueryFilters({ segmento: "recorrentes" }).segment).toBe("recorrentes");
    expect(parseVehiclesQueryFilters({ segmento: "nao-existe" }).segment).toBeNull();
  });

  it("filtros numéricos: string inválida vira null, nunca NaN", () => {
    expect(parseVehiclesQueryFilters({ minVisitas: "abc" }).minVisits).toBeNull();
    expect(parseVehiclesQueryFilters({ minVisitas: "5" }).minVisits).toBe(5);
    expect(parseVehiclesQueryFilters({ gastoMin: "100.50" }).minSpent).toBe(100.5);
  });

  it("campos de texto vazios ou só espaço viram null", () => {
    expect(parseVehiclesQueryFilters({ modelo: "   " }).modelQuery).toBeNull();
    expect(parseVehiclesQueryFilters({ modelo: "  HB20  " }).modelQuery).toBe("HB20");
  });
});

describe("fetchVehicles / fetchVehicleById sem banco configurado", () => {
  it("fetchVehicles nunca lança e retorna lista vazia com databaseConfigured=false", async () => {
    const result = await fetchVehicles(parseVehiclesQueryFilters({}));
    expect(result.databaseConfigured).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("fetchVehicleById retorna null, nunca lança", async () => {
    await expect(fetchVehicleById("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });
});
