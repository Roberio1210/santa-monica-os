import { describe, expect, it } from "vitest";
import { getVehicleCategory, listVehicleCategoryAssignments, setVehicleCategory } from "@/lib/orders/vehicle-category";

describe("getVehicleCategory — nunca inventa categoria pelo texto do modelo", () => {
  it("retorna 'desconhecido' sem placa", async () => {
    expect(await getVehicleCategory(null)).toBe("desconhecido");
  });

  it("retorna 'desconhecido' quando a placa nunca foi classificada (sem Postgres configurado)", async () => {
    expect(await getVehicleCategory("ABC1D23")).toBe("desconhecido");
  });
});

describe("listVehicleCategoryAssignments — honesto sem Postgres configurado", () => {
  it("retorna vazio, nunca inventado", async () => {
    expect(await listVehicleCategoryAssignments()).toEqual([]);
  });
});

describe("setVehicleCategory — validações antes de qualquer escrita", () => {
  it("rejeita placa inválida", async () => {
    await expect(setVehicleCategory("", "hatch", "Robério", "confirmado visualmente")).rejects.toThrow(/placa inválida/i);
  });

  it("nunca permite confirmar como 'desconhecido' — isso já é o padrão", async () => {
    await expect(setVehicleCategory("ABC1D23", "desconhecido", "Robério", "motivo")).rejects.toThrow(/desconhecido/i);
  });

  it("exige responsável", async () => {
    await expect(setVehicleCategory("ABC1D23", "hatch", "  ", "motivo")).rejects.toThrow(/responsável/i);
  });

  it("exige motivo", async () => {
    await expect(setVehicleCategory("ABC1D23", "hatch", "Robério", "  ")).rejects.toThrow(/motivo/i);
  });
});
