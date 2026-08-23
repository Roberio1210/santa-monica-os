import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { services, servicePriceVariants, serviceOperationalSteps, serviceProducts, inventoryItems } from "@/db/schema";

/**
 * Missão Z3.3 — fecha o conhecimento operacional do Zézinho: produtos homologados por
 * serviço/etapa/variante (incluindo os que nunca foram cadastrados no estoque real — ver
 * `productNameFallback` em `service_products`), a correção "Bronze não recebe cera" e a
 * correção de durabilidade da Vitrificação de Plásticos ("até 2 anos", não "até 1 ano").
 * Idempotente (upsert por external_id / UPDATE condicional). NUNCA toca em dado histórico
 * (ordens, jumppark_service_order_items, cash_movements) e NUNCA cria item de estoque —
 * produtos homologados sem correspondência real no estoque ficam com `itemId = null` e o nome/
 * marca exatamente como o gestor confirmou (nunca inventado).
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

  async function getVariantId(serviceId: string, variantLabel: string): Promise<string | null> {
    const [row] = await db
      .select({ id: servicePriceVariants.id })
      .from(servicePriceVariants)
      .where(and(eq(servicePriceVariants.serviceId, serviceId), eq(servicePriceVariants.variantLabel, variantLabel)))
      .limit(1);
    return row?.id ?? null;
  }

  const log: string[] = [];

  // ---------------------------------------------------------------------------
  // 1) Bronze NÃO recebe cera — corrige a etapa "cera" adicionada por engano na Z3.2
  // ---------------------------------------------------------------------------
  {
    const id = await getServiceId("bronze");
    if (id) {
      const result = await db
        .update(serviceOperationalSteps)
        .set({ active: false, notes: "Desativada na Missão Z3.3 — o gestor confirmou que a Bronze NÃO recebe cera (a etapa 'cera' havia sido incluída por engano na Missão Z3.2)." })
        .where(and(eq(serviceOperationalSteps.serviceId, id), eq(serviceOperationalSteps.processStep, "cera"), eq(serviceOperationalSteps.active, true)))
        .returning({ id: serviceOperationalSteps.id });
      log.push(`Correção Bronze sem cera: etapa 'cera' ${result.length > 0 ? "desativada" : "já estava inativa/inexistente"}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2) Produtos homologados sem variante específica (valem para o serviço inteiro)
  // ---------------------------------------------------------------------------
  interface ProductLink {
    service: string;
    itemName?: string; // quando existe no estoque real
    fallbackName?: string; // quando NUNCA foi cadastrado no estoque (nunca inventa itemId)
    fallbackBrand?: string;
    role: string;
    isAlternative?: boolean;
    durabilityLabel?: string;
  }

  const PRODUCT_LINKS: ProductLink[] = [
    // Pneus — Bronze/Silver: revitalizador/pretinho padrão Farben
    { service: "bronze", itemName: "Selanew Selante para Pneus", role: "Revitalizador/pretinho de pneus (linha padrão Farben)" },
    { service: "silver", itemName: "Selanew Selante para Pneus", role: "Revitalizador/pretinho de pneus (linha padrão Farben)" },
    // Pneus — Gold: opção de nível superior, Dub Boyz OU Evo
    { service: "gold", itemName: "Good Shine", role: "Revitalizador/pretinho de pneus — opção de nível superior (Dub Boyz)" },
    { service: "gold", itemName: "Luminous Black", role: "Revitalizador/pretinho de pneus — opção de nível superior (Evo)", isAlternative: true },
    // Cera líquida — Silver
    { service: "silver", itemName: "Blend Cera de Carnaúba Spray", role: "Proteção com cera líquida — linha Blend (Vonixx), cera de carnaúba em spray" },
    { service: "silver", itemName: "Blend Black Edition", role: "Proteção com cera líquida — linha Blend Black Edition (Vonixx), formulada para veículos escuros", isAlternative: true },
    // Proteção de pintura de nível superior — Gold
    { service: "gold", itemName: "Hidrofast Nano Selante", role: "Proteção de pintura de nível superior — Hidrofast (Jaça), nano selante" },
    { service: "gold", itemName: "Atomic Future Ceramic Wax Paste", role: "Proteção de pintura de nível superior — Atomic (Cadillac), cera cerâmica em pasta", isAlternative: true },
    { service: "gold", fallbackName: "Cera em pasta", fallbackBrand: "Soft99", role: "Proteção de pintura de nível superior — cera em pasta (Soft99)", isAlternative: true },
    // Revitalização de plásticos — diferencial real da Gold (Bronze/Silver não recebem)
    { service: "gold", itemName: "Plástico Revitalizador de Plásticos", role: "Revitalização de plásticos — diferencial da Gold em relação a Bronze/Silver" },
    // Vitrificação de Couro — nenhum dos 3 homologados está cadastrado no estoque hoje
    { service: "vitrificacao-couro", fallbackName: "V-Leather / V-Leather Pro", fallbackBrand: "Vonixx", role: "Vitrificador de couro homologado", durabilityLabel: "~1 ano" },
    { service: "vitrificacao-couro", fallbackName: "Pro Supera", fallbackBrand: "Alcance", role: "Vitrificador de couro homologado", isAlternative: true, durabilityLabel: "~1 ano" },
    { service: "vitrificacao-couro", fallbackName: "CQuartz Leather 2.0", fallbackBrand: "CarPro", role: "Vitrificador de couro homologado", isAlternative: true, durabilityLabel: "1 a 2 anos" },
  ];

  function slug(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);
  }

  for (const link of PRODUCT_LINKS) {
    const serviceId = await getServiceId(link.service);
    if (!serviceId) {
      log.push(`AVISO: serviço "${link.service}" não encontrado — link de produto pulado.`);
      continue;
    }
    const itemId = link.itemName ? await getItemIdByName(link.itemName) : null;
    if (link.itemName && !itemId) {
      log.push(`AVISO: produto "${link.itemName}" não encontrado no estoque — link pulado (nunca inventado).`);
      continue;
    }
    const identitySlug = itemId ? itemId : `fallback-${slug(link.fallbackName ?? "")}`;
    const externalId = `${link.service}:-:${identitySlug}:${slug(link.role)}`;
    const result = await db
      .insert(serviceProducts)
      .values({
        serviceId,
        itemId,
        productNameFallback: itemId ? null : (link.fallbackName ?? null),
        brandFallback: itemId ? null : (link.fallbackBrand ?? null),
        role: link.role,
        isAlternative: link.isAlternative ?? false,
        durabilityLabel: link.durabilityLabel ?? null,
        source: "seed:z3.3-operational-products",
        externalId,
      })
      .onConflictDoNothing({ target: serviceProducts.externalId })
      .returning({ id: serviceProducts.id });
    log.push(`Produto ${link.service} <- "${link.itemName ?? `${link.fallbackName} (${link.fallbackBrand}, nunca cadastrado no estoque)`}": ${result.length > 0 ? "vinculado" : "já existia"}`);
  }

  // ---------------------------------------------------------------------------
  // 3) Vitrificação de Plásticos — corrige durabilidade "até 1 ano" -> "até 2 anos" (V-Plastic)
  // ---------------------------------------------------------------------------
  {
    const result = await db
      .update(serviceProducts)
      .set({
        role: "Vitrificador de plásticos (proteção até 2 anos, conforme informado pelo gestor)",
        durabilityLabel: "até 2 anos",
        notes: "Corrigido na Missão Z3.3 — a Z3.2 havia registrado 'até 1 ano' com base só na especificação do produto; o gestor confirmou 'até 2 anos' como o valor real praticado.",
        source: "seed:z3.3-operational-products",
      })
      .where(eq(serviceProducts.externalId, "vitrificacao-plasticos:d6d01213-c5fe-4fef-bbf5-135f6b677ccd:vitrificador-de-pl-sticos-prote-o-at-"))
      .returning({ id: serviceProducts.id });
    log.push(`Correção V-Plastic (vitrificação de plásticos): durabilidade -> "até 2 anos" (${result.length > 0 ? "atualizado" : "linha não encontrada pelo external_id esperado"})`);
  }

  // ---------------------------------------------------------------------------
  // 4) Vitrificação da pintura — produtos homologados por variante (duração)
  // ---------------------------------------------------------------------------
  interface VariantProductLink {
    variantLabel: string;
    itemName?: string;
    fallbackName?: string;
    fallbackBrand?: string;
    role: string;
    isAlternative?: boolean;
  }

  const VITRIFICACAO_LINKS: VariantProductLink[] = [
    { variantLabel: "1 ano", itemName: "Insignia Light Vitrificador", role: "Vitrificador homologado para a duração de 1 ano (opção atualmente em loja)" },
    { variantLabel: "1 ano", fallbackName: "XR03", fallbackBrand: "Nasiol", role: "Vitrificador homologado para a duração de 1 ano", isAlternative: true },
    { variantLabel: "2 anos", fallbackName: "V-Paint", fallbackBrand: "Vonixx", role: "Vitrificador homologado para a duração de 2 anos" },
    { variantLabel: "2 anos", fallbackName: "CQuartz UK 3.0", fallbackBrand: "CarPro", role: "Vitrificador homologado para a duração de 2 anos", isAlternative: true },
    { variantLabel: "3 anos", itemName: "VX45 Vitrificador 3 anos", role: "Vitrificador homologado para a duração de 3 anos (opção atualmente em loja)" },
    { variantLabel: "3 anos", fallbackName: "CQUK / UK Edition", fallbackBrand: "CarPro", role: "Vitrificador homologado para a duração de 3 anos", isAlternative: true },
    { variantLabel: "3 anos", fallbackName: "H7", fallbackBrand: "Soft99", role: "Vitrificador homologado para a duração de 3 anos", isAlternative: true },
    { variantLabel: "3 anos", fallbackName: "ZR53", fallbackBrand: "Nasiol", role: "Vitrificador homologado para a duração de 3 anos", isAlternative: true },
    { variantLabel: "4 anos", itemName: "Sonax CC Pro Paint Ceramic Coat", role: "Vitrificador homologado para a duração de 4 anos (opção atualmente em loja)" },
    { variantLabel: "4 anos", fallbackName: "V-Energy Pro", fallbackBrand: "Vonixx", role: "Vitrificador homologado para a duração de 4 anos", isAlternative: true },
    { variantLabel: "5 anos", fallbackName: "CC EVO", fallbackBrand: "Sonax", role: "Vitrificador homologado para a duração de 5 anos" },
    { variantLabel: "5 anos", fallbackName: "NL272", fallbackBrand: "Nasiol", role: "Vitrificador homologado para a duração de 5 anos", isAlternative: true },
    { variantLabel: "5 anos", fallbackName: "Insignia 9H", fallbackBrand: "EasyTech", role: "Vitrificador homologado para a duração de 5 anos", isAlternative: true },
  ];

  {
    const serviceId = await getServiceId("vitrificacao");
    if (!serviceId) {
      log.push("AVISO: serviço 'vitrificacao' não encontrado — produtos por duração pulados.");
    } else {
      for (const link of VITRIFICACAO_LINKS) {
        const variantId = await getVariantId(serviceId, link.variantLabel);
        if (!variantId) {
          log.push(`AVISO: variante "${link.variantLabel}" de vitrificação não encontrada — link pulado.`);
          continue;
        }
        const itemId = link.itemName ? await getItemIdByName(link.itemName) : null;
        if (link.itemName && !itemId) {
          log.push(`AVISO: produto "${link.itemName}" não encontrado no estoque — link pulado (nunca inventado).`);
          continue;
        }
        const identitySlug = itemId ? itemId : `fallback-${slug(link.fallbackName ?? "")}`;
        const externalId = `vitrificacao:${link.variantLabel}:${identitySlug}:${slug(link.role)}`;
        const result = await db
          .insert(serviceProducts)
          .values({
            serviceId,
            priceVariantId: variantId,
            itemId,
            productNameFallback: itemId ? null : (link.fallbackName ?? null),
            brandFallback: itemId ? null : (link.fallbackBrand ?? null),
            role: link.role,
            isAlternative: link.isAlternative ?? false,
            source: "seed:z3.3-operational-products",
            externalId,
          })
          .onConflictDoNothing({ target: serviceProducts.externalId })
          .returning({ id: serviceProducts.id });
        log.push(`Vitrificação ${link.variantLabel} <- "${link.itemName ?? `${link.fallbackName} (${link.fallbackBrand}, nunca cadastrado no estoque)`}": ${result.length > 0 ? "vinculado" : "já existia"}`);
      }
    }
  }

  console.log(log.join("\n"));
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar produtos operacionais Z3.3:", error instanceof Error ? error.message : error);
  process.exit(1);
});
