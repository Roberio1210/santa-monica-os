import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { applyPaymentGroupAssignments } from "@/lib/integrations/stone/persistence/importRun";
import { resetStonePersistenceRepositoryForTests, getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { NormalizedConciliation, NormalizedSettlement } from "@/lib/integrations/stone/normalize";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão 81 (FASE 2) — prova de ponta a ponta (orquestração + repositório em memória) da
 * associação venda -> grupo, usando a identidade já persistida (`acquirerTransactionKey`+
 * `installmentNumber`, mesma usada por `applyCrossDaySettlements`). Nunca cria cash_movement,
 * nunca concilia bank_statement_lines.
 */

function conciliationWithSettlements(settlements: NormalizedSettlement[]): NormalizedConciliation {
  return {
    referenceDate: "2026-09-13",
    generationDateTime: "2026-09-13T05:00:00",
    establishmentCode: "900000001",
    layout: "XML2_4",
    sales: [],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [],
    realizedPayments: [],
    advances: [],
    settlements,
    financialEvents: [],
    financialPositions: [],
    terminalSerialNumbers: [],
  };
}

function settlement(overrides: Partial<NormalizedSettlement> = {}): NormalizedSettlement {
  return { saleExternalReference: "ACQ-KEY-0001", installmentNumber: 1, netAmount: 9.888, settledPaymentDate: "2026-09-13", isAdvance: false, paymentId: "PAY-1", ...overrides };
}

function persistedSale(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "ext-sale-0001",
    acquirerTransactionKey: "ACQ-KEY-0001",
    authorizationCode: "AUTH01",
    initiatorTransactionKey: null,
    establishmentCode: "900000001",
    terminalSerialNumber: "TERM01",
    capturedAt: "2026-09-12T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 10,
    feeAmount: 0.112,
    netAmount: 9.888,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "settled_on_time",
    expectedPaymentDate: "2026-09-13",
    settledPaymentDate: "2026-09-13",
    settledAmount: 9.888,
    mdrAmountStone: 0.112,
    saleFeeCombined: null,
    advanceFeeAmountStone: null,
    sourceFile: "900000001-20260913-XML2_4-without_reversals.xml",
    importRunId: "run-1",
    ...overrides,
  };
}

describe("applyPaymentGroupAssignments — Missão 81 (FASE 2)", () => {
  beforeEach(() => {
    resetStonePersistenceRepositoryForTests();
  });

  it("5/12) 1 paymentId + 1 venda -> venda recebe o groupId correto", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);
    const map = new Map([["PAY-1", "group-A"]]);

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(result).toEqual({ assigned: 1, conflicts: 0 });

    const updated = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(updated?.paymentGroupId).toBe("group-A");
  });

  it("6) 1 paymentId + N vendas -> todas recebem o MESMO groupId", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([
      persistedSale({ externalKey: "ext-A", acquirerTransactionKey: "ACQ-A" }),
      persistedSale({ externalKey: "ext-B", acquirerTransactionKey: "ACQ-B" }),
      persistedSale({ externalKey: "ext-C", acquirerTransactionKey: "ACQ-C" }),
    ]);
    const map = new Map([["PAY-1", "group-A"]]);
    const settlements = [
      settlement({ saleExternalReference: "ACQ-A" }),
      settlement({ saleExternalReference: "ACQ-B" }),
      settlement({ saleExternalReference: "ACQ-C" }),
    ];

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements(settlements), map, repo);
    expect(result).toEqual({ assigned: 3, conflicts: 0 });

    for (const key of ["ext-A", "ext-B", "ext-C"]) {
      const row = await repo.getNormalizedTransactionByExternalKey(key);
      expect(row?.paymentGroupId).toBe("group-A");
    }
  });

  it("13) venda sem paymentId no settlement -> permanece com payment_group_id NULL", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);
    const map = new Map([["PAY-1", "group-A"]]);

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement({ paymentId: null })]), map, repo);
    expect(result).toEqual({ assigned: 0, conflicts: 0 });

    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.paymentGroupId ?? null).toBeNull();
  });

  it("paymentId sem grupo resolvido neste ciclo (não está no map) -> nunca associa", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);
    const map = new Map<string, string>(); // vazio — grupo não formado (conflito na Parte D)

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(result).toEqual({ assigned: 0, conflicts: 0 });
    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.paymentGroupId ?? null).toBeNull();
  });

  it("14) reprocessar o mesmo settlement é idempotente — segunda chamada não soma nem conflita", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);
    const map = new Map([["PAY-1", "group-A"]]);

    const first = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(first).toEqual({ assigned: 1, conflicts: 0 });

    const second = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(second).toEqual({ assigned: 0, conflicts: 0 }); // same_group -> no-op silencioso

    const row = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(row?.paymentGroupId).toBe("group-A");
  });

  it("15) venda já pertence a outro grupo -> conflito, NUNCA reatribuída", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ paymentGroupId: "group-OLD" })]);
    const map = new Map([["PAY-1", "group-NEW"]]);

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(result).toEqual({ assigned: 0, conflicts: 1 });

    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.paymentGroupId).toBe("group-OLD"); // nunca trocado
  });

  it("settlement referenciando venda inexistente -> nenhuma associação, nunca lança, nunca cria linha", async () => {
    const repo = getStonePersistenceRepository();
    const map = new Map([["PAY-1", "group-A"]]);
    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement({ saleExternalReference: "NUNCA-EXISTIU" })]), map, repo);
    expect(result).toEqual({ assigned: 0, conflicts: 0 });
  });

  it("duas vendas persistidas para a mesma identidade (acquirerKey+installment) -> nenhuma associação determinística (0 ou >1 candidato)", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ externalKey: "ext-A" }), persistedSale({ externalKey: "ext-B" })]);
    const map = new Map([["PAY-1", "group-A"]]);

    const result = await applyPaymentGroupAssignments(conciliationWithSettlements([settlement()]), map, repo);
    expect(result).toEqual({ assigned: 0, conflicts: 0 });
    expect((await repo.getNormalizedTransactionByExternalKey("ext-A"))?.paymentGroupId ?? null).toBeNull();
    expect((await repo.getNormalizedTransactionByExternalKey("ext-B"))?.paymentGroupId ?? null).toBeNull();
  });

  it("18/19) prova estática — módulo de orquestração nunca cria cash_movement nem concilia bank_statement_lines dentro de applyPaymentGroupAssignments", () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "importRun.ts");
    const source = readFileSync(sourcePath, "utf8");
    const fnStart = source.indexOf("export async function applyPaymentGroupAssignments");
    const fnEnd = source.indexOf("\n}\n", fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("createCashMovement");
    expect(fnBody).not.toContain("getFinanceRepository");
    expect(fnBody).not.toContain("getBankStatementRepository");
    expect(fnBody).not.toContain("attemptStoneSettlementReconciliation");
    expect(fnBody).not.toContain("upsertReconciliationResults");
  });
});
