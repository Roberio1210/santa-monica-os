import { describe, expect, it } from "vitest";
import { parsePlateConflictReviewItem, type PlateConflictReviewRawRow } from "./plateConflictEvidence";

/**
 * Missão 20 (Etapa D — UI read-only). `fetchPlateConflictReviewQueue` (plateConflictReviewQueue.ts)
 * e `fetchIdentityReviewQueue` (identityReviewQuery.ts) usam exatamente este predicado —
 * `parsePlateConflictReviewItem(row).kind !== "plateConflict"` — para decidir se uma linha vai
 * para a fila antiga (legado) ou para a fila nova (conflito de placa). Como as duas funções
 * exigem Postgres real para rodar de ponta a ponta (não há fallback em memória para
 * `identity_review_items`, mesma limitação já documentada nas Missões 14/17/28), este teste prova
 * a correção do PREDICADO em si — sem I/O — para as 3 formas de linha que ele precisa distinguir.
 *
 * I) review antigo (candidates/unresolvedOrders) continua indo para a fila legada, nunca some;
 * J) evidence inválida (declarada como conflito de placa mas malformada) também fica na fila
 *    legada, com fallback seguro (candidates/unresolvedOrders vazios — nunca renderizada como se
 *    fosse um conflito de placa válido, nunca crasha).
 */

function row(evidence: unknown): PlateConflictReviewRawRow {
  return {
    id: "row-1",
    subjectKey: "irrelevante-para-este-teste",
    plateMasked: "MQT1A01",
    status: "pending",
    evidence,
    decidedAt: null,
    decidedNotes: null,
    updatedAt: new Date(),
  };
}

function belongsToLegacyQueue(r: PlateConflictReviewRawRow): boolean {
  return parsePlateConflictReviewItem(r).kind !== "plateConflict";
}

describe("dispatch legado vs. conflito de placa — Missão 20", () => {
  it("I. review antigo (candidates/unresolvedOrders) -> permanece na fila legada", () => {
    const legacyRow = row({ candidates: [{ customerId: "c1", customerExternalId: "name:x", name: "X", visitCount: 1, totalSpent: 0, orderIds: [] }], unresolvedOrders: [] });
    expect(belongsToLegacyQueue(legacyRow)).toBe(true);
  });

  it("J. evidence inválida (conflictType presente mas malformada) -> fallback seguro na fila legada, nunca crasha", () => {
    const invalidRow = row({ conflictType: "manual_jumppark" /* sem normalizedPlate/existingVehicles */ });
    const parsed = parsePlateConflictReviewItem(invalidRow);
    expect(parsed.kind).toBe("invalidPlateConflictEvidence");
    expect(belongsToLegacyQueue(invalidRow)).toBe(true);
  });

  it("conflito de placa válido -> SAI da fila legada (vai para a fila dedicada, nunca duplicado)", () => {
    const validRow = row({ conflictType: "manual_jumppark", normalizedPlate: "MQT1A01", existingVehicles: [] });
    expect(belongsToLegacyQueue(validRow)).toBe(false);
  });

  it("evidence completamente desconhecida -> permanece na fila legada (fallback seguro, sem crash)", () => {
    const unknownRow = row({ algumCampoQualquer: true });
    expect(belongsToLegacyQueue(unknownRow)).toBe(true);
  });
});
