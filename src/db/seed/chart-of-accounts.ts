import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { costCenters, financialCategories } from "@/db/schema";

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
];

const costCenterNames = ["Estacionamento", "Lavação", "Administrativo", "Marketing", "Estrutura", "Tecnologia"];

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
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de plano de contas:", error instanceof Error ? error.message : error);
  process.exit(1);
});
