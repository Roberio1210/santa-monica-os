import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCrossDaySettlements } from "@/lib/integrations/stone/persistence/importRun";
import { resetStonePersistenceRepositoryForTests, getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { NormalizedConciliation, NormalizedSettlement } from "@/lib/integrations/stone/normalize";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão 69 — prova de ponta a ponta (orquestração + repositório em memória, sem HTTP/Stone real)
 * do cenário exato comprovado na Missão 68 com dado real: venda persistida num dia, liquidação
 * chegando no arquivo do dia seguinte (D+1). Fixtures sintéticas — nenhum dado de produção usado.
 */

function conciliationWithSettlements(settlements: NormalizedSettlement[], referenceDate = "2026-07-23"): NormalizedConciliation {
  return {
    referenceDate,
    generationDateTime: `${referenceDate}T05:00:00`,
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
  return { saleExternalReference: "ACQ-KEY-0001", installmentNumber: 1, netAmount: 9.888, settledPaymentDate: "2026-07-23", isAdvance: false, ...overrides };
}

function persistedSale(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "ext-sale-0001",
    acquirerTransactionKey: "ACQ-KEY-0001",
    authorizationCode: "AUTH01",
    initiatorTransactionKey: null,
    establishmentCode: "900000001",
    terminalSerialNumber: "TERM01",
    capturedAt: "2026-07-22T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 10,
    feeAmount: 0.112,
    netAmount: 9.888,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "scheduled",
    expectedPaymentDate: "2026-07-24",
    settledPaymentDate: null,
    settledAmount: null,
    mdrAmountStone: 0.112,
    saleFeeCombined: null,
    advanceFeeAmountStone: null,
    sourceFile: "900000001-20260722-XML2_4-without_reversals.xml",
    importRunId: "run-1",
    ...overrides,
  };
}

describe("applyCrossDaySettlements — Missão 69 (cenário real: venda 22/07, liquidação 23/07)", () => {
  beforeEach(() => {
    resetStonePersistenceRepositoryForTests();
  });

  it("1/14) venda persistida em 22/07 + settlement do arquivo de 23/07: encontra e atualiza settled_payment_date/settled_amount", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement()]), repo);
    expect(result).toEqual({ resolved: 1, conflicts: 0 });

    const updated = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(updated?.settledPaymentDate).toBe("2026-07-23");
    expect(updated?.settledAmount).toBe(9.888);
    // Nenhum outro campo da venda foi alterado.
    expect(updated?.grossAmount).toBe(10);
    expect(updated?.capturedAt).toBe("2026-07-22T12:00:00.000Z");
    expect(updated?.sourceFile).toBe("900000001-20260722-XML2_4-without_reversals.xml");
  });

  it("3) chave bate mas installmentNumber diferente -> não associa (repository não devolve candidato)", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ installmentNumber: 1 })]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement({ installmentNumber: 2 })]), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 0 });

    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.settledPaymentDate).toBeNull();
  });

  it("4) chave e installment batem mas netAmount diverge -> conflito, nunca atualiza", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ netAmount: 9.888 })]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement({ netAmount: 500.0 })]), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 1 });

    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.settledPaymentDate).toBeNull();
  });

  it("5) settlement sem nenhuma venda persistida correspondente -> nada acontece, nunca inventa associação", async () => {
    const repo = getStonePersistenceRepository();
    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement({ saleExternalReference: "NUNCA-EXISTIU" })]), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 0 });
  });

  it("6/13) venda já com settled_payment_date preenchido (simulando uma das 669 já conciliadas) -> NUNCA sobrescreve, mesmo com valor batendo", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ settledPaymentDate: "2026-07-24", settledAmount: 9.888 })]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement({ settledPaymentDate: "2026-07-23" })]), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 0 });

    const untouched = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(untouched?.settledPaymentDate).toBe("2026-07-24"); // data original, nunca trocada pela nova
    expect(untouched?.settledAmount).toBe(9.888);
  });

  it("7) reprocessar exatamente o mesmo settlement é idempotente — segunda chamada não muda nada nem re-conta como resolvido", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);

    const first = await applyCrossDaySettlements(conciliationWithSettlements([settlement()]), repo);
    expect(first).toEqual({ resolved: 1, conflicts: 0 });

    const second = await applyCrossDaySettlements(conciliationWithSettlements([settlement()]), repo);
    expect(second).toEqual({ resolved: 0, conflicts: 0 }); // já liquidado — no-op, nunca duplica nem re-escreve

    const record = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(record?.settledPaymentDate).toBe("2026-07-23");
  });

  it("8) duas vendas persistidas para a mesma identidade -> conflito, nenhuma é escolhida arbitrariamente", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale({ externalKey: "ext-A" }), persistedSale({ externalKey: "ext-B" })]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement()]), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 1 });

    expect((await repo.getNormalizedTransactionByExternalKey("ext-A"))?.settledPaymentDate).toBeNull();
    expect((await repo.getNormalizedTransactionByExternalKey("ext-B"))?.settledPaymentDate).toBeNull();
  });

  it("10) nunca cria uma nova linha de venda — total de registros permanece o mesmo antes e depois", async () => {
    const repo = getStonePersistenceRepository();
    await repo.upsertNormalizedTransactions([persistedSale()]);
    const before = await repo.listNormalizedTransactionsByCapturedDateRange("2000-01-01", "2100-01-01");

    await applyCrossDaySettlements(conciliationWithSettlements([settlement()]), repo);
    const after = await repo.listNormalizedTransactionsByCapturedDateRange("2000-01-01", "2100-01-01");

    expect(after).toHaveLength(before.length);
    expect(after).toHaveLength(1);
  });

  it("9) venda e settlement no MESMO referenceDate continuam funcionando (idempotente com o caminho normal — vira no-op se já liquidado por buildNormalizedTransactionRecords)", async () => {
    const repo = getStonePersistenceRepository();
    // Simula o resultado já correto do caminho intra-dia existente (settledPaymentDate já preenchido).
    await repo.upsertNormalizedTransactions([persistedSale({ settledPaymentDate: "2026-07-22", settledAmount: 9.888 })]);

    const result = await applyCrossDaySettlements(conciliationWithSettlements([settlement({ settledPaymentDate: "2026-07-22" })], "2026-07-22"), repo);
    expect(result).toEqual({ resolved: 0, conflicts: 0 }); // already_settled — o caminho normal já resolveu, este passo não faz nada

    const record = await repo.getNormalizedTransactionByExternalKey("ext-sale-0001");
    expect(record?.settledPaymentDate).toBe("2026-07-22");
  });

  it("13) as 669 conciliações existentes (simuladas aqui como vendas já liquidadas) nunca são tocadas mesmo processando um lote grande com settlements não relacionados", async () => {
    const repo = getStonePersistenceRepository();
    const alreadySettled = persistedSale({ externalKey: "ext-already-settled", acquirerTransactionKey: "ACQ-OLD", settledPaymentDate: "2026-06-01", settledAmount: 42.0 });
    await repo.upsertNormalizedTransactions([alreadySettled]);
    const before = await repo.getNormalizedTransactionByExternalKey("ext-already-settled");

    // Lote de settlements não relacionados a essa venda antiga.
    const settlements = Array.from({ length: 20 }, (_, i) => settlement({ saleExternalReference: `OUTRA-VENDA-${i}`, netAmount: 10 + i }));
    await applyCrossDaySettlements(conciliationWithSettlements(settlements), repo);

    const after = await repo.getNormalizedTransactionByExternalKey("ext-already-settled");
    expect(after).toEqual(before);
  });

  it("11/12) prova estática — o módulo nunca importa persistência de cash_movements nem de conciliação (nunca cria cash_movement/reconciliação automaticamente)", () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "importRun.ts");
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toContain("createCashMovement");
    expect(source).not.toContain("getFinanceRepository");
    // A única escrita de liquidação cross-day é `updateSettlementInfo` — nunca upsertReconciliationResults dentro de `applyCrossDaySettlements`.
    const fnStart = source.indexOf("export async function applyCrossDaySettlements");
    const fnEnd = source.indexOf("\n}\n", fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("upsertReconciliationResults");
    expect(fnBody).not.toContain("upsertDivergences");
    expect(fnBody).not.toContain("createCashMovement");
  });
});
