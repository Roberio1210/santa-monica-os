import { describe, expect, it } from "vitest";
import { mapParkingRecordsToRevenueCandidates, mapWashRecordsToRevenueCandidates, type RawParkingRecordRow, type RawWashRecordRow } from "@/lib/finance/historicalRevenue";

function makeWashRow(overrides: Partial<RawWashRecordRow>): RawWashRecordRow {
  return { externalId: "hist-sheet-lavacao:jan:1", recordDate: "2026-01-10", clientName: "Cliente Teste", serviceTypeRaw: "BRONZE", totalReceived: "80", ...overrides };
}

function makeParkingRow(overrides: Partial<RawParkingRecordRow>): RawParkingRecordRow {
  return { externalId: "hist-sheet-estacionamento:2026-01-10", recordDate: "2026-01-10", totalAmount: "300", ...overrides };
}

describe("mapWashRecordsToRevenueCandidates — Missão UX/Navegação 2", () => {
  it("mapeia um registro real para um candidato de receita 'Lavação'", () => {
    const [candidate] = mapWashRecordsToRevenueCandidates([makeWashRow({})]);
    expect(candidate.category).toBe("Lavação");
    expect(candidate.amount).toBe(80);
    expect(candidate.date).toBe("2026-01-10");
  });

  it("totalReceived null é OMITIDO — nunca vira um lançamento de R$0 (ausência de dado ≠ zero)", () => {
    const candidates = mapWashRecordsToRevenueCandidates([makeWashRow({ totalReceived: null })]);
    expect(candidates).toHaveLength(0);
  });

  it("totalReceived zero é OMITIDO — mesma regra", () => {
    const candidates = mapWashRecordsToRevenueCandidates([makeWashRow({ totalReceived: "0" })]);
    expect(candidates).toHaveLength(0);
  });

  it("cada linha da planilha vira um candidato independente — nunca agregado por dia (a fonte já tem granularidade por lavação real)", () => {
    const rows = [makeWashRow({ externalId: "a", totalReceived: "50" }), makeWashRow({ externalId: "b", totalReceived: "60" })];
    const candidates = mapWashRecordsToRevenueCandidates(rows);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.amount)).toEqual([50, 60]);
  });
});

describe("mapParkingRecordsToRevenueCandidates — Missão UX/Navegação 2", () => {
  it("mapeia um dia real para um candidato de receita 'Estacionamento'", () => {
    const [candidate] = mapParkingRecordsToRevenueCandidates([makeParkingRow({})]);
    expect(candidate.category).toBe("Estacionamento");
    expect(candidate.amount).toBe(300);
  });

  it("totalAmount zero é OMITIDO — dia real sem faturamento não gera candidato de R$0", () => {
    const candidates = mapParkingRecordsToRevenueCandidates([makeParkingRow({ totalAmount: "0" })]);
    expect(candidates).toHaveLength(0);
  });

  it("um registro por dia real — nunca ratear/agregar além da granularidade diária já existente na fonte", () => {
    const rows = [makeParkingRow({ externalId: "d1", recordDate: "2026-01-10", totalAmount: "300" }), makeParkingRow({ externalId: "d2", recordDate: "2026-01-11", totalAmount: "250" })];
    const candidates = mapParkingRecordsToRevenueCandidates(rows);
    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.date === "2026-01-11")?.amount).toBe(250);
  });
});
