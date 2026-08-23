import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { services, servicePriceVariants, serviceOperationalSteps, serviceProducts, commercialPolicy, serviceComplimentaryOptions, inventoryItems } from "@/db/schema";

/**
 * Missão Z3.2 — consolidação do catálogo com as informações operacionais confirmadas pelo
 * gestor (2026-08-23). Idempotente (upsert por external_id / UPDATE condicional), nunca
 * sobrescreve um preço-base já diferente do confirmado sem estar listado aqui explicitamente, e
 * NUNCA toca em dado histórico (ordens, jumppark_service_order_items, cash_movements — nada
 * disso é lido nem escrito por este script).
 */

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  async function getServiceId(externalId: string): Promise<string | null> {
    const [row] = await db.select({ id: services.id }).from(services).where(eq(services.externalId, externalId)).limit(1);
    return row?.id ?? null;
  }

  async function getItemIdByName(name: string): Promise<string | null> {
    const [row] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.name, name)).limit(1);
    return row?.id ?? null;
  }

  const log: string[] = [];

  // ---------------------------------------------------------------------------
  // 1) Preços corrigidos/confirmados nesta missão (só os que MUDAM de verdade)
  // ---------------------------------------------------------------------------
  const PRICE_UPDATES: { externalId: string; price: string }[] = [
    { externalId: "polimento-comercial", price: "600.00" }, // era 500
    { externalId: "polimento-tecnico", price: "1000.00" }, // era 850
  ];
  for (const u of PRICE_UPDATES) {
    const id = await getServiceId(u.externalId);
    if (!id) { log.push(`AVISO: serviço "${u.externalId}" não encontrado para atualização de preço.`); continue; }
    const result = await db.update(services).set({ defaultPrice: u.price, source: "seed:z3.2-consolidation" }).where(eq(services.id, id)).returning({ id: services.id });
    log.push(`Preço atualizado: ${u.externalId} -> R$ ${u.price} (${result.length} linha)`);
  }

  // ---------------------------------------------------------------------------
  // 2) Novos serviços confirmados (Vitrificação de Plásticos, Vitrificação de Couro)
  // ---------------------------------------------------------------------------
  const NEW_SERVICES: { externalId: string; name: string; category: string; defaultPrice?: string }[] = [
    { externalId: "vitrificacao-plasticos", name: "Vitrificação de Plásticos", category: "Plásticos", defaultPrice: "200.00" },
    { externalId: "vitrificacao-couro", name: "Vitrificação de Couro", category: "Higienização", defaultPrice: "400.00" },
  ];
  for (const s of NEW_SERVICES) {
    const result = await db
      .insert(services)
      .values({ name: s.name, category: s.category, defaultPrice: s.defaultPrice ?? null, source: "seed:z3.2-consolidation", externalId: s.externalId, notes: null })
      .onConflictDoNothing({ target: services.externalId })
      .returning({ id: services.id });
    log.push(`Serviço novo: ${s.externalId} (${result.length > 0 ? "inserido" : "já existia"})`);
  }

  // ---------------------------------------------------------------------------
  // 3) Cristalização/Proteção de Vidros — converte de preço único para variantes
  //    (Somente para-brisa R$100 / Todos os vidros R$250 — R$250 é a correção confirmada)
  // ---------------------------------------------------------------------------
  {
    const id = await getServiceId("cristalizacao-vidros");
    if (id) {
      await db.update(services).set({ defaultPrice: null, source: "seed:z3.2-consolidation" }).where(eq(services.id, id));
      const variants = [
        { label: "Somente para-brisa", price: "100.00", order: 1 },
        { label: "Todos os vidros", price: "250.00", order: 2 },
      ];
      for (const v of variants) {
        const externalId = `cristalizacao-vidros:-:${v.label}`;
        const result = await db
          .insert(servicePriceVariants)
          .values({ serviceId: id, vehicleCategory: null, variantLabel: v.label, price: v.price, displayOrder: v.order, source: "seed:z3.2-consolidation", externalId })
          .onConflictDoNothing({ target: servicePriceVariants.externalId })
          .returning({ id: servicePriceVariants.id });
        log.push(`Variante cristalização de vidros "${v.label}": R$ ${v.price} (${result.length > 0 ? "inserida" : "já existia"})`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4) Vitrificação da pintura — adiciona os tiers 2/4/5 anos que faltavam
  // ---------------------------------------------------------------------------
  {
    const id = await getServiceId("vitrificacao");
    if (id) {
      const variants = [
        { label: "2 anos", price: "1800.00", order: 2 },
        { label: "4 anos", price: "2800.00", order: 4 },
        { label: "5 anos", price: "3300.00", order: 5 },
      ];
      for (const v of variants) {
        const externalId = `vitrificacao:-:${v.label}`;
        const result = await db
          .insert(servicePriceVariants)
          .values({ serviceId: id, vehicleCategory: null, variantLabel: v.label, price: v.price, displayOrder: v.order, source: "seed:z3.2-consolidation", externalId })
          .onConflictDoNothing({ target: servicePriceVariants.externalId })
          .returning({ id: servicePriceVariants.id });
        log.push(`Variante vitrificação "${v.label}": R$ ${v.price} (${result.length > 0 ? "inserida" : "já existia"})`);
      }
      // displayOrder das variantes já existentes (1 ano / 3 anos) — garante ordenação correta 1..5.
      await db.update(servicePriceVariants).set({ displayOrder: 1 }).where(and(eq(servicePriceVariants.serviceId, id), eq(servicePriceVariants.variantLabel, "1 ano")));
      await db.update(servicePriceVariants).set({ displayOrder: 3 }).where(and(eq(servicePriceVariants.serviceId, id), eq(servicePriceVariants.variantLabel, "3 anos")));
    }
  }

  // ---------------------------------------------------------------------------
  // 5) Revitalização de Faróis — reestrutura para variantes (Par: base x comercial atual / Unidade)
  // ---------------------------------------------------------------------------
  {
    const id = await getServiceId("revitalizacao-farois");
    if (id) {
      await db.update(services).set({ defaultPrice: null, source: "seed:z3.2-consolidation" }).where(eq(services.id, id));
      const variants = [
        { label: "Par", price: "300.00", currentPrice: "250.00", order: 1 },
        { label: "Unidade (1 farol)", price: "150.00", currentPrice: null as string | null, order: 2 },
      ];
      for (const v of variants) {
        const externalId = `revitalizacao-farois:-:${v.label}`;
        const inserted = await db
          .insert(servicePriceVariants)
          .values({ serviceId: id, vehicleCategory: null, variantLabel: v.label, price: v.price, currentPrice: v.currentPrice, displayOrder: v.order, source: "seed:z3.2-consolidation", externalId })
          .onConflictDoNothing({ target: servicePriceVariants.externalId })
          .returning({ id: servicePriceVariants.id });
        if (inserted.length === 0) {
          // já existia (reexecução do seed) — garante que currentPrice reflita a condição comercial confirmada.
          await db.update(servicePriceVariants).set({ currentPrice: v.currentPrice }).where(eq(servicePriceVariants.externalId, externalId));
        }
        log.push(`Variante faróis "${v.label}": base R$ ${v.price}${v.currentPrice ? `, comercial atual R$ ${v.currentPrice}` : ""} (${inserted.length > 0 ? "inserida" : "atualizada"})`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6) Bronze/Silver/Gold — etapas confirmadas (corrige Silver x Gold idênticos)
  // ---------------------------------------------------------------------------
  const STEP_PLAN: { service: string; add: string[]; deactivate: string[] }[] = [
    { service: "bronze", add: ["cera"], deactivate: [] },
    { service: "silver", add: ["simbolos", "letras", "macanetas", "sanitizacao_interna", "cera_carnauba"], deactivate: ["protecao_externa"] },
    { service: "gold", add: ["simbolos", "letras", "macanetas", "sanitizacao_interna", "batentes", "descontaminacao_ferrosa", "cromados", "estepe"], deactivate: [] },
  ];
  for (const plan of STEP_PLAN) {
    const id = await getServiceId(plan.service);
    if (!id) continue;
    for (const step of plan.add) {
      const externalId = `${plan.service}:${step}`;
      const result = await db
        .insert(serviceOperationalSteps)
        .values({ serviceId: id, processStep: step as (typeof serviceOperationalSteps.$inferInsert)["processStep"], source: "seed:z3.2-consolidation", externalId })
        .onConflictDoNothing({ target: serviceOperationalSteps.externalId })
        .returning({ id: serviceOperationalSteps.id });
      log.push(`Etapa ${plan.service}/${step}: ${result.length > 0 ? "adicionada" : "já existia"}`);
    }
    for (const step of plan.deactivate) {
      const result = await db
        .update(serviceOperationalSteps)
        .set({ active: false, notes: "Desativada na Missão Z3.2 — não fazia parte da composição confirmada pelo gestor para este pacote." })
        .where(and(eq(serviceOperationalSteps.serviceId, id), eq(serviceOperationalSteps.processStep, step as (typeof serviceOperationalSteps.$inferInsert)["processStep"]), eq(serviceOperationalSteps.active, true)))
        .returning({ id: serviceOperationalSteps.id });
      log.push(`Etapa ${plan.service}/${step}: ${result.length > 0 ? "desativada" : "já estava inativa/inexistente"}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 7) Produtos relacionados — só onde há correspondência real e inequívoca no estoque
  // ---------------------------------------------------------------------------
  interface ProductLink { service: string; itemName: string; role: string; isAlternative?: boolean }
  const PRODUCT_LINKS: ProductLink[] = [
    { service: "bronze", itemName: "Glass Limpa Vidros", role: "Limpeza de vidros (comum aos três pacotes — nunca inferido só pela existência no estoque, confirmado pelo gestor)" },
    { service: "silver", itemName: "Glass Limpa Vidros", role: "Limpeza de vidros (comum aos três pacotes — nunca inferido só pela existência no estoque, confirmado pelo gestor)" },
    { service: "gold", itemName: "Glass Limpa Vidros", role: "Limpeza de vidros (comum aos três pacotes — nunca inferido só pela existência no estoque, confirmado pelo gestor)" },
    { service: "lavagem-motor", itemName: "Nograx Desengraxante", role: "Desincrustante/desengraxante" },
    { service: "lavagem-motor", itemName: "3x1 Limpador Multiuso/Detergente/Desincrustante/Desengraxante/APC", role: "Desincrustante/desengraxante (alternativa — 'produto 3 em 1 adequado disponível na operação')", isAlternative: true },
    { service: "lavagem-motor", itemName: "APC Limpador Multifuncional", role: "Aplicação de APC" },
    { service: "lavagem-motor", itemName: "Black Boost Verniz de Motor", role: "Finalização com verniz de motor" },
    { service: "lavagem-chassi", itemName: "Alumax Limpador de Alumínio", role: "Limpador de alumínio" },
    { service: "lavagem-chassi", itemName: "Removex Desengraxante e Limpador de Chassi", role: "Desengraxante" },
    { service: "lavagem-chassi", itemName: "Remox Removedor de Cimento e Desincrustante de Escapamento", role: "Desincrustante" },
    { service: "chuva-acida", itemName: "Complex Removedor de Chuva Ácida", role: "Remoção de chuva ácida" },
    { service: "cristalizacao-vidros", itemName: "Glaco", role: "Proteção/cristalização dos vidros (produto de proteção — aplicado após vidro limpo e seco, ~15min de ação)" },
    { service: "cristalizacao-vidros", itemName: "Complex Removedor de Chuva Ácida", role: "Preparação — remoção de chuva ácida quando necessária, antes da aplicação do Glaco" },
    { service: "revitalizacao-farois", itemName: "Delet Limpador de Pneus e Borrachas", role: "Limpeza inicial (confirmado pelo gestor como 'DELET da Vonixx' — catalogado no estoque como limpador de pneus/borrachas; usado aqui para o farol por confirmação explícita, não por inferência)" },
    { service: "revitalizacao-farois", itemName: "V-Light Vitrificador Cerâmico de Farol", role: "Finalização — proteção cerâmica (até 1 ano, conforme especificação do produto)" },
    { service: "revitalizacao-plasticos", itemName: "Plástico Revitalizador de Plásticos", role: "Revitalizador de plásticos" },
    { service: "revitalizacao-plasticos", itemName: "APC Limpador Multifuncional", role: "Limpeza com APC" },
    { service: "vitrificacao-plasticos", itemName: "V-Plastic Vitrificador de Plásticos", role: "Vitrificador de plásticos (proteção até 1 ano, conforme especificação do produto)" },
    { service: "hidratacao-couro", itemName: "Hidrat Hidratante de Couro", role: "Hidratante de couro" },
    { service: "hidratacao-couro", itemName: "APC Limpador Multifuncional", role: "Limpeza inicial com APC" },
    { service: "higienizacao-interna", itemName: "APC Limpador Multifuncional", role: "Aplicação de APC" },
  ];
  for (const link of PRODUCT_LINKS) {
    const serviceId = await getServiceId(link.service);
    const itemId = await getItemIdByName(link.itemName);
    if (!serviceId) { log.push(`AVISO: serviço "${link.service}" não encontrado — link de produto pulado.`); continue; }
    if (!itemId) { log.push(`AVISO: produto "${link.itemName}" não encontrado no estoque — link pulado (nunca inventado).`); continue; }
    const roleSlug = link.role.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const externalId = `${link.service}:${itemId}:${roleSlug}`;
    const result = await db
      .insert(serviceProducts)
      .values({ serviceId, itemId, role: link.role, isAlternative: link.isAlternative ?? false, source: "seed:z3.2-consolidation", externalId })
      .onConflictDoNothing({ target: serviceProducts.externalId })
      .returning({ id: serviceProducts.id });
    log.push(`Produto ${link.service} <- "${link.itemName}": ${result.length > 0 ? "vinculado" : "já existia"}`);
  }

  // ---------------------------------------------------------------------------
  // 8) Política comercial (linha única de configuração)
  // ---------------------------------------------------------------------------
  {
    const [existing] = await db.select({ id: commercialPolicy.id }).from(commercialPolicy).where(eq(commercialPolicy.active, true)).limit(1);
    if (!existing) {
      await db.insert(commercialPolicy).values({
        maxDiscountPercent: "10.00",
        discountProgressionSteps: [5, 10],
        installmentThresholdAmount: "1000.00",
        maxInstallments: 4,
        source: "seed:z3.2-consolidation",
        notes: "Confirmado pelo gestor na Missão Z3.2: desconto financeiro é último recurso, progressão 5% -> 10%, parcelamento em até 4x no cartão para vendas acima de R$1.000.",
      });
      log.push("Política comercial: criada (máx. 10%, progressão [5,10], parcelamento 4x acima de R$1.000)");
    } else {
      log.push("Política comercial: já existia uma linha ativa — nenhuma alteração (reexecução do seed).");
    }
  }

  // ---------------------------------------------------------------------------
  // 9) Cortesias estratégicas autorizadas (só as inequívocas do exemplo do gestor)
  // ---------------------------------------------------------------------------
  const COMPLIMENTARY: { service: string; context: string }[] = [
    { service: "cristalizacao-vidros", context: "Cortesia estratégica em fechamento de ticket relevante (ex.: exemplo do gestor — pacote de R$1.600 em Polimento Comercial + Higienização + Motor + Chassi) — variante 'Somente para-brisa'." },
    { service: "tratamento-ozonio", context: "Cortesia estratégica em fechamento de ticket relevante, quando fizer sentido como complemento (ex.: junto de higienização)." },
  ];
  for (const c of COMPLIMENTARY) {
    const serviceId = await getServiceId(c.service);
    if (!serviceId) continue;
    const externalId = `cortesia:${c.service}`;
    const result = await db
      .insert(serviceComplimentaryOptions)
      .values({ serviceId, context: c.context, source: "seed:z3.2-consolidation", externalId })
      .onConflictDoNothing({ target: serviceComplimentaryOptions.externalId })
      .returning({ id: serviceComplimentaryOptions.id });
    log.push(`Cortesia autorizada "${c.service}": ${result.length > 0 ? "cadastrada" : "já existia"}`);
  }

  console.log(log.join("\n"));
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar consolidação do catálogo:", error instanceof Error ? error.message : error);
  process.exit(1);
});
