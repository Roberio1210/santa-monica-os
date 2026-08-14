import { describe, expect, it } from "vitest";
import { determineDataQuality, toRecipeVehicleCategory } from "@/lib/inventory/managerial-consumption-analysis";

describe("toRecipeVehicleCategory — Missão de Wiring do Consumo Gerencial V1", () => {
  it("bucket 'indeterminado' vira 'sedan' (fator neutro), nunca escolhido como suv/hatch/caminhonete", () => {
    expect(toRecipeVehicleCategory("indeterminado")).toBe("sedan");
  });

  it("buckets reais passam direto, sem tradução", () => {
    expect(toRecipeVehicleCategory("hatch")).toBe("hatch");
    expect(toRecipeVehicleCategory("suv")).toBe("suv");
    expect(toRecipeVehicleCategory("caminhonete")).toBe("caminhonete");
    expect(toRecipeVehicleCategory("sedan")).toBe("sedan");
  });
});

describe("determineDataQuality — Missão de Wiring do Consumo Gerencial V1, seção 14", () => {
  it("INSUFFICIENT quando expectedConsumption é null", () => {
    const result = determineDataQuality({ expectedConsumption: null, apparentConsumption: 10, status: "INSUFFICIENT_DATA" }, false, false);
    expect(result).toBe("INSUFFICIENT");
  });

  it("INSUFFICIENT quando apparentConsumption é null", () => {
    const result = determineDataQuality({ expectedConsumption: 10, apparentConsumption: null, status: "INSUFFICIENT_DATA" }, false, false);
    expect(result).toBe("INSUFFICIENT");
  });

  it("INSUFFICIENT quando status é INSUFFICIENT_DATA mesmo com números presentes (ex.: falta tolerância)", () => {
    const result = determineDataQuality({ expectedConsumption: 10, apparentConsumption: 12, status: "INSUFFICIENT_DATA" }, false, false);
    expect(result).toBe("INSUFFICIENT");
  });

  it("PARTIAL quando o período de estoque teve que ser ajustado", () => {
    const result = determineDataQuality({ expectedConsumption: 10, apparentConsumption: 12, status: "NORMAL" }, true, false);
    expect(result).toBe("PARTIAL");
  });

  it("PARTIAL quando há bucket de porte indeterminado contribuindo", () => {
    const result = determineDataQuality({ expectedConsumption: 10, apparentConsumption: 12, status: "NORMAL" }, false, true);
    expect(result).toBe("PARTIAL");
  });

  it("RELIABLE quando tudo presente, sem ajuste de período e sem porte indeterminado", () => {
    const result = determineDataQuality({ expectedConsumption: 10, apparentConsumption: 12, status: "NORMAL" }, false, false);
    expect(result).toBe("RELIABLE");
  });
});
