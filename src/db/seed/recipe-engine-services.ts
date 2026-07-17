import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { services } from "@/db/schema";

/**
 * Catálogo inicial de serviços do motor de receitas (SPRINT ESTOQUE INTELIGENTE 2.0, Fase B,
 * seção 6) — só estrutura, nenhum preço inventado (defaultPrice fica null). Idempotente via
 * external_id único (npm run db:seed:recipe-engine-services).
 */
interface SeedService {
  externalId: string;
  name: string;
  category: string;
}

const SEED_SERVICES: SeedService[] = [
  { externalId: "bronze", name: "Bronze", category: "Pacote" },
  { externalId: "silver", name: "Silver", category: "Pacote" },
  { externalId: "gold", name: "Gold", category: "Pacote" },
  { externalId: "lavagem-externa", name: "Lavagem Externa", category: "Lavagem" },
  { externalId: "lavagem-interna", name: "Lavagem Interna", category: "Lavagem" },
  { externalId: "higienizacao-interna", name: "Higienização Interna", category: "Higienização" },
  { externalId: "polimento-comercial", name: "Polimento Comercial", category: "Polimento" },
  { externalId: "polimento-tecnico", name: "Polimento Técnico", category: "Polimento" },
  { externalId: "vitrificacao", name: "Vitrificação", category: "Vitrificação" },
  { externalId: "lavagem-motor", name: "Lavagem de Motor", category: "Motor e chassi" },
  { externalId: "lavagem-chassi", name: "Lavagem de Chassi", category: "Motor e chassi" },
  { externalId: "revitalizacao-farois", name: "Revitalização de Faróis", category: "Faróis" },
  { externalId: "cristalizacao-vidros", name: "Cristalização de Vidros", category: "Vidros" },
  { externalId: "chuva-acida", name: "Remoção de Chuva Ácida", category: "Polimento" },
  /** Fase D, seção 1 — alvo explícito de mapeamento para serviços JumpPark reais que não se encaixam em nenhum canônico específico. */
  { externalId: "outro", name: "Outro", category: "Outros" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  let inserted = 0;
  for (const svc of SEED_SERVICES) {
    const result = await db
      .insert(services)
      .values({
        name: svc.name,
        category: svc.category,
        defaultPrice: null,
        source: "seed:recipe-engine-services",
        externalId: svc.externalId,
        notes: null,
      })
      .onConflictDoNothing({ target: services.externalId })
      .returning({ id: services.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(`Concluído: ${inserted} serviço(s) novo(s), ${SEED_SERVICES.length - inserted} já existia(m).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de serviços:", error instanceof Error ? error.message : error);
  process.exit(1);
});
