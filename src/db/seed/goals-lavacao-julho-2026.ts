import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { goalBonusTiers, goals } from "@/db/schema";

/**
 * Meta real da Lavação — julho/2026 (Sprint 4.0 "Gerente Operacional", 20/07/2026, valores
 * informados diretamente pelo proprietário). npm run db:seed:goals-lavacao-julho-2026.
 * Idempotente via checagem manual (área + período) antes de inserir — a tabela `goals` tem um
 * índice único em (area, period_start), então uma segunda execução não duplica.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar o seed de metas.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const periodStart = "2026-07-01";
  const periodEnd = "2026-07-31";

  const existing = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.area, "lavacao"), eq(goals.periodStart, periodStart)))
    .limit(1);

  if (existing.length > 0) {
    console.log("Meta de lavação para julho/2026 já existe — nada a fazer.");
    await client.end();
    return;
  }

  const [goal] = await db
    .insert(goals)
    .values({
      area: "lavacao",
      label: "Meta mensal — Lavação (julho/2026)",
      targetAmount: "30000.00",
      periodStart,
      periodEnd,
      source: "seed:metas-2026-07",
      notes: "Valores informados diretamente pelo proprietário em 20/07/2026 (Sprint Gerente Operacional 4.0).",
    })
    .returning({ id: goals.id });

  await db.insert(goalBonusTiers).values([
    {
      goalId: goal.id,
      thresholdAmount: "30000.00",
      bonusAmount: "1000.00",
      description: "Prêmio de R$ 1.000,00 dividido entre três colaboradores ao atingir a meta.",
      sortOrder: 0,
    },
    {
      goalId: goal.id,
      thresholdAmount: "35000.00",
      bonusAmount: "500.00",
      description: "+ R$ 500,00 de prêmio ao atingir R$ 35.000,00.",
      sortOrder: 1,
    },
    {
      goalId: goal.id,
      thresholdAmount: "40000.00",
      bonusAmount: "1000.00",
      description: "+ R$ 1.000,00 de prêmio ao atingir R$ 40.000,00.",
      sortOrder: 2,
    },
  ]);

  console.log(`Meta de lavação (julho/2026) e 3 faixas de prêmio criadas — goal id ${goal.id}.`);
  await client.end();
}

main().catch((err) => {
  console.error("Falha ao rodar o seed de metas:", err);
  process.exit(1);
});
