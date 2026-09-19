import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { cashMovements, employeeAdvances, employeePayments } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { createEmployeeAdvance, createEmployeePayment } from "@/lib/hr/repository";

/** Cria um `cash_movement` mínimo real, só para satisfazer a FK real de `employee_payments`/`employee_advances` — nunca um valor fictício sem lastro. */
async function createTestCashMovement(amount: number): Promise<string> {
  const db = getDb()!;
  const [row] = await db
    .insert(cashMovements)
    .values({ date: "2026-09-18", type: "saida", amount: String(amount), description: "cash_movement de teste (Missão 86, repository.postgres.test.ts)" })
    .returning();
  return row.id;
}

/**
 * Missão 86 — só roda contra Postgres real de teste (`TEST_DATABASE_URL`, nunca produção — mesma
 * garantia de `src/db/client.ts`, mesmo padrão de `stone/persistence/postgres-repository.*.test.ts`).
 *
 * Bug real encontrado ao vivo nesta missão: rodar o script de cadastro do DP uma segunda vez
 * (retry manual) criou um `employee_payment`/`employee_advance` DUPLICADO para o mesmo
 * `cash_movement_id` — a função não checava idempotência antes de inserir. Corrigido em
 * `repository.ts` (checa por `cashMovementId` existente antes de criar). Este teste prova a
 * correção contra constraints/índices reais, não só a simulação.
 */
const hasRealDb = !!process.env.TEST_DATABASE_URL;
const createdPaymentIds: string[] = [];
const createdAdvanceIds: string[] = [];
const createdCashMovementIds: string[] = [];

afterAll(async () => {
  if (!hasRealDb) return;
  const db = getDb();
  if (!db) return;
  if (createdAdvanceIds.length > 0) await db.delete(employeeAdvances).where(inArray(employeeAdvances.id, createdAdvanceIds));
  if (createdPaymentIds.length > 0) await db.delete(employeePayments).where(inArray(employeePayments.id, createdPaymentIds));
  if (createdCashMovementIds.length > 0) await db.delete(cashMovements).where(inArray(cashMovements.id, createdCashMovementIds));
});

describe.skipIf(!hasRealDb)("createEmployeePayment / createEmployeeAdvance — idempotência real (Missão 86)", () => {
  it("9) chamar createEmployeePayment duas vezes com o mesmo cashMovementId NÃO cria um segundo registro", async () => {
    const cashMovementId = await createTestCashMovement(80);
    createdCashMovementIds.push(cashMovementId);
    const input = { category: "diaria_freelancer" as const, amount: 80, date: "2026-09-18", description: "teste idempotência", cashMovementId };

    const first = await createEmployeePayment(input);
    const second = await createEmployeePayment(input);
    createdPaymentIds.push(first.id);

    expect(second.id).toBe(first.id);

    const db = getDb();
    const rows = await db!.select().from(employeePayments).where(inArray(employeePayments.cashMovementId, [cashMovementId]));
    expect(rows).toHaveLength(1);
  });

  it("10) chamar createEmployeeAdvance duas vezes com o mesmo cashMovementId NÃO cria um segundo adiantamento", async () => {
    const cashMovementId = await createTestCashMovement(100);
    createdCashMovementIds.push(cashMovementId);
    const input = { subjectType: "contractor" as const, subjectId: randomUUID(), amount: 100, date: "2026-09-19", cashMovementId };

    const first = await createEmployeeAdvance(input);
    const second = await createEmployeeAdvance(input);
    createdAdvanceIds.push(first.id);

    expect(second.id).toBe(first.id);

    const db = getDb();
    const rows = await db!.select().from(employeeAdvances).where(inArray(employeeAdvances.cashMovementId, [cashMovementId]));
    expect(rows).toHaveLength(1);
  });
});
