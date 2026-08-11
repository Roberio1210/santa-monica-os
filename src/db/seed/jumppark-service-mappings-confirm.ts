import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNotNull } from "drizzle-orm";
import postgres from "postgres";
import { jumpParkServiceOrderItems, jumpparkServiceMappings, services } from "@/db/schema";
import { slugifyServiceName } from "@/lib/jumppark-orders/plate";

/**
 * Missão de Automação JumpPark → Consumo, seção 7 — audita os textos reais de
 * `jumppark_service_order_items` (2117 ordens reais sincronizadas, todas com `exit_time`
 * preenchido), registra qualquer texto ainda não visto em `jumppark_service_mappings` (mesmo
 * mecanismo idempotente de `registerSeenServiceNames`, replicado aqui porque esse módulo importa
 * "server-only" e não roda fora do runtime do Next.js), e confirma deterministicamente só as
 * combinações inequívocas — nunca por preço, nunca por aproximação vaga. Tudo o que não está
 * nesta lista permanece "nao_mapeado", pendente de revisão manual em /estoque/mapeamentos-servicos.
 *
 * Auditoria real (11/08/2026): 41 mapeamentos já existiam, 0 confirmados.
 */

interface ConfirmedMapping {
  /** Texto exato como aparece em jumppark_service_order_items.description. */
  jumpparkServiceName: string;
  canonicalServiceExternalId: string;
  reason: string;
}

const CONFIRMED: ConfirmedMapping[] = [
  // Bronze — todas as variantes reais de categoria de veículo observadas + a variante sem sufixo.
  { jumpparkServiceName: "Lavação Bronze - Caminhonete", canonicalServiceExternalId: "bronze", reason: "Texto inequívoco: pacote Bronze." },
  { jumpparkServiceName: "Lavação Bronze - Hatch", canonicalServiceExternalId: "bronze", reason: "Texto inequívoco: pacote Bronze." },
  { jumpparkServiceName: "Lavação Bronze - SUV", canonicalServiceExternalId: "bronze", reason: "Texto inequívoco: pacote Bronze." },
  { jumpparkServiceName: "Lavação Bronze - SUV/SEDAN", canonicalServiceExternalId: "bronze", reason: "Texto inequívoco: pacote Bronze." },
  // Silver
  { jumpparkServiceName: "Lavação Silver - Caminhonete", canonicalServiceExternalId: "silver", reason: "Texto inequívoco: pacote Silver." },
  { jumpparkServiceName: "Lavação Silver - Hatch", canonicalServiceExternalId: "silver", reason: "Texto inequívoco: pacote Silver." },
  { jumpparkServiceName: "Lavação Silver - SUV", canonicalServiceExternalId: "silver", reason: "Texto inequívoco: pacote Silver." },
  { jumpparkServiceName: "Lavação Silver - SUV/SEDAN", canonicalServiceExternalId: "silver", reason: "Texto inequívoco: pacote Silver." },
  // Gold — inclui a variante "Lavagem Gold" (sem categoria), texto real distinto observado nos dados.
  { jumpparkServiceName: "Lavação Gold - Caminhonete", canonicalServiceExternalId: "gold", reason: "Texto inequívoco: pacote Gold." },
  { jumpparkServiceName: "Lavação Gold - Hatch", canonicalServiceExternalId: "gold", reason: "Texto inequívoco: pacote Gold." },
  { jumpparkServiceName: "Lavação Gold - SUV", canonicalServiceExternalId: "gold", reason: "Texto inequívoco: pacote Gold." },
  { jumpparkServiceName: "Lavação Gold - SUV/SEDAN", canonicalServiceExternalId: "gold", reason: "Texto inequívoco: pacote Gold." },
  { jumpparkServiceName: "Lavagem Gold", canonicalServiceExternalId: "gold", reason: "Variante textual do mesmo pacote Gold (mesma palavra, sem sufixo de categoria)." },
  // Polimento
  { jumpparkServiceName: "Polimento - Comercial", canonicalServiceExternalId: "polimento-comercial", reason: "Texto inequívoco: Polimento Comercial." },
  { jumpparkServiceName: "Polimento - Técnico", canonicalServiceExternalId: "polimento-tecnico", reason: "Texto inequívoco: Polimento Técnico." },
  { jumpparkServiceName: "Polimento - Técnico ", canonicalServiceExternalId: "polimento-tecnico", reason: "Mesma etapa, variante com espaço final observada nos dados reais." },
  // Motor
  { jumpparkServiceName: "Motor", canonicalServiceExternalId: "lavagem-motor", reason: "Forma abreviada do mesmo serviço do catálogo (Lavagem de Motor) — sem outro candidato no catálogo real." },
  // Vitrificação — durações diferentes do mesmo serviço.
  { jumpparkServiceName: "Vitrificação - 1 ano", canonicalServiceExternalId: "vitrificacao", reason: "Mesma etapa de Vitrificação, variante de duração." },
  { jumpparkServiceName: "Vitrificação - 3 anos", canonicalServiceExternalId: "vitrificacao", reason: "Mesma etapa de Vitrificação, variante de duração." },
  // Higienização — só a variante "Completo" (escopo total, mais próximo do canônico "Higienização Interna").
  // "Higienização - Cada banco" fica DE FORA de propósito: escopo parcial, mapear junto inflaria consumo.
  { jumpparkServiceName: "Higienização - Completo", canonicalServiceExternalId: "higienizacao-interna", reason: "Escopo completo — corresponde ao serviço canônico Higienização Interna. 'Cada banco' (escopo parcial) fica pendente de propósito." },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const distinctDescriptions = await db
    .selectDistinct({ description: jumpParkServiceOrderItems.description })
    .from(jumpParkServiceOrderItems)
    .where(isNotNull(jumpParkServiceOrderItems.description));

  let registered = 0;
  let alreadyRegistered = 0;
  for (const row of distinctDescriptions) {
    const name = row.description?.trim();
    if (!name) continue;
    const externalId = slugifyServiceName(name);
    if (!externalId) continue;

    const result = await db
      .insert(jumpparkServiceMappings)
      .values({ jumpparkServiceName: name, status: "nao_mapeado", source: "seed:jumppark-service-mappings-confirm", externalId })
      .onConflictDoNothing({ target: jumpparkServiceMappings.externalId })
      .returning({ id: jumpparkServiceMappings.id });

    if (result.length > 0) registered += 1;
    else alreadyRegistered += 1;
  }
  console.log(`Registro de textos reais: ${registered} novo(s), ${alreadyRegistered} já existia(m) (total real observado: ${distinctDescriptions.length}).`);

  let confirmed = 0;
  let alreadyConfirmed = 0;
  let notFoundInRealData = 0;
  let canonicalServiceMissing = 0;

  for (const mapping of CONFIRMED) {
    const [service] = await db.select({ id: services.id }).from(services).where(eq(services.externalId, mapping.canonicalServiceExternalId)).limit(1);
    if (!service) {
      console.error(`Serviço canônico não encontrado, mapeamento ignorado (nunca inventar): ${mapping.canonicalServiceExternalId}`);
      canonicalServiceMissing += 1;
      continue;
    }

    const [row] = await db.select().from(jumpparkServiceMappings).where(eq(jumpparkServiceMappings.jumpparkServiceName, mapping.jumpparkServiceName)).limit(1);
    if (!row) {
      console.error(`Texto não observado nos dados reais, mapeamento ignorado (nunca inventar): "${mapping.jumpparkServiceName}"`);
      notFoundInRealData += 1;
      continue;
    }
    if (row.status === "mapeado" && row.canonicalServiceId === service.id) {
      alreadyConfirmed += 1;
      continue;
    }

    await db
      .update(jumpparkServiceMappings)
      .set({ canonicalServiceId: service.id, status: "mapeado", lastValidatedAt: new Date().toISOString().slice(0, 10), notes: mapping.reason, updatedAt: new Date() })
      .where(eq(jumpparkServiceMappings.id, row.id));
    confirmed += 1;
  }

  console.log(
    `Confirmação determinística: ${confirmed} novo(s), ${alreadyConfirmed} já confirmado(s), ${notFoundInRealData} texto(s) não observado(s) nos dados reais, ${canonicalServiceMissing} serviço(s) canônico(s) ausente(s).`,
  );

  const totalMapped = await db.select({ id: jumpparkServiceMappings.id }).from(jumpparkServiceMappings).where(eq(jumpparkServiceMappings.status, "mapeado"));
  console.log(`Estado final: ${totalMapped.length} mapeamento(s) confirmado(s) no total.`);

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de mapeamentos JumpPark:", error instanceof Error ? error.message : error);
  process.exit(1);
});
