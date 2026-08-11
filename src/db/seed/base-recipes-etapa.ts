import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { inventoryItems, serviceConsumptionRules, services } from "@/db/schema";
import type { InventoryUnit } from "@/lib/inventory/types";
import type { VehicleCategory } from "@/lib/recipes/types";

/**
 * Missão de Automação JumpPark → Consumo, seções 3–5 — receitas-base por ETAPA, reaproveitadas
 * sem alteração entre Bronze/Silver/Gold: a mesma quantidade técnica de referência é cadastrada
 * para os três pacotes quando a etapa é a mesma (nunca infla consumo só porque o pacote é mais
 * caro — essa é a regra principal da missão). Cada linha nasce em status "rascunho" (0 amostras
 * reais) — nunca aprovável automaticamente (approveRecipe exige >= MIN_SAMPLES_FOR_PROVISIONAL
 * amostras reais, ver src/lib/recipes/service.ts), então esta seed nunca ativa consumo
 * automático sozinha.
 *
 * Só cadastra vínculo produto↔etapa↔pacote quando há evidência real (instrução explícita do
 * gestor nesta missão, ou ficha técnica oficial do fabricante confirmada por pesquisa). Produtos
 * cuja vinculação a um pacote específico é ambígua (Izer, limpa-vidros, "pretinho", polimento)
 * ficam de fora de propósito — reportados como pendência, nunca inventados.
 *
 * Idempotente via external_id único (mesmo padrão de recipe-engine-mappings.ts): rodar de novo
 * nunca duplica.
 */

const VEHICLE_CATEGORIES: VehicleCategory[] = ["hatch", "sedan", "suv", "caminhonete"];

interface BaseRecipeSeed {
  key: string;
  serviceExternalIds: string[];
  itemExternalId: string;
  processStep: string;
  unit: InventoryUnit;
  dilutionRatio: number | null;
  technicalReferenceQuantity: number | null;
  technicalReferenceSource: string | null;
  notes: string | null;
}

const SEEDS: BaseRecipeSeed[] = [
  {
    key: "3x1-pre-lavagem",
    serviceExternalIds: ["bronze", "silver", "gold"],
    itemExternalId: "3x1-limpador-multiuso-geral-quimica",
    processStep: "pre_lavagem",
    unit: "ml",
    dilutionRatio: 50,
    technicalReferenceQuantity: 50,
    technicalReferenceSource: "Instrução do gestor (Missão de Automação JumpPark → Consumo, 2026-08-11) — referência provisória de controle, pendente de calibração real.",
    notes:
      "Diluição por grau de sujeira (informada pelo gestor, não específica por pacote): uso geral/manutenção 1:50 (referência usada aqui); sujeira média 1:20; pesada localizada 1:10. Mesma etapa em Bronze/Silver/Gold — nunca consome mais só porque o pacote é mais caro.",
  },
  {
    key: "v-floc-shampoo",
    serviceExternalIds: ["bronze", "silver", "gold"],
    itemExternalId: "v-floc-shampoo-vonixx",
    processStep: "shampoo",
    unit: "ml",
    dilutionRatio: 400,
    technicalReferenceQuantity: 10,
    technicalReferenceSource: "vonixx.com.br/produto/v-floc — diluição oficial de fábrica 1:400 (10ml para 4L de água), confirmada por pesquisa nesta missão (11/08/2026). Consumo por lavagem: referência do gestor, pendente de calibração real.",
    notes: "Mesma etapa em Bronze/Silver/Gold — nunca consome mais só porque o pacote é mais caro. Ajustar apenas por porte do veículo (etapa sensível à área).",
  },
  {
    key: "delet-pneus",
    serviceExternalIds: ["bronze", "silver", "gold"],
    itemExternalId: "delet-limpador-pneus-borrachas-vonixx",
    processStep: "pneus",
    unit: "ml",
    dilutionRatio: null,
    technicalReferenceQuantity: null,
    technicalReferenceSource:
      "Modo de uso oficial (revenda autorizada Vonixx, vonixxmossoro.com.br, confirmado 11/08/2026): produto pronto uso (pulverizar puro sobre o pneu seco, agir 30–60s). Versão 5L admite diluição opcional de até 1:10 conforme sujeira, sem consumo por lavagem publicado pelo fabricante.",
    notes:
      "Quantidade técnica de referência NÃO configurada — nenhuma fonte confiável informa ml/lavagem (produto usado em spray, volume varia). Nunca inventado; pendente de calibração real (medir antes/depois do frasco em uso real). Produto de quantidade fixa (4 pneus) — nunca recebe multiplicador de porte.",
  },
  {
    key: "bactran-higienizacao",
    serviceExternalIds: ["higienizacao-interna"],
    itemExternalId: "bactran-vonixx",
    processStep: "higienizacao",
    unit: "ml",
    dilutionRatio: null,
    technicalReferenceQuantity: null,
    technicalReferenceSource: "vonixx.com.br/produto/bactran — diluição oficial por sujeira: pesada 1:10, média 1:30, leve 1:60 (confirmado por pesquisa nesta missão, 11/08/2026).",
    notes:
      "Vinculado somente ao serviço real de Higienização Interna — nunca a Bronze/Silver/Gold (rotina padrão de lavação não inclui bactericida). Quantidade técnica de referência não configurada — diluição varia por grau de sujeira e o fabricante não publica um consumo fixo por atendimento; pendente de calibração real.",
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

  let created = 0;
  let skippedExisting = 0;
  let skippedMissingItem = 0;
  let skippedMissingService = 0;

  for (const seed of SEEDS) {
    const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.externalId, seed.itemExternalId)).limit(1);
    if (!item) {
      console.error(`Produto não encontrado, receita ignorada (nunca inventar): ${seed.itemExternalId}`);
      skippedMissingItem += 1;
      continue;
    }

    for (const serviceExternalId of seed.serviceExternalIds) {
      const [service] = await db.select({ id: services.id }).from(services).where(eq(services.externalId, serviceExternalId)).limit(1);
      if (!service) {
        console.error(`Serviço não encontrado, receita ignorada (nunca inventar): ${serviceExternalId}`);
        skippedMissingService += 1;
        continue;
      }

      for (const category of VEHICLE_CATEGORIES) {
        const externalId = `base-recipe:${serviceExternalId}:${category}:${seed.processStep}:${seed.itemExternalId}`;

        // `service_consumption_rules.external_id` não tem constraint UNIQUE no banco (usa o
        // helper `externalId()` de common.ts, não o `text(...).unique()` usado em outras
        // tabelas) — idempotência aqui é feita checando antes de inserir, não via
        // onConflictDoNothing (que exigiria uma constraint que não existe).
        const [existingByExternalId] = await db.select({ id: serviceConsumptionRules.id }).from(serviceConsumptionRules).where(eq(serviceConsumptionRules.externalId, externalId)).limit(1);
        if (existingByExternalId) {
          skippedExisting += 1;
          continue;
        }

        await db.insert(serviceConsumptionRules).values({
          serviceId: service.id,
          itemId: item.id,
          vehicleCategory: category,
          processStep: seed.processStep as (typeof serviceConsumptionRules.$inferInsert)["processStep"],
          quantityPerService: null,
          unit: seed.unit,
          status: "rascunho",
          version: 1,
          isActiveVersion: true,
          dilutionRatio: seed.dilutionRatio !== null ? String(seed.dilutionRatio) : null,
          sampleCount: 0,
          technicalReferenceQuantity: seed.technicalReferenceQuantity !== null ? String(seed.technicalReferenceQuantity) : null,
          technicalReferenceSource: seed.technicalReferenceSource,
          source: "seed:base-recipes-etapa",
          externalId,
          notes: seed.notes,
        });
        created += 1;
      }
    }
  }

  console.log(`Concluído: ${created} receita(s) nova(s), ${skippedExisting} já existia(m), ${skippedMissingItem} produto(s) ausente(s), ${skippedMissingService} serviço(s) ausente(s).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de receitas-base por etapa:", error instanceof Error ? error.message : error);
  process.exit(1);
});
