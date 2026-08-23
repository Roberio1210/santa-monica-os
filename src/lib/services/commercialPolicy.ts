import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { commercialPolicy, serviceComplimentaryOptions, services } from "@/db/schema";

/**
 * Missão Z3.2 — política comercial estruturada e auditável (categoria: regra de negociação,
 * nunca dado financeiro interno — nenhum custo/margem existe aqui). Fonte única para o Zézinho e
 * para qualquer tela futura de configuração; nunca hardcoded no system prompt (ver missão, seção
 * 31 — "permitir alteração futura sem editar código").
 */

export interface CommercialPolicyConfig {
  maxDiscountPercent: number;
  discountProgressionSteps: number[];
  installmentThresholdAmount: number;
  maxInstallments: number;
}

export interface ComplimentaryOption {
  serviceName: string;
  /** Preço real do serviço (preço-base, ou o único definido) — o "valor percebido" da cortesia, nunca duplicado/inventado, sempre lido de `services`/`servicePriceVariants` via o próprio catálogo. */
  context: string | null;
}

/** Nunca lança — sem banco configurado ou sem política cadastrada, devolve `null` (nunca inventa um limite). */
export async function fetchCommercialPolicy(): Promise<CommercialPolicyConfig | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(commercialPolicy).where(eq(commercialPolicy.active, true)).limit(1);
  if (!row) return null;
  return {
    maxDiscountPercent: Number(row.maxDiscountPercent),
    discountProgressionSteps: (row.discountProgressionSteps as number[]) ?? [],
    installmentThresholdAmount: Number(row.installmentThresholdAmount),
    maxInstallments: row.maxInstallments,
  };
}

/** Nunca lança — sem banco configurado, devolve `[]` (nenhuma cortesia inventada). */
export async function fetchComplimentaryOptions(): Promise<ComplimentaryOption[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ serviceName: services.name, context: serviceComplimentaryOptions.context })
    .from(serviceComplimentaryOptions)
    .innerJoin(services, eq(services.id, serviceComplimentaryOptions.serviceId))
    .where(eq(serviceComplimentaryOptions.active, true));
  return rows;
}
