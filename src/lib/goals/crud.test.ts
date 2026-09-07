import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { goals } from "@/db/schema/goals";
import { auditLogs } from "@/db/schema/system";
import { setConsolidatedMonthlyGoal } from "@/lib/goals/service";

/**
 * Missão 32 (Etapa D/E) — testes 9-13 do enunciado: criação, edição, valor inválido, proteção
 * contra duplicação (índice único da própria tabela), e preservação de meta histórica de outro
 * período. Só roda contra Postgres real (planning-tests) — `setConsolidatedMonthlyGoal` escreve
 * de verdade, não há fallback em memória para `goals`. Usa o ano 2099, exclusivo desta suíte,
 * para nunca colidir com nenhuma meta real (histórica ou futura) do banco de testes.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const TEST_YEAR = 2099;

async function cleanup() {
  const db = getDb()!;
  const idsToDelete = (await db.select({ id: goals.id, periodStart: goals.periodStart }).from(goals).where(eq(goals.area, "consolidado")))
    .filter((r) => r.periodStart.startsWith(String(TEST_YEAR)))
    .map((r) => r.id);
  if (idsToDelete.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, idsToDelete));
    await db.delete(goals).where(inArray(goals.id, idsToDelete));
  }
}

describe.skipIf(!hasRealDb)("setConsolidatedMonthlyGoal — Missão 32 (Postgres real, planning-tests)", () => {
  it(
    "9/10/12. cria, depois edita a mesma meta -> nunca duplica (índice único area+periodStart), audit_log para as duas ações",
    async () => {
      await cleanup();
      const db = getDb()!;

      const created = await setConsolidatedMonthlyGoal({ targetAmount: 10000, year: TEST_YEAR, month: 1 }, null);
      expect(created.status).toBe("created");
      if (created.status !== "created") throw new Error("esperado created");
      expect(created.goal.targetAmount).toBe(10000);
      expect(created.goal.area).toBe("consolidado");

      const updated = await setConsolidatedMonthlyGoal({ targetAmount: 22000, year: TEST_YEAR, month: 1 }, null);
      expect(updated.status).toBe("updated"); // 10. edição funciona
      if (updated.status !== "updated") throw new Error("esperado updated");
      expect(updated.goal.id).toBe(created.goal.id); // mesma linha, nunca uma segunda
      expect(updated.goal.targetAmount).toBe(22000);

      // 12. proteção contra duplicação — só 1 linha para (consolidado, 2099-01-01), sempre.
      const rows = await db.select().from(goals).where(and(eq(goals.area, "consolidado"), eq(goals.periodStart, `${TEST_YEAR}-01-01`)));
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].targetAmount)).toBe(22000);

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.goal.id));
      expect(logs.some((l) => l.action === "goal_consolidated_monthly_created")).toBe(true);
      expect(logs.some((l) => l.action === "goal_consolidated_monthly_updated")).toBe(true);
      const updateLog = logs.find((l) => l.action === "goal_consolidated_monthly_updated")!;
      expect((updateLog.beforeState as Record<string, unknown>).targetAmount).toBe("10000.00");
      expect((updateLog.afterState as Record<string, unknown>).targetAmount).toBe("22000.00");

      await cleanup();
    },
    30000,
  );

  it(
    "11. valores inválidos são recusados, nenhuma linha criada",
    async () => {
      await cleanup();
      const db = getDb()!;

      const zero = await setConsolidatedMonthlyGoal({ targetAmount: 0, year: TEST_YEAR, month: 2 }, null);
      expect(zero.status).toBe("invalid");

      const negative = await setConsolidatedMonthlyGoal({ targetAmount: -500, year: TEST_YEAR, month: 2 }, null);
      expect(negative.status).toBe("invalid");

      const notANumber = await setConsolidatedMonthlyGoal({ targetAmount: Number.NaN, year: TEST_YEAR, month: 2 }, null);
      expect(notANumber.status).toBe("invalid");

      const badMonth = await setConsolidatedMonthlyGoal({ targetAmount: 1000, year: TEST_YEAR, month: 13 }, null);
      expect(badMonth.status).toBe("invalid");

      const rows = await db.select().from(goals).where(and(eq(goals.area, "consolidado"), eq(goals.periodStart, `${TEST_YEAR}-02-01`)));
      expect(rows).toHaveLength(0);

      await cleanup();
    },
    30000,
  );

  it(
    "13. meta histórica de outro período (mês diferente) não é alterada ao salvar outro mês",
    async () => {
      await cleanup();
      const db = getDb()!;

      const march = await setConsolidatedMonthlyGoal({ targetAmount: 15000, year: TEST_YEAR, month: 3 }, null);
      expect(march.status).toBe("created");

      // Mexe em outro mês — janeiro não deve tocar em março.
      await setConsolidatedMonthlyGoal({ targetAmount: 30000, year: TEST_YEAR, month: 1 }, null);

      const marchRow = await db.select().from(goals).where(and(eq(goals.area, "consolidado"), eq(goals.periodStart, `${TEST_YEAR}-03-01`)));
      expect(marchRow).toHaveLength(1);
      expect(Number(marchRow[0].targetAmount)).toBe(15000); // intacto

      await cleanup();
    },
    30000,
  );
});
