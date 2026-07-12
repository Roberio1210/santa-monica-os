import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { classificationRules, costCenters, partners, suppliers } from "@/db/schema";

type Db = ReturnType<typeof drizzle>;

async function getSupplierId(db: Db, externalIdValue: string): Promise<string | null> {
  const rows = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.externalId, externalIdValue)).limit(1);
  return rows[0]?.id ?? null;
}

async function getPartnerId(db: Db, externalIdValue: string): Promise<string | null> {
  const rows = await db.select({ id: partners.id }).from(partners).where(eq(partners.externalId, externalIdValue)).limit(1);
  return rows[0]?.id ?? null;
}

async function getCostCenterId(db: Db, externalIdValue: string): Promise<string | null> {
  const rows = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.externalId, externalIdValue)).limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Regras automáticas iniciais de classificação gerencial (Parte 7 do módulo Contabilidade
 * Gerencial, 12/07/2026) — npm run db:seed:classification-rules. Idempotente via `external_id`
 * único (ON CONFLICT DO NOTHING). Reaproveita fornecedores/parceiros/centros de custo já
 * existentes — nenhum dado novo inventado, só a classificação declarada pelo proprietário.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar o seed de regras de classificação.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // Nome real do parceiro "Funerária" informado pelo proprietário nesta etapa — preenche uma
  // lacuna já sinalizada no seed original ("nome fantasia completo não informado"), não altera
  // uma classificação já correta. Idempotente: sempre grava o mesmo valor real.
  await db
    .update(partners)
    .set({ name: "Serviços Funerários Tamandaré", notes: "Nome fantasia completo informado pelo proprietário no módulo Contabilidade Gerencial (12/07/2026)." })
    .where(eq(partners.externalId, "funeraria"));

  const ccEstetica = await getCostCenterId(db, "cc-estetica-automotiva");
  const ccEstacionamento = await getCostCenterId(db, "cc-estacionamento");
  const ccAdministrativo = await getCostCenterId(db, "cc-administrativo");
  const ccTecnologia = await getCostCenterId(db, "cc-tecnologia");

  const partnerRules: { externalId: string; partnerExternalId: string; suggestedCostCenterId: string | null }[] = [
    { externalId: "regra-receita-iesa", partnerExternalId: "iesa-nissan", suggestedCostCenterId: ccEstetica },
    { externalId: "regra-receita-tamandare", partnerExternalId: "funeraria", suggestedCostCenterId: ccEstacionamento },
    { externalId: "regra-receita-wecharge", partnerExternalId: "wecharge", suggestedCostCenterId: ccEstacionamento },
    { externalId: "regra-receita-don-juan", partnerExternalId: "don-juan-fast-burger", suggestedCostCenterId: ccEstacionamento },
  ];

  for (const rule of partnerRules) {
    const partnerId = await getPartnerId(db, rule.partnerExternalId);
    if (!partnerId) continue;
    await db
      .insert(classificationRules)
      .values({
        matchType: "parceiro",
        partnerId,
        dreLine: "receita_bruta",
        nature: "receita_operacional",
        suggestedCostCenterId: rule.suggestedCostCenterId,
        includeInDre: true,
        reviewNeeded: false,
        enabled: true,
        source: "seed:regras-classificacao",
        externalId: rule.externalId,
        notes: null,
      })
      .onConflictDoNothing({ target: classificationRules.externalId });
  }

  const supplierRules: { externalId: string; supplierExternalId: string; suggestedCostCenterId: string | null; reviewNeeded?: boolean; notes?: string }[] = [
    { externalId: "regra-despesa-mota-imobiliaria", supplierExternalId: "fornecedor-mota-imobiliaria", suggestedCostCenterId: ccAdministrativo, notes: "Rateio entre Estética/Estacionamento/Administrativo ainda não definido pelo proprietário — fica 100% em Administrativo até então." },
    { externalId: "regra-despesa-celesc", supplierExternalId: "fornecedor-celesc", suggestedCostCenterId: ccAdministrativo },
    { externalId: "regra-despesa-casan", supplierExternalId: "fornecedor-casan", suggestedCostCenterId: ccAdministrativo },
    { externalId: "regra-despesa-jumppark", supplierExternalId: "fornecedor-jumppark", suggestedCostCenterId: ccTecnologia },
    { externalId: "regra-despesa-verisure", supplierExternalId: "fornecedor-verisure", suggestedCostCenterId: ccAdministrativo },
    { externalId: "regra-despesa-vivo-telefonia", supplierExternalId: "fornecedor-vivo-telefonia", suggestedCostCenterId: ccAdministrativo },
    { externalId: "regra-despesa-vivo-internet", supplierExternalId: "fornecedor-vivo-internet", suggestedCostCenterId: ccTecnologia },
    { externalId: "regra-despesa-stylus", supplierExternalId: "fornecedor-stylus-contabilidade", suggestedCostCenterId: ccAdministrativo },
    {
      externalId: "regra-despesa-verde-car",
      supplierExternalId: "fornecedor-verde-car",
      suggestedCostCenterId: ccAdministrativo,
      reviewNeeded: true,
      notes: "Compras/insumos/equipamentos — revisão necessária, pode ter naturezas diferentes conforme o lançamento.",
    },
    {
      externalId: "regra-despesa-auto-leds",
      supplierExternalId: "fornecedor-auto-leds",
      suggestedCostCenterId: ccAdministrativo,
      reviewNeeded: true,
      notes: "Compras/insumos/equipamentos — revisão necessária, pode ter naturezas diferentes conforme o lançamento.",
    },
    {
      externalId: "regra-despesa-mercado-livre",
      supplierExternalId: "fornecedor-mercado-livre",
      suggestedCostCenterId: ccAdministrativo,
      reviewNeeded: true,
      notes: "Compras/insumos/equipamentos — revisão necessária, pode ter naturezas diferentes conforme o lançamento.",
    },
  ];

  for (const rule of supplierRules) {
    const supplierId = await getSupplierId(db, rule.supplierExternalId);
    if (!supplierId) continue;
    await db
      .insert(classificationRules)
      .values({
        matchType: "fornecedor",
        supplierId,
        dreLine: "despesas_operacionais",
        nature: "despesa_operacional",
        suggestedCostCenterId: rule.suggestedCostCenterId,
        includeInDre: true,
        reviewNeeded: rule.reviewNeeded ?? false,
        enabled: true,
        source: "seed:regras-classificacao",
        externalId: rule.externalId,
        notes: rule.notes ?? null,
      })
      .onConflictDoNothing({ target: classificationRules.externalId });
  }

  console.log(`Regras de classificação aplicadas: ${partnerRules.length} de receita + ${supplierRules.length} de despesa (idempotente).`);
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de regras de classificação:", error instanceof Error ? error.message : error);
  process.exit(1);
});
