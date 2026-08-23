import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { services, servicePriceVariants, serviceOperationalSteps, serviceProducts, inventoryItems } from "@/db/schema";

/**
 * Missão Z3 (base de conhecimento do Zézinho) — catálogo comercial estruturado (categoria B da
 * missão: serviços/preços/pacotes). Única fonte de leitura para preço/descrição de serviço —
 * nunca duplica `services`/`servicePriceVariants` (schema em `db/schema/inventory.ts`), só as
 * consulta. Distinto de `attendance/repository.ts#listServiceCatalog` (usado para registrar o
 * preço no momento da venda em uma Ordem de Serviço) — aqui o consumo é só leitura/consulta
 * conversacional, nunca grava nada.
 */

export type VehicleCategory = "hatch" | "sedan" | "suv" | "caminhonete";

export interface ServicePriceVariant {
  vehicleCategory: VehicleCategory | null;
  variantLabel: string | null;
  /** Preço-base desta variante. */
  price: number;
  /** Missão Z3.2 — condição comercial atual, quando diferente do preço-base. `null` = a condição comercial atual é o próprio `price`. */
  currentPrice: number | null;
}

export interface ServiceProductLink {
  productName: string;
  role: string;
  isAlternative: boolean;
}

export interface ServiceCatalogEntry {
  id: string;
  name: string;
  category: string | null;
  /** Preço-base único — presente só quando o serviço não varia por porte/tier (ver `priceVariants`). */
  defaultPrice: number | null;
  /** Missão Z3.2 — condição comercial atual do preço único, quando diferente do preço-base. */
  currentPrice: number | null;
  priceVariants: ServicePriceVariant[];
  shortDescription: string | null;
  detailedDescription: string | null;
  estimatedDurationMinutes: number | null;
  benefits: string | null;
  indications: string | null;
  restrictions: string | null;
  requiresInspection: boolean;
  /** Etapas operacionais já cadastradas para este serviço (`service_operational_steps`) — `[]` quando ainda não confirmado, nunca deduzido do nome. */
  operationalSteps: string[];
  /** Produtos confirmados para este serviço (`service_products`) — `[]` quando ainda não confirmado. Nunca inferido só pela existência do produto no estoque. */
  products: ServiceProductLink[];
}

/** Nunca lança — sem banco configurado, devolve `[]` (nenhum serviço inventado). */
export async function fetchServiceCatalog(): Promise<ServiceCatalogEntry[]> {
  const db = getDb();
  if (!db) return [];

  const [serviceRows, variantRows, stepRows, productRows] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)),
    db.select().from(servicePriceVariants).where(eq(servicePriceVariants.active, true)),
    db.select().from(serviceOperationalSteps).where(eq(serviceOperationalSteps.active, true)),
    db
      .select({ serviceId: serviceProducts.serviceId, role: serviceProducts.role, isAlternative: serviceProducts.isAlternative, productName: inventoryItems.name })
      .from(serviceProducts)
      .innerJoin(inventoryItems, eq(inventoryItems.id, serviceProducts.itemId))
      .where(eq(serviceProducts.active, true)),
  ]);

  const variantsByService = new Map<string, ServicePriceVariant[]>();
  for (const v of variantRows) {
    const list = variantsByService.get(v.serviceId) ?? [];
    list.push({ vehicleCategory: v.vehicleCategory, variantLabel: v.variantLabel, price: Number(v.price), currentPrice: v.currentPrice !== null ? Number(v.currentPrice) : null });
    variantsByService.set(v.serviceId, list);
  }

  const stepsByService = new Map<string, string[]>();
  for (const s of stepRows) {
    const list = stepsByService.get(s.serviceId) ?? [];
    list.push(s.processStep);
    stepsByService.set(s.serviceId, list);
  }

  const productsByService = new Map<string, ServiceProductLink[]>();
  for (const p of productRows) {
    const list = productsByService.get(p.serviceId) ?? [];
    list.push({ productName: p.productName, role: p.role, isAlternative: p.isAlternative });
    productsByService.set(p.serviceId, list);
  }

  return serviceRows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    defaultPrice: row.defaultPrice !== null ? Number(row.defaultPrice) : null,
    currentPrice: row.currentPrice !== null ? Number(row.currentPrice) : null,
    priceVariants: variantsByService.get(row.id) ?? [],
    shortDescription: row.shortDescription,
    detailedDescription: row.detailedDescription,
    estimatedDurationMinutes: row.estimatedDurationMinutes,
    benefits: row.benefits,
    indications: row.indications,
    restrictions: row.restrictions,
    requiresInspection: row.requiresInspection,
    operationalSteps: stepsByService.get(row.id) ?? [],
    products: productsByService.get(row.id) ?? [],
  }));
}

const NORMALIZE_MARKS = /[\u0300-\u036f]/g;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(NORMALIZE_MARKS, "");
}

export interface ServiceCatalogSearchParams {
  query?: string;
  vehicleCategory?: VehicleCategory;
  category?: string;
}

/**
 * Filtragem pura (sem I/O) — separada de `searchServiceCatalog` para ser testável com um
 * catálogo sintético, sem precisar de banco. Busca por nome/categoria é substring sem acento; o
 * modelo generativo interpreta a intenção e chama a ferramenta com parâmetros estruturados —
 * nunca um regex de palavra-chave rígido por trás. Quando `vehicleCategory` é informado, cada
 * resultado só traz o preço daquele porte (quando o serviço varia por porte) — nunca a tabela
 * inteira quando a pergunta já foi específica.
 */
export function filterServiceCatalog(catalog: ServiceCatalogEntry[], params: ServiceCatalogSearchParams): ServiceCatalogEntry[] {
  const needle = params.query ? normalize(params.query) : null;

  let results = catalog;
  if (needle) {
    results = results.filter((s) => normalize(s.name).includes(needle) || (s.category && normalize(s.category).includes(needle)));
  }
  if (params.category) {
    const categoryNeedle = normalize(params.category);
    results = results.filter((s) => s.category && normalize(s.category).includes(categoryNeedle));
  }
  if (params.vehicleCategory) {
    results = results.map((s) => (s.priceVariants.length > 0 ? { ...s, priceVariants: s.priceVariants.filter((v) => v.vehicleCategory === null || v.vehicleCategory === params.vehicleCategory) } : s));
  }
  return results;
}

export async function searchServiceCatalog(params: ServiceCatalogSearchParams): Promise<ServiceCatalogEntry[]> {
  const catalog = await fetchServiceCatalog();
  return filterServiceCatalog(catalog, params);
}
