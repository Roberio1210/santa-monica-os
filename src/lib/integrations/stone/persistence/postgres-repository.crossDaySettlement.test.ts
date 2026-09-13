import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { stoneNormalizedTransactions } from "@/db/schema/stone";
import { StonePostgresRepository } from "@/lib/integrations/stone/persistence/postgres-repository";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão 69 — só roda contra Postgres real de teste (`TEST_DATABASE_URL`, nunca produção — garantia
 * de `src/db/client.ts`). Prova que a guarda `WHERE settled_payment_date IS NULL` do
 * `updateSettlementInfo` funciona de verdade em SQL real (não só na simulação em memória), e que
 * `findNormalizedTransactionsByAcquirerKeyAndInstallment` filtra corretamente no banco.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const EXTERNAL_KEY_PREFIX = "missao69-crossday-test-";

function record(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: `${EXTERNAL_KEY_PREFIX}${randomUUID()}`,
    acquirerTransactionKey: "ACQ-TEST-0001",
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
    importRunId: null,
    ...overrides,
  };
}

async function cleanup() {
  const db = getDb()!;
  await db.delete(stoneNormalizedTransactions).where(like(stoneNormalizedTransactions.externalKey, `${EXTERNAL_KEY_PREFIX}%`));
}

describe.skipIf(!hasRealDb)("StonePostgresRepository — correlação cross-day (Missão 69, Postgres real, planning-tests)", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("findNormalizedTransactionsByAcquirerKeyAndInstallment filtra por chave real + installmentNumber", async () => {
    const repo = new StonePostgresRepository();
    const target = record({ acquirerTransactionKey: "ACQ-FIND-TEST", installmentNumber: 1 });
    await repo.upsertNormalizedTransactions([
      target,
      record({ acquirerTransactionKey: "ACQ-FIND-TEST", installmentNumber: 2 }), // installment diferente
      record({ acquirerTransactionKey: "ACQ-OUTRA", installmentNumber: 1 }), // chave diferente
    ]);

    const found = await repo.findNormalizedTransactionsByAcquirerKeyAndInstallment("ACQ-FIND-TEST", 1);
    expect(found.map((r) => r.externalKey)).toEqual([target.externalKey]);
  });

  it("updateSettlementInfo grava settled_payment_date/settled_amount quando ainda null", async () => {
    const repo = new StonePostgresRepository();
    const sale = record({ settledPaymentDate: null, settledAmount: null });
    await repo.upsertNormalizedTransactions([sale]);

    // Coluna `settled_amount` é numeric(14,2) desde a criação (migration 0014, mesma precisão de
    // `net_amount`/`gross_amount`) — 9.888 (3 casas, valor real visto na Missão 68) arredonda para
    // 9.89 ao persistir. Isso não afeta a tolerância de 1 centavo da correlação (ambos arredondam
    // para 989 centavos), só a asserção precisa refletir a precisão real da coluna.
    const updated = await repo.updateSettlementInfo(sale.externalKey, "2026-07-23", 9.888);
    expect(updated).toBe(true);

    const row = await repo.getNormalizedTransactionByExternalKey(sale.externalKey);
    expect(row?.settledPaymentDate).toBe("2026-07-23");
    expect(row?.settledAmount).toBe(9.89);
    // Nenhum outro campo foi alterado pela guarda de UPDATE direcionado.
    expect(row?.grossAmount).toBe(10);
    expect(row?.eventType).toBe("sale");
  });

  it("updateSettlementInfo NUNCA sobrescreve — a guarda WHERE settled_payment_date IS NULL é real no SQL, não só na aplicação", async () => {
    const repo = new StonePostgresRepository();
    const sale = record({ settledPaymentDate: "2026-06-01", settledAmount: 42.5 });
    await repo.upsertNormalizedTransactions([sale]);

    const updated = await repo.updateSettlementInfo(sale.externalKey, "2026-07-23", 9.888);
    expect(updated).toBe(false);

    const row = await repo.getNormalizedTransactionByExternalKey(sale.externalKey);
    expect(row?.settledPaymentDate).toBe("2026-06-01");
    expect(row?.settledAmount).toBe(42.5);
  });

  it("updateSettlementInfo em externalKey inexistente -> false, nunca lança, nunca cria linha", async () => {
    const repo = new StonePostgresRepository();
    const updated = await repo.updateSettlementInfo(`${EXTERNAL_KEY_PREFIX}nunca-existiu`, "2026-07-23", 9.888);
    expect(updated).toBe(false);

    const db = getDb()!;
    const rows = await db.select().from(stoneNormalizedTransactions).where(eq(stoneNormalizedTransactions.externalKey, `${EXTERNAL_KEY_PREFIX}nunca-existiu`));
    expect(rows).toHaveLength(0);
  });
});
