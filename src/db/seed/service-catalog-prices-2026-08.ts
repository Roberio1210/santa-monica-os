import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, isNull, and } from "drizzle-orm";
import { services, servicePriceVariants } from "@/db/schema";

/**
 * Missão Z3 (base de conhecimento do Zézinho) — preços comerciais confirmados pelo gestor
 * diretamente na missão (2026-08-22/23). Nunca sobrescreve um `defaultPrice` já preenchido
 * (ex.: "lavacao-parceria-iesa" continua com o preço de parceria, intocado). Idempotente: preços
 * de serviço simples usam UPDATE...WHERE default_price IS NULL; variantes usam
 * ON CONFLICT DO NOTHING por external_id estável.
 *
 * Serviços novos (não existiam no catálogo antes desta missão): revitalizacao-plasticos,
 * tratamento-ozonio, estacionamento — nenhum dado além do confirmado pelo gestor.
 *
 * Composição interna (etapas/produto/diluição/garantia) NUNCA é preenchida aqui — segue
 * "informação pendente do gestor" onde não há fonte real (ver relatório da missão).
 */

const NEW_SERVICES: { externalId: string; name: string; category: string; defaultPrice?: string }[] = [
  { externalId: "revitalizacao-plasticos", name: "Revitalização de Plásticos", category: "Plásticos", defaultPrice: "60.00" },
  { externalId: "tratamento-ozonio", name: "Tratamento com Ozônio", category: "Higienização", defaultPrice: "150.00" },
  { externalId: "estacionamento", name: "Estacionamento", category: "Estacionamento" },
];

/** Serviços com preço único (sem variação por porte/tier) — só preenche se `defaultPrice` ainda for null. */
const SINGLE_PRICE_UPDATES: { externalId: string; price: string }[] = [
  { externalId: "lavagem-motor", price: "150.00" },
  { externalId: "revitalizacao-farois", price: "300.00" },
  { externalId: "cristalizacao-vidros", price: "100.00" },
  { externalId: "polimento-comercial", price: "500.00" },
  { externalId: "polimento-tecnico", price: "850.00" },
  { externalId: "hidratacao-couro", price: "150.00" },
];

interface VariantSeed {
  serviceExternalId: string;
  vehicleCategory: "hatch" | "sedan" | "suv" | "caminhonete" | null;
  variantLabel: string | null;
  price: string;
  displayOrder: number;
}

const VARIANTS: VariantSeed[] = [
  // Bronze
  { serviceExternalId: "bronze", vehicleCategory: "hatch", variantLabel: null, price: "100.00", displayOrder: 1 },
  { serviceExternalId: "bronze", vehicleCategory: "sedan", variantLabel: null, price: "120.00", displayOrder: 2 },
  { serviceExternalId: "bronze", vehicleCategory: "suv", variantLabel: null, price: "140.00", displayOrder: 3 },
  { serviceExternalId: "bronze", vehicleCategory: "caminhonete", variantLabel: null, price: "200.00", displayOrder: 4 },
  // Silver
  { serviceExternalId: "silver", vehicleCategory: "hatch", variantLabel: null, price: "140.00", displayOrder: 1 },
  { serviceExternalId: "silver", vehicleCategory: "sedan", variantLabel: null, price: "160.00", displayOrder: 2 },
  { serviceExternalId: "silver", vehicleCategory: "suv", variantLabel: null, price: "180.00", displayOrder: 3 },
  { serviceExternalId: "silver", vehicleCategory: "caminhonete", variantLabel: null, price: "260.00", displayOrder: 4 },
  // Gold
  { serviceExternalId: "gold", vehicleCategory: "hatch", variantLabel: null, price: "200.00", displayOrder: 1 },
  { serviceExternalId: "gold", vehicleCategory: "sedan", variantLabel: null, price: "220.00", displayOrder: 2 },
  { serviceExternalId: "gold", vehicleCategory: "suv", variantLabel: null, price: "240.00", displayOrder: 3 },
  { serviceExternalId: "gold", vehicleCategory: "caminhonete", variantLabel: null, price: "320.00", displayOrder: 4 },
  // Lavação Interna
  { serviceExternalId: "lavagem-interna", vehicleCategory: "hatch", variantLabel: null, price: "70.00", displayOrder: 1 },
  { serviceExternalId: "lavagem-interna", vehicleCategory: "sedan", variantLabel: null, price: "70.00", displayOrder: 2 },
  { serviceExternalId: "lavagem-interna", vehicleCategory: "suv", variantLabel: null, price: "70.00", displayOrder: 3 },
  { serviceExternalId: "lavagem-interna", vehicleCategory: "caminhonete", variantLabel: null, price: "100.00", displayOrder: 4 },
  // Lavação Externa — Hatch/Sedan/SUV
  { serviceExternalId: "lavagem-externa", vehicleCategory: "hatch", variantLabel: "Sem cera", price: "60.00", displayOrder: 1 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "hatch", variantLabel: "Cera líquida", price: "80.00", displayOrder: 2 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "hatch", variantLabel: "Cera em pasta", price: "100.00", displayOrder: 3 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "sedan", variantLabel: "Sem cera", price: "60.00", displayOrder: 4 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "sedan", variantLabel: "Cera líquida", price: "80.00", displayOrder: 5 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "sedan", variantLabel: "Cera em pasta", price: "100.00", displayOrder: 6 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "suv", variantLabel: "Sem cera", price: "60.00", displayOrder: 7 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "suv", variantLabel: "Cera líquida", price: "80.00", displayOrder: 8 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "suv", variantLabel: "Cera em pasta", price: "100.00", displayOrder: 9 },
  // Lavação Externa — Caminhonete
  { serviceExternalId: "lavagem-externa", vehicleCategory: "caminhonete", variantLabel: "Sem cera", price: "80.00", displayOrder: 10 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "caminhonete", variantLabel: "Cera líquida", price: "100.00", displayOrder: 11 },
  { serviceExternalId: "lavagem-externa", vehicleCategory: "caminhonete", variantLabel: "Cera em pasta", price: "120.00", displayOrder: 12 },
  // Higienização Interna (completa vs. por banco)
  { serviceExternalId: "higienizacao-interna", vehicleCategory: null, variantLabel: "Completa", price: "500.00", displayOrder: 1 },
  { serviceExternalId: "higienizacao-interna", vehicleCategory: null, variantLabel: "Por banco (individual)", price: "200.00", displayOrder: 2 },
  // Remoção/Tratamento de Chuva Ácida
  { serviceExternalId: "chuva-acida", vehicleCategory: null, variantLabel: "Para-brisa", price: "60.00", displayOrder: 1 },
  { serviceExternalId: "chuva-acida", vehicleCategory: null, variantLabel: "Carro completo", price: "100.00", displayOrder: 2 },
  // Vitrificação
  { serviceExternalId: "vitrificacao", vehicleCategory: null, variantLabel: "1 ano", price: "1300.00", displayOrder: 1 },
  { serviceExternalId: "vitrificacao", vehicleCategory: null, variantLabel: "3 anos", price: "2300.00", displayOrder: 2 },
  // Lavação de Chassi
  { serviceExternalId: "lavagem-chassi", vehicleCategory: null, variantLabel: "Hatch/SUV", price: "350.00", displayOrder: 1 },
  { serviceExternalId: "lavagem-chassi", vehicleCategory: null, variantLabel: "Caminhonete/Caminhão", price: "450.00", displayOrder: 2 },
  // Estacionamento
  { serviceExternalId: "estacionamento", vehicleCategory: null, variantLabel: "08h-18h Fração", price: "6.00", displayOrder: 1 },
  { serviceExternalId: "estacionamento", vehicleCategory: null, variantLabel: "08h-18h Hora", price: "10.00", displayOrder: 2 },
  { serviceExternalId: "estacionamento", vehicleCategory: null, variantLabel: "18h-00h Fração", price: "10.00", displayOrder: 3 },
  { serviceExternalId: "estacionamento", vehicleCategory: null, variantLabel: "18h-00h Hora", price: "15.00", displayOrder: 4 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  let newServicesInserted = 0;
  for (const svc of NEW_SERVICES) {
    const result = await db
      .insert(services)
      .values({ name: svc.name, category: svc.category, defaultPrice: svc.defaultPrice ?? null, source: "seed:service-catalog-prices-2026-08", externalId: svc.externalId, notes: null })
      .onConflictDoNothing({ target: services.externalId })
      .returning({ id: services.id });
    if (result.length > 0) newServicesInserted += 1;
  }

  let pricesBackfilled = 0;
  for (const update of SINGLE_PRICE_UPDATES) {
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.externalId, update.externalId)).limit(1);
    if (!svc) {
      console.warn(`Serviço "${update.externalId}" não encontrado — pulando.`);
      continue;
    }
    const result = await db
      .update(services)
      .set({ defaultPrice: update.price, source: "seed:service-catalog-prices-2026-08" })
      .where(and(eq(services.id, svc.id), isNull(services.defaultPrice)))
      .returning({ id: services.id });
    if (result.length > 0) pricesBackfilled += 1;
  }

  let variantsInserted = 0;
  for (const v of VARIANTS) {
    const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.externalId, v.serviceExternalId)).limit(1);
    if (!svc) {
      console.warn(`Serviço "${v.serviceExternalId}" não encontrado para variante — pulando.`);
      continue;
    }
    const externalId = `${v.serviceExternalId}:${v.vehicleCategory ?? "-"}:${v.variantLabel ?? "-"}`;
    const result = await db
      .insert(servicePriceVariants)
      .values({ serviceId: svc.id, vehicleCategory: v.vehicleCategory, variantLabel: v.variantLabel, price: v.price, displayOrder: v.displayOrder, source: "seed:service-catalog-prices-2026-08", externalId })
      .onConflictDoNothing({ target: servicePriceVariants.externalId })
      .returning({ id: servicePriceVariants.id });
    if (result.length > 0) variantsInserted += 1;
  }

  console.log(`Concluído: ${newServicesInserted} serviço(s) novo(s), ${pricesBackfilled} preço(s) único(s) preenchido(s), ${variantsInserted} variante(s) de preço inserida(s) (de ${VARIANTS.length} definidas).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de preços do catálogo:", error instanceof Error ? error.message : error);
  process.exit(1);
});
