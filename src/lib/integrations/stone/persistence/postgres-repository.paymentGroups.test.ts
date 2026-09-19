import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { stoneNormalizedTransactions, stonePaymentGroups } from "@/db/schema/stone";
import { StonePostgresRepository } from "@/lib/integrations/stone/persistence/postgres-repository";
import type { StoneNormalizedTransactionRecord, StonePaymentGroupRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão 81 (FASE 2) — só roda contra Postgres real de teste (`TEST_DATABASE_URL`, nunca
 * produção — garantia de `src/db/client.ts`). Prova que as constraints reais (UNIQUE payment_id,
 * FK, guarda `WHERE payment_group_id IS NULL`) funcionam de verdade em SQL, não só na simulação
 * em memória.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const PAYMENT_ID_PREFIX = "missao81-test-payment-";
const EXTERNAL_KEY_PREFIX = "missao81-test-tx-";

function paymentGroup(overrides: Partial<StonePaymentGroupRecord> = {}): StonePaymentGroupRecord {
  return { paymentId: `${PAYMENT_ID_PREFIX}${randomUUID()}`, paymentDate: "2026-09-13", totalAmount: 543.87, walletTypeId: 3, sourceFile: "test.xml", importRunId: null, ...overrides };
}

function transactionRecord(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: `${EXTERNAL_KEY_PREFIX}${randomUUID()}`,
    acquirerTransactionKey: "ACQ-TEST-0001",
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
    receivableState: "scheduled",
    expectedPaymentDate: "2026-09-13",
    settledPaymentDate: null,
    settledAmount: null,
    mdrAmountStone: null,
    saleFeeCombined: null,
    advanceFeeAmountStone: null,
    sourceFile: "900000001-20260912-XML2_4-without_reversals.xml",
    importRunId: null,
    ...overrides,
  };
}

async function cleanup() {
  const db = getDb()!;
  await db.delete(stoneNormalizedTransactions).where(like(stoneNormalizedTransactions.externalKey, `${EXTERNAL_KEY_PREFIX}%`));
  await db.delete(stonePaymentGroups).where(like(stonePaymentGroups.paymentId, `${PAYMENT_ID_PREFIX}%`));
}

describe.skipIf(!hasRealDb)("StonePostgresRepository — grupos de repasse Stone (Missão 81, Postgres real, planning-tests)", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("1) upsertPaymentGroups: INSERT real de um grupo novo", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    const result = await repo.upsertPaymentGroups([group]);
    expect(result.conflicts).toEqual([]);
    expect(result.idByPaymentId[group.paymentId]).toBeDefined();
  });

  it("2) UNIQUE payment_id é real no banco — upsert repetido com metadata idêntica reutiliza o mesmo id, nunca duplica linha", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    const first = await repo.upsertPaymentGroups([group]);
    const second = await repo.upsertPaymentGroups([group]);
    expect(second.conflicts).toEqual([]);
    expect(second.idByPaymentId[group.paymentId]).toBe(first.idByPaymentId[group.paymentId]);

    const db = getDb()!;
    const rows = await db.select().from(stonePaymentGroups).where(like(stonePaymentGroups.paymentId, group.paymentId));
    expect(rows).toHaveLength(1);
  });

  it("3) reutilização idempotente: metadata compatível reaproveita id existente", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup({ walletTypeId: null });
    const first = await repo.upsertPaymentGroups([group]);
    const second = await repo.upsertPaymentGroups([{ ...group, walletTypeId: 3 }]); // aditivo, nunca conflito
    expect(second.conflicts).toEqual([]);
    expect(second.idByPaymentId[group.paymentId]).toBe(first.idByPaymentId[group.paymentId]);
  });

  it("7) metadata conflitante (totalAmount divergente) NÃO é sobrescrita — guarda real no SQL (setWhere), não só na aplicação", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup({ totalAmount: 100 });
    await repo.upsertPaymentGroups([group]);
    const conflicting = await repo.upsertPaymentGroups([{ ...group, totalAmount: 999 }]);
    expect(conflicting.idByPaymentId[group.paymentId]).toBeUndefined();
    expect(conflicting.conflicts).toEqual([{ paymentId: group.paymentId, fields: ["total_amount"] }]);

    const db = getDb()!;
    const [row] = await db.select().from(stonePaymentGroups).where(like(stonePaymentGroups.paymentId, group.paymentId));
    expect(Number(row.totalAmount)).toBe(100); // valor original preservado
  });

  it("4) FK venda -> grupo funciona de verdade (assignPaymentGroup real)", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    const { idByPaymentId } = await repo.upsertPaymentGroups([group]);
    const groupId = idByPaymentId[group.paymentId];

    const tx = transactionRecord();
    await repo.upsertNormalizedTransactions([tx]);

    const result = await repo.assignPaymentGroup(tx.externalKey, groupId);
    expect(result).toBe("assigned");

    const row = await repo.getNormalizedTransactionByExternalKey(tx.externalKey);
    expect(row?.paymentGroupId).toBe(groupId);
  });

  it("5) várias vendas -> mesmo grupo (nunca UNIQUE nessa direção, real no banco)", async () => {
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    const { idByPaymentId } = await repo.upsertPaymentGroups([group]);
    const groupId = idByPaymentId[group.paymentId];

    const txA = transactionRecord({ acquirerTransactionKey: "ACQ-A" });
    const txB = transactionRecord({ acquirerTransactionKey: "ACQ-B" });
    await repo.upsertNormalizedTransactions([txA, txB]);

    await repo.assignPaymentGroup(txA.externalKey, groupId);
    await repo.assignPaymentGroup(txB.externalKey, groupId);

    expect((await repo.getNormalizedTransactionByExternalKey(txA.externalKey))?.paymentGroupId).toBe(groupId);
    expect((await repo.getNormalizedTransactionByExternalKey(txB.externalKey))?.paymentGroupId).toBe(groupId);
  });

  it("6) venda não pode ser reatribuída — guarda WHERE payment_group_id IS NULL é real no SQL", async () => {
    const repo = new StonePostgresRepository();
    const groupA = paymentGroup();
    const groupB = paymentGroup();
    const upsertA = await repo.upsertPaymentGroups([groupA]);
    const upsertB = await repo.upsertPaymentGroups([groupB]);

    const tx = transactionRecord();
    await repo.upsertNormalizedTransactions([tx]);
    await repo.assignPaymentGroup(tx.externalKey, upsertA.idByPaymentId[groupA.paymentId]);

    const result = await repo.assignPaymentGroup(tx.externalKey, upsertB.idByPaymentId[groupB.paymentId]);
    expect(result).toBe("conflict");

    const row = await repo.getNormalizedTransactionByExternalKey(tx.externalKey);
    expect(row?.paymentGroupId).toBe(upsertA.idByPaymentId[groupA.paymentId]); // nunca trocado
  });

  it("9) nenhum bank_statement_line é alterado por este fluxo", async () => {
    const db = getDb()!;
    const before = await db.select().from((await import("@/db/schema/bankStatement")).bankStatementLines).limit(1);
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    await repo.upsertPaymentGroups([group]);
    const after = await db.select().from((await import("@/db/schema/bankStatement")).bankStatementLines).limit(1);
    expect(after).toEqual(before);
  });

  it("10) nenhum cash_movement é criado por este fluxo", async () => {
    const db = getDb()!;
    const cashMovements = (await import("@/db/schema/finance")).cashMovements;
    const before = await db.select({ n: cashMovements.id }).from(cashMovements);
    const repo = new StonePostgresRepository();
    const group = paymentGroup();
    const { idByPaymentId } = await repo.upsertPaymentGroups([group]);
    const tx = transactionRecord();
    await repo.upsertNormalizedTransactions([tx]);
    await repo.assignPaymentGroup(tx.externalKey, idByPaymentId[group.paymentId]);
    const after = await db.select({ n: cashMovements.id }).from(cashMovements);
    expect(after.length).toBe(before.length);
  });
});
