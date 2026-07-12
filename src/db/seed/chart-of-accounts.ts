import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { accountsReceivable, cashMovements, costCenters, financialCategories } from "@/db/schema";

/**
 * Plano de contas inicial (Parte 6 da execução de 10/07/2026) — npm run db:seed:chart-of-accounts.
 * Apenas estrutura de categorias/centros de custo, exatamente como especificado pelo
 * proprietário. Nenhum valor, receita ou despesa é lançado aqui — isso é uma tabela de
 * classificação, não um lançamento financeiro. Idempotente via `external_id` único
 * (ON CONFLICT DO NOTHING).
 */
const revenueCategories = [
  "Estacionamento",
  "Lavação",
  "Serviços adicionais",
  "Polimento",
  "Vitrificação",
  "Higienização",
  "Faróis",
  "Contratos mensais",
  "Parcerias pós-pagas",
  "Outros serviços",
];

const expenseCategories = [
  "Produtos e insumos",
  "Equipamentos",
  "Manutenção",
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Marketing",
  "Salários CLT",
  "Prestadores PJ",
  "Tributos",
  "Contabilidade",
  "Sistemas e assinaturas",
  "Transporte e logística",
  "Outras despesas",
  // Adicionadas na execução do módulo Contas a Pagar (10/07/2026) — necessárias para
  // classificar com precisão as contas recorrentes reais informadas pelo proprietário.
  "Telefonia",
  "Empréstimos e financiamentos",
  "Reembolso a sócios/colaboradores",
  "Retirada de lucro/distribuição a sócios",
];

// "Estacionamento" e "Administrativo" já existiam (reaproveitados — ver docs/finance-module.md).
// "Estética Automotiva" é novo: mais específico que "Lavação" e cobre lavações, polimentos,
// vitrificações, higienizações, revitalizações e o Grupo IESA (cliente corporativo, não
// mensalista do estacionamento).
const costCenterNames = ["Estacionamento", "Lavação", "Administrativo", "Marketing", "Estrutura", "Tecnologia", "Estética Automotiva"];

function slugify(prefix: string, name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${prefix}-${normalized}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar o seed de plano de contas.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  await db
    .insert(financialCategories)
    .values(
      revenueCategories.map((name) => ({
        name,
        type: "receita" as const,
        source: "seed:plano-de-contas",
        externalId: slugify("receita", name),
      })),
    )
    .onConflictDoNothing({ target: financialCategories.externalId });

  await db
    .insert(financialCategories)
    .values(
      expenseCategories.map((name) => ({
        name,
        type: "despesa" as const,
        source: "seed:plano-de-contas",
        externalId: slugify("despesa", name),
      })),
    )
    .onConflictDoNothing({ target: financialCategories.externalId });

  await db
    .insert(costCenters)
    .values(
      costCenterNames.map((name) => ({
        name,
        source: "seed:plano-de-contas",
        externalId: slugify("cc", name),
      })),
    )
    .onConflictDoNothing({ target: costCenters.externalId });

  console.log(
    `Plano de contas aplicado: ${revenueCategories.length} categorias de receita, ${expenseCategories.length} de despesa, ${costCenterNames.length} centros de custo (idempotente).`,
  );

  // --- Movimento de caixa real da IESA (Parte 3 do módulo Financeiro) ---
  // Depende de contracts.ts (accounts_receivable) já ter rodado. Roda aqui, por último, porque
  // também depende das categorias/centros de custo acima já existirem. Se a conta a receber da
  // IESA ainda não existir (ex.: chart-of-accounts rodado isoladamente, fora da ordem
  // recomendada), o movimento de caixa é pulado com um aviso — nunca inventamos o vínculo.
  const [iesaReceivable] = await db
    .select({ id: accountsReceivable.id })
    .from(accountsReceivable)
    .where(eq(accountsReceivable.externalId, "iesa-recebivel-2026-06"))
    .limit(1);

  if (!iesaReceivable) {
    console.warn(
      "Aviso: conta a receber 'iesa-recebivel-2026-06' não encontrada — rode 'npm run db:seed:contracts' antes deste seed para registrar o movimento de caixa correspondente. Nenhum movimento foi inventado.",
    );
  } else {
    const [category] = await db
      .select({ id: financialCategories.id })
      .from(financialCategories)
      .where(eq(financialCategories.externalId, "receita-parcerias-pos-pagas"))
      .limit(1);
    const [costCenter] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(eq(costCenters.externalId, "cc-lavacao"))
      .limit(1);

    await db
      .insert(cashMovements)
      .values({
        date: "2026-07-10",
        type: "entrada",
        amount: "900.00",
        description: "Recebimento parceria IESA/Nissan (competência junho/2026)",
        accountsReceivableId: iesaReceivable.id,
        categoryId: category?.id ?? null,
        costCenterId: costCenter?.id ?? null,
        source: "seed:contratos-reais",
        externalId: "iesa-pagamento-2026-07-10",
        notes: "Entrada de caixa em 10/07/2026 — não deve ser somada como faturamento operacional gerado nesse dia.",
      })
      .onConflictDoNothing({ target: cashMovements.externalId });

    console.log("Movimento de caixa da IESA (R$ 900,00 em 10/07/2026) aplicado (idempotente).");
  }

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de plano de contas:", error instanceof Error ? error.message : error);
  process.exit(1);
});
