import "server-only";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { recipeCalibrationSamples, serviceConsumptionRules, serviceOperationalSteps } from "@/db/schema";
import type { RecipeRepository } from "@/lib/recipes/repository";
import type {
  CalibrationSample,
  CalibrationSampleStatus,
  NewRecipeInput,
  NewSampleInput,
  ProcessStep,
  Recipe,
  RecipePatch,
  RecipeStatus,
  SamplePatch,
  SharedRecipeMatch,
  VehicleCategory,
} from "@/lib/recipes/types";
import type { InventoryUnit } from "@/lib/inventory/types";

function toRecipe(row: typeof serviceConsumptionRules.$inferSelect): Recipe {
  // service_id é nullable no schema (Missão do Catálogo Técnico Mestre — prepara receitas
  // presas só à etapa, reutilizáveis por vários serviços via `service_operational_steps`).
  // `Recipe.serviceId` continua `string` (não `string | null`) — uma receita compartilhada não
  // é representável como Recipe, é representada por SharedRecipeMatch/toSharedRecipeMatch.
  // `listRecipes()`/`getRecipe()` (únicos chamadores de toRecipe) já filtram/excluem linhas com
  // service_id nulo ANTES de chegar aqui (Missão de Revisão do Protocolo Operacional V1 —
  // corrige o landmine identificado: antes, essas duas funções lançavam erro no primeiro
  // contato com uma receita compartilhada real). Este throw é só uma guarda de regressão —
  // não deveria ser alcançável por nenhum caminho hoje.
  if (row.serviceId === null) {
    throw new Error(`toRecipe() chamada com service_id nulo (receita ${row.id}) — bug: o chamador deveria ter filtrado essa linha antes (ver findSharedRecipe/toSharedRecipeMatch para o caminho correto).`);
  }
  return {
    id: row.id,
    serviceId: row.serviceId,
    itemId: row.itemId,
    vehicleCategory: row.vehicleCategory as VehicleCategory,
    processStep: row.processStep as ProcessStep,
    quantityPerService: row.quantityPerService !== null ? Number(row.quantityPerService) : null,
    unit: row.unit as InventoryUnit,
    status: row.status as RecipeStatus,
    version: row.version,
    isActiveVersion: row.isActiveVersion,
    dilutionRatio: row.dilutionRatio !== null ? Number(row.dilutionRatio) : null,
    minObserved: row.minObserved !== null ? Number(row.minObserved) : null,
    maxObserved: row.maxObserved !== null ? Number(row.maxObserved) : null,
    sampleCount: row.sampleCount,
    lastCalibratedAt: row.lastCalibratedAt,
    notes: row.notes,
    technicalReferenceQuantity: row.technicalReferenceQuantity !== null ? Number(row.technicalReferenceQuantity) : null,
    technicalReferenceSource: row.technicalReferenceSource,
    usageType: row.usageType,
    technicalFunction: row.technicalFunction,
    informationSource: row.informationSource,
    dilutionBasis: row.dilutionBasis,
    managerialBaselineQuantity: row.managerialBaselineQuantity !== null ? Number(row.managerialBaselineQuantity) : null,
    managerialTolerancePercentage: row.managerialTolerancePercentage !== null ? Number(row.managerialTolerancePercentage) : null,
    managerialBaselineSource: row.managerialBaselineSource,
    managerialBaselineSince: row.managerialBaselineSince,
    managerialSizeAdjustmentApplicable: row.managerialSizeAdjustmentApplicable,
  };
}

/**
 * Missão do Protocolo Operacional V1 — mapeia uma receita COMPARTILHADA (service_id nulo).
 * Nunca reaproveita toRecipe(): esse guard lança justamente para essa forma de linha.
 */
function toSharedRecipeMatch(row: typeof serviceConsumptionRules.$inferSelect): SharedRecipeMatch {
  return {
    id: row.id,
    itemId: row.itemId,
    vehicleCategory: row.vehicleCategory as VehicleCategory,
    processStep: row.processStep as ProcessStep,
    quantityPerService: row.quantityPerService !== null ? Number(row.quantityPerService) : null,
    technicalReferenceQuantity: row.technicalReferenceQuantity !== null ? Number(row.technicalReferenceQuantity) : null,
    technicalReferenceSource: row.technicalReferenceSource,
    unit: row.unit as InventoryUnit,
    status: row.status as RecipeStatus,
    dilutionRatio: row.dilutionRatio !== null ? Number(row.dilutionRatio) : null,
    sampleCount: row.sampleCount,
  };
}

function toSample(row: typeof recipeCalibrationSamples.$inferSelect): CalibrationSample {
  return {
    id: row.id,
    recipeId: row.recipeId,
    serviceOrderExternalId: row.serviceOrderExternalId,
    date: row.date,
    quantityBefore: Number(row.quantityBefore),
    quantityAfter: Number(row.quantityAfter),
    preparedQuantity: row.preparedQuantity !== null ? Number(row.preparedQuantity) : null,
    leftoverReused: row.leftoverReused !== null ? Number(row.leftoverReused) : null,
    discarded: row.discarded !== null ? Number(row.discarded) : null,
    dilutionRatio: row.dilutionRatio !== null ? Number(row.dilutionRatio) : null,
    concentrateConsumed: Number(row.concentrateConsumed),
    responsibleName: row.responsibleName,
    status: row.status as CalibrationSampleStatus,
    exclusionReason: row.exclusionReason,
    notes: row.notes,
  };
}

/** Implementação real, ativada automaticamente quando DATABASE_URL está configurada. */
export class PostgresRecipeRepository implements RecipeRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error("PostgresRecipeRepository foi instanciado sem DATABASE_URL configurada.");
    }
    return db;
  }

  async listRecipes(): Promise<Recipe[]> {
    // Exclui receitas compartilhadas (service_id nulo) — listRecipes()/Recipe representam
    // receitas presas a um serviço específico; uma compartilhada não tem "o" serviço a mostrar
    // e deve ser consultada via findSharedRecipe. Missão de Revisão do Protocolo Operacional V1.
    const rows = await this.db()
      .select()
      .from(serviceConsumptionRules)
      .where(and(eq(serviceConsumptionRules.active, true), isNotNull(serviceConsumptionRules.serviceId)));
    return rows.map(toRecipe);
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const rows = await this.db().select().from(serviceConsumptionRules).where(eq(serviceConsumptionRules.id, id)).limit(1);
    // Uma receita compartilhada (service_id nulo) não é representável como Recipe — tratada como
    // "não encontrada por este caminho" em vez de lançar. Ver findSharedRecipe para o caminho correto.
    if (!rows[0] || rows[0].serviceId === null) return null;
    return toRecipe(rows[0]);
  }

  async findActiveRecipe(serviceId: string, vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<Recipe | null> {
    const rows = await this.db()
      .select()
      .from(serviceConsumptionRules)
      .where(
        and(
          eq(serviceConsumptionRules.serviceId, serviceId),
          eq(serviceConsumptionRules.vehicleCategory, vehicleCategory),
          eq(serviceConsumptionRules.processStep, processStep),
          eq(serviceConsumptionRules.itemId, itemId),
          eq(serviceConsumptionRules.isActiveVersion, true),
        ),
      )
      .limit(1);
    return rows[0] ? toRecipe(rows[0]) : null;
  }

  async createRecipe(input: NewRecipeInput): Promise<Recipe> {
    const [inserted] = await this.db()
      .insert(serviceConsumptionRules)
      .values({
        serviceId: input.serviceId,
        itemId: input.itemId,
        vehicleCategory: input.vehicleCategory,
        processStep: input.processStep,
        quantityPerService: null,
        unit: input.unit,
        status: "rascunho",
        version: 1,
        isActiveVersion: true,
        dilutionRatio: input.dilutionRatio !== null ? String(input.dilutionRatio) : null,
        minObserved: null,
        maxObserved: null,
        sampleCount: 0,
        lastCalibratedAt: null,
        notes: input.notes,
        technicalReferenceQuantity: input.technicalReferenceQuantity != null ? String(input.technicalReferenceQuantity) : null,
        technicalReferenceSource: input.technicalReferenceSource ?? null,
      })
      .returning();
    return toRecipe(inserted);
  }

  async updateRecipe(id: string, patch: RecipePatch): Promise<Recipe> {
    const values: Partial<typeof serviceConsumptionRules.$inferInsert> = { updatedAt: new Date() };
    if (patch.itemId !== undefined) values.itemId = patch.itemId;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.version !== undefined) values.version = patch.version;
    if (patch.isActiveVersion !== undefined) values.isActiveVersion = patch.isActiveVersion;
    if (patch.quantityPerService !== undefined) values.quantityPerService = patch.quantityPerService !== null ? String(patch.quantityPerService) : null;
    if (patch.dilutionRatio !== undefined) values.dilutionRatio = patch.dilutionRatio !== null ? String(patch.dilutionRatio) : null;
    if (patch.minObserved !== undefined) values.minObserved = patch.minObserved !== null ? String(patch.minObserved) : null;
    if (patch.maxObserved !== undefined) values.maxObserved = patch.maxObserved !== null ? String(patch.maxObserved) : null;
    if (patch.sampleCount !== undefined) values.sampleCount = patch.sampleCount;
    if (patch.lastCalibratedAt !== undefined) values.lastCalibratedAt = patch.lastCalibratedAt;
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.technicalReferenceQuantity !== undefined) values.technicalReferenceQuantity = patch.technicalReferenceQuantity !== null ? String(patch.technicalReferenceQuantity) : null;
    if (patch.technicalReferenceSource !== undefined) values.technicalReferenceSource = patch.technicalReferenceSource;
    if (patch.usageType !== undefined) values.usageType = patch.usageType;
    if (patch.technicalFunction !== undefined) values.technicalFunction = patch.technicalFunction;
    if (patch.informationSource !== undefined) values.informationSource = patch.informationSource;
    if (patch.dilutionBasis !== undefined) values.dilutionBasis = patch.dilutionBasis;
    if (patch.managerialBaselineQuantity !== undefined) values.managerialBaselineQuantity = patch.managerialBaselineQuantity !== null ? String(patch.managerialBaselineQuantity) : null;
    if (patch.managerialTolerancePercentage !== undefined) values.managerialTolerancePercentage = patch.managerialTolerancePercentage !== null ? String(patch.managerialTolerancePercentage) : null;
    if (patch.managerialBaselineSource !== undefined) values.managerialBaselineSource = patch.managerialBaselineSource;
    if (patch.managerialBaselineSince !== undefined) values.managerialBaselineSince = patch.managerialBaselineSince;
    if (patch.managerialSizeAdjustmentApplicable !== undefined) values.managerialSizeAdjustmentApplicable = patch.managerialSizeAdjustmentApplicable;

    const [updated] = await this.db().update(serviceConsumptionRules).set(values).where(eq(serviceConsumptionRules.id, id)).returning();
    if (!updated) throw new Error(`Receita não encontrada: ${id}`);
    return toRecipe(updated);
  }

  async serviceUsesOperationalStep(serviceId: string, processStep: ProcessStep): Promise<boolean> {
    const rows = await this.db()
      .select({ id: serviceOperationalSteps.id })
      .from(serviceOperationalSteps)
      .where(and(eq(serviceOperationalSteps.serviceId, serviceId), eq(serviceOperationalSteps.processStep, processStep), eq(serviceOperationalSteps.active, true)))
      .limit(1);
    return rows.length > 0;
  }

  async declareOperationalStep(input: { serviceId: string; processStep: ProcessStep; externalId?: string | null; notes?: string | null }): Promise<{ created: boolean }> {
    const result = await this.db()
      .insert(serviceOperationalSteps)
      .values({ serviceId: input.serviceId, processStep: input.processStep, externalId: input.externalId ?? null, notes: input.notes ?? null })
      .onConflictDoNothing({ target: [serviceOperationalSteps.serviceId, serviceOperationalSteps.processStep] })
      .returning({ id: serviceOperationalSteps.id });
    return { created: result.length > 0 };
  }

  async findSharedRecipe(vehicleCategory: VehicleCategory, processStep: ProcessStep, itemId: string): Promise<SharedRecipeMatch | null> {
    const rows = await this.db()
      .select()
      .from(serviceConsumptionRules)
      .where(
        and(
          isNull(serviceConsumptionRules.serviceId),
          eq(serviceConsumptionRules.vehicleCategory, vehicleCategory),
          eq(serviceConsumptionRules.processStep, processStep),
          eq(serviceConsumptionRules.itemId, itemId),
          eq(serviceConsumptionRules.isActiveVersion, true),
        ),
      )
      .limit(1);
    return rows[0] ? toSharedRecipeMatch(rows[0]) : null;
  }

  async createSharedRecipe(input: {
    itemId: string;
    vehicleCategory: VehicleCategory;
    processStep: ProcessStep;
    unit: InventoryUnit;
    quantityPerService?: number | null;
    technicalReferenceQuantity?: number | null;
    technicalReferenceSource?: string | null;
    dilutionRatio?: number | null;
  }): Promise<SharedRecipeMatch> {
    const [inserted] = await this.db()
      .insert(serviceConsumptionRules)
      .values({
        serviceId: null,
        itemId: input.itemId,
        vehicleCategory: input.vehicleCategory,
        processStep: input.processStep,
        quantityPerService: input.quantityPerService != null ? String(input.quantityPerService) : null,
        unit: input.unit,
        status: "rascunho",
        version: 1,
        isActiveVersion: true,
        dilutionRatio: input.dilutionRatio != null ? String(input.dilutionRatio) : null,
        minObserved: null,
        maxObserved: null,
        sampleCount: 0,
        lastCalibratedAt: null,
        notes: null,
        technicalReferenceQuantity: input.technicalReferenceQuantity != null ? String(input.technicalReferenceQuantity) : null,
        technicalReferenceSource: input.technicalReferenceSource ?? null,
      })
      .returning();
    return toSharedRecipeMatch(inserted);
  }

  async listSamples(recipeId: string): Promise<CalibrationSample[]> {
    const rows = await this.db().select().from(recipeCalibrationSamples).where(eq(recipeCalibrationSamples.recipeId, recipeId));
    return rows.map(toSample);
  }

  async addSample(input: NewSampleInput): Promise<CalibrationSample> {
    const [inserted] = await this.db()
      .insert(recipeCalibrationSamples)
      .values({
        recipeId: input.recipeId,
        serviceOrderExternalId: input.serviceOrderExternalId,
        date: input.date,
        quantityBefore: String(input.quantityBefore),
        quantityAfter: String(input.quantityAfter),
        preparedQuantity: input.preparedQuantity !== null ? String(input.preparedQuantity) : null,
        leftoverReused: input.leftoverReused !== null ? String(input.leftoverReused) : null,
        discarded: input.discarded !== null ? String(input.discarded) : null,
        dilutionRatio: input.dilutionRatio !== null ? String(input.dilutionRatio) : null,
        concentrateConsumed: String(input.concentrateConsumed),
        responsibleName: input.responsibleName,
        status: "valida",
        exclusionReason: null,
        notes: input.notes,
      })
      .returning();
    return toSample(inserted);
  }

  async updateSample(id: string, patch: SamplePatch): Promise<CalibrationSample> {
    const values: Partial<typeof recipeCalibrationSamples.$inferInsert> = { updatedAt: new Date() };
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.exclusionReason !== undefined) values.exclusionReason = patch.exclusionReason;

    const [updated] = await this.db().update(recipeCalibrationSamples).set(values).where(eq(recipeCalibrationSamples.id, id)).returning();
    if (!updated) throw new Error(`Amostra não encontrada: ${id}`);
    return toSample(updated);
  }
}
