import { describe, expect, it } from "vitest";
import { parsePlateConflictReviewItem, type PlateConflictReviewRawRow } from "./plateConflictEvidence";

function baseRow(overrides: Partial<PlateConflictReviewRawRow> = {}): PlateConflictReviewRawRow {
  return {
    id: "review-item-1",
    subjectKey: "vehicle_plate_collision_manual_jumppark:MQT1A01",
    plateMasked: "MQT1A01",
    status: "pending",
    evidence: {},
    decidedAt: null,
    decidedNotes: null,
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("parsePlateConflictReviewItem — Missão 18 (Etapa B)", () => {
  it("A. manual_jumppark evidence válida -> ViewModel correto", () => {
    const row = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [{ vehicleId: "vehicle-1", customerId: "customer-1", source: "manual" }],
        incomingJumpParkExternalId: "jp-ext-1",
        incomingJumpParkCustomerExternalId: "name:fulano",
        incomingOrderIds: ["order-1"],
        origin: "jumppark",
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("plateConflict");
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.conflictType).toBe("manual_jumppark");
    expect(result.viewModel.normalizedPlate).toBe("MQT1A01");
    expect(result.viewModel.displayPlate).toBe("MQT1A01");
    expect(result.viewModel.reviewItemId).toBe("review-item-1");
    expect(result.viewModel.status).toBe("pending");
  });

  it("B. jumppark_jumppark evidence válida -> ViewModel correto", () => {
    const row = baseRow({
      evidence: {
        conflictType: "jumppark_jumppark",
        normalizedPlate: "MQT2B02",
        existingVehicles: [{ vehicleId: "vehicle-2", customerId: "customer-2", source: "jumppark" }],
        incomingJumpParkExternalId: "jp-ext-2",
        incomingJumpParkCustomerExternalId: null,
        incomingOrderIds: [],
        origin: "jumppark",
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("plateConflict");
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.conflictType).toBe("jumppark_jumppark");
  });

  it("C. múltiplos existingVehicles -> todos preservados, nenhum reduzido a 'o escolhido'", () => {
    const row = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT3C03",
        existingVehicles: [
          { vehicleId: "vehicle-a", customerId: "customer-a", source: "manual" },
          { vehicleId: "vehicle-b", customerId: "customer-b", source: "jumppark" },
          { vehicleId: "vehicle-c", customerId: "customer-c", source: "jumppark" },
        ],
        incomingJumpParkExternalId: "jp-ext-3",
        incomingJumpParkCustomerExternalId: "name:ciclano",
        incomingOrderIds: ["order-a", "order-b"],
        origin: "jumppark",
      },
    });
    const result = parsePlateConflictReviewItem(row);
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.existingVehicles).toHaveLength(3);
    expect(result.viewModel.existingVehicles.map((v) => v.vehicleId)).toEqual(["vehicle-a", "vehicle-b", "vehicle-c"]);
  });

  it("D. existingVehicles vazio -> comportamento seguro (não crasha, não vira inválido)", () => {
    const row = baseRow({
      evidence: {
        conflictType: "jumppark_jumppark",
        normalizedPlate: "MQT4D04",
        existingVehicles: [],
        incomingJumpParkExternalId: "jp-ext-4",
        incomingJumpParkCustomerExternalId: null,
        incomingOrderIds: [],
        origin: "jumppark",
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("plateConflict");
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.existingVehicles).toEqual([]);
  });

  it("E. normalizedPlate ausente -> invalidPlateConflictEvidence, sem crash", () => {
    const row = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        existingVehicles: [{ vehicleId: "vehicle-1", customerId: "customer-1", source: "manual" }],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("invalidPlateConflictEvidence");
  });

  it("F. conflictType desconhecido -> invalidPlateConflictEvidence, sem crash", () => {
    const row = baseRow({
      evidence: {
        conflictType: "algo_novo_nao_mapeado",
        normalizedPlate: "MQT5E05",
        existingVehicles: [],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("invalidPlateConflictEvidence");
  });

  it("G/H. evidence antiga (candidates/unresolvedOrders) -> legacyAmbiguity, NUNCA plateConflict", () => {
    const row = baseRow({
      subjectKey: "plate:ABC1234",
      evidence: {
        candidates: [{ customerId: "customer-1", customerExternalId: "name:fulano", name: "Fulano", visitCount: 3, totalSpent: 100, orderIds: ["order-1"] }],
        unresolvedOrders: [],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("legacyAmbiguity");
  });

  it("evidence completamente desconhecida (nem novo, nem antigo) -> unrecognized, sem crash", () => {
    const row = baseRow({ evidence: { algumCampoQualquer: true } });
    expect(parsePlateConflictReviewItem(row).kind).toBe("unrecognized");
  });

  it("evidence nula/vazia -> unrecognized, sem crash", () => {
    expect(parsePlateConflictReviewItem(baseRow({ evidence: null })).kind).toBe("unrecognized");
    expect(parsePlateConflictReviewItem(baseRow({ evidence: [] })).kind).toBe("unrecognized");
  });

  it("I. incomingOrderIds preservados quando presentes; [] quando ausentes (item pré-Missão-17)", () => {
    const withIds = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [],
        incomingOrderIds: ["order-x", "order-y"],
      },
    });
    const withoutIds = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [],
      },
    });
    const r1 = parsePlateConflictReviewItem(withIds);
    const r2 = parsePlateConflictReviewItem(withoutIds);
    if (r1.kind !== "plateConflict" || r2.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(r1.viewModel.incomingOrderIds).toEqual(["order-x", "order-y"]);
    expect(r2.viewModel.incomingOrderIds).toEqual([]);
  });

  it("J. nenhuma PII inventada no ViewModel", () => {
    const row = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [{ vehicleId: "vehicle-1", customerId: "customer-1", source: "manual" }],
        incomingOrderIds: ["order-1"],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(JSON.stringify(result.viewModel)).not.toMatch(/model|marca|brand|color|cor|phone|telefone|cpf|email|e-mail|name(?!space)/i);
  });

  it("K. status/decisão humana preservados sem reinterpretação", () => {
    const row = baseRow({
      status: "kept_separate",
      decidedAt: new Date("2026-08-15T10:00:00.000Z"),
      decidedNotes: "Carros diferentes, confirmado com o cliente",
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.status).toBe("kept_separate");
    expect(result.viewModel.decidedAt).toEqual(new Date("2026-08-15T10:00:00.000Z"));
    expect(result.viewModel.decidedNotes).toBe("Carros diferentes, confirmado com o cliente");
  });

  it("L. subjectKey inesperado não quebra o parser (nunca reparseado)", () => {
    const row = baseRow({
      subjectKey: "algo-totalmente-fora-do-padrao-conhecido-!!@@",
      evidence: {
        conflictType: "jumppark_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [],
      },
    });
    const result = parsePlateConflictReviewItem(row);
    expect(result.kind).toBe("plateConflict");
    if (result.kind !== "plateConflict") throw new Error("expected plateConflict");
    expect(result.viewModel.subjectKey).toBe("algo-totalmente-fora-do-padrao-conhecido-!!@@");
  });

  it("existingVehicles com entrada malformada (vehicleId ausente) -> invalidPlateConflictEvidence", () => {
    const row = baseRow({
      evidence: {
        conflictType: "manual_jumppark",
        normalizedPlate: "MQT1A01",
        existingVehicles: [{ customerId: "customer-1", source: "manual" }],
      },
    });
    expect(parsePlateConflictReviewItem(row).kind).toBe("invalidPlateConflictEvidence");
  });

  it("existingVehicles não é array -> invalidPlateConflictEvidence", () => {
    const row = baseRow({
      evidence: { conflictType: "manual_jumppark", normalizedPlate: "MQT1A01", existingVehicles: "nao-e-array" },
    });
    expect(parsePlateConflictReviewItem(row).kind).toBe("invalidPlateConflictEvidence");
  });
});
