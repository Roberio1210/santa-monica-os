import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { inventoryItems, processStepProductSuggestions } from "@/db/schema";

/**
 * Sugestões de mapeamento etapa → produto candidato (SPRINT ESTOQUE INTELIGENTE 2.0, Fase B,
 * seção 7) — nunca geram consumo automático, só uma referência inicial pendente de confirmação
 * humana ao criar a receita de fato. Referenciam produtos já cadastrados (Fase A); nenhum
 * produto novo é criado aqui. O produto "pretinho" (pneus) não tem item real cadastrado —
 * fica como pendência conhecida, sem mapeamento inventado.
 *
 * Idempotente via external_id único (npm run db:seed:recipe-engine-mappings).
 */
interface SeedMapping {
  externalId: string;
  processStep: (typeof processStepProductSuggestions.$inferInsert)["processStep"];
  itemExternalId: string;
  notes: string | null;
}

const SEED_MAPPINGS: SeedMapping[] = [
  // Pré-lavagem
  { externalId: "pre_lavagem:3x1-limpador-multiuso-geral-quimica", processStep: "pre_lavagem", itemExternalId: "3x1-limpador-multiuso-geral-quimica", notes: null },
  { externalId: "pre_lavagem:nograx-desengraxante-farben", processStep: "pre_lavagem", itemExternalId: "nograx-desengraxante-farben", notes: null },
  { externalId: "pre_lavagem:apc-100", processStep: "pre_lavagem", itemExternalId: "apc-100", notes: null },

  // Shampoo
  { externalId: "shampoo:v-floc-shampoo-vonixx", processStep: "shampoo", itemExternalId: "v-floc-shampoo-vonixx", notes: null },
  { externalId: "shampoo:shamp-lava-auto-neutro-farben", processStep: "shampoo", itemExternalId: "shamp-lava-auto-neutro-farben", notes: null },

  // Rodas
  { externalId: "rodas:alumax-limpador-de-aluminio-vintex", processStep: "rodas", itemExternalId: "alumax-limpador-de-aluminio-vintex", notes: null },
  { externalId: "rodas:izer-limpador-ferroso-vonixx", processStep: "rodas", itemExternalId: "izer-limpador-ferroso-vonixx", notes: null },

  // Caixa de rodas
  {
    externalId: "caixas_de_rodas:eco-finish-acabamento-brilho-caixa-rodas-nobrecar",
    processStep: "caixas_de_rodas",
    itemExternalId: "eco-finish-acabamento-brilho-caixa-rodas-nobrecar",
    notes: "Somente como acabamento — produto de limpeza da caixa de rodas permanece configurável.",
  },

  // Interior — limpeza geral
  { externalId: "limpeza_interna:apc-limpador-multifuncional-farben", processStep: "limpeza_interna", itemExternalId: "apc-limpador-multifuncional-farben", notes: null },
  { externalId: "limpeza_interna:limpa-estofado-vintex", processStep: "limpeza_interna", itemExternalId: "limpa-estofado-vintex", notes: null },
  { externalId: "limpeza_interna:bactran-vonixx", processStep: "limpeza_interna", itemExternalId: "bactran-vonixx", notes: null },
  { externalId: "limpeza_interna:sanitizante-fresh-vintex", processStep: "limpeza_interna", itemExternalId: "sanitizante-fresh-vintex", notes: null },

  // Couro
  { externalId: "couro:cleather-limpa-couro-farben", processStep: "couro", itemExternalId: "cleather-limpa-couro-farben", notes: null },
  { externalId: "couro:hidrat-hidratante-couro-farben", processStep: "couro", itemExternalId: "hidrat-hidratante-couro-farben", notes: null },

  // Plásticos internos
  { externalId: "plasticos_internos:plastic-cleaner-interior-sonax", processStep: "plasticos_internos", itemExternalId: "plastic-cleaner-interior-sonax", notes: null },
  { externalId: "plasticos_internos:plastico-revitalizador-plasticos-farben", processStep: "plasticos_internos", itemExternalId: "plastico-revitalizador-plasticos-farben", notes: null },

  // Vidros
  { externalId: "vidros:glass-limpa-vidros-farben", processStep: "vidros", itemExternalId: "glass-limpa-vidros-farben", notes: null },
  { externalId: "vidros:glass-vision-limpa-vidros-expert", processStep: "vidros", itemExternalId: "glass-vision-limpa-vidros-expert", notes: null },
  { externalId: "vidros:limpa-vidros-mills", processStep: "vidros", itemExternalId: "limpa-vidros-mills", notes: null },

  // Cera
  { externalId: "cera:top-cera-cera-liquida-cadillac", processStep: "cera", itemExternalId: "top-cera-cera-liquida-cadillac", notes: null },
  { externalId: "cera:blend-cera-carnauba-spray-vonixx", processStep: "cera", itemExternalId: "blend-cera-carnauba-spray-vonixx", notes: null },
  { externalId: "cera:blend-black-edition-vonixx", processStep: "cera", itemExternalId: "blend-black-edition-vonixx", notes: null },

  // Proteção externa
  { externalId: "protecao_externa:sio2-pro-vonixx", processStep: "protecao_externa", itemExternalId: "sio2-pro-vonixx", notes: null },
  { externalId: "protecao_externa:hidrofast-nano-selante-jaca", processStep: "protecao_externa", itemExternalId: "hidrofast-nano-selante-jaca", notes: null },

  // Pneus
  {
    externalId: "pneus:delet-limpador-pneus-borrachas-vonixx",
    processStep: "pneus",
    itemExternalId: "delet-limpador-pneus-borrachas-vonixx",
    notes: "Apenas como limpeza. Produto usado como \"pretinho\" ainda não identificado — sem item cadastrado, pendência conhecida.",
  },

  // Motor
  {
    externalId: "motor:black-boost-verniz-motor-dub",
    processStep: "motor",
    itemExternalId: "black-boost-verniz-motor-dub",
    notes: "Apenas como acabamento/verniz de motor — nunca atribuído automaticamente como desengraxante.",
  },
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
  let skippedMissingItem = 0;

  for (const mapping of SEED_MAPPINGS) {
    const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.externalId, mapping.itemExternalId)).limit(1);
    if (!item) {
      console.error(`Item não encontrado, mapeamento ignorado (nunca inventar): ${mapping.itemExternalId}`);
      skippedMissingItem += 1;
      continue;
    }

    const result = await db
      .insert(processStepProductSuggestions)
      .values({
        processStep: mapping.processStep,
        itemId: item.id,
        confirmed: false,
        source: "seed:recipe-engine-mappings",
        externalId: mapping.externalId,
        notes: mapping.notes,
      })
      .onConflictDoNothing({ target: processStepProductSuggestions.externalId })
      .returning({ id: processStepProductSuggestions.id });

    if (result.length > 0) inserted += 1;
  }

  console.log(
    `Concluído: ${inserted} sugestão(ões) nova(s), ${SEED_MAPPINGS.length - inserted - skippedMissingItem} já existia(m), ${skippedMissingItem} ignorada(s) por item ausente.`,
  );
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de mapeamentos:", error instanceof Error ? error.message : error);
  process.exit(1);
});
