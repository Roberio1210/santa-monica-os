import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { recipeCalibrationSamples, serviceConsumptionRules } from "@/db/schema";
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
  VehicleCategory,
} from "@/lib/recipes/types";
import type { InventoryUnit } from "@/lib/inventory/types";

function toRecipe(row: typeof serviceConsumptionRules.$inferSelect): Recipe {
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
    const rows = await this.db().select().from(serviceConsumptionRules).where(eq(serviceConsumptionRules.active, true));
    return rows.map(toRecipe);
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const rows = await this.db().select().from(serviceConsumptionRules).where(eq(serviceConsumptionRules.id, id)).limit(1);
    return rows[0] ? toRecipe(rows[0]) : null;
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
      })
      .returning();
    return toRecipe(inserted);
  }

  async updateRecipe(id: string, patch: RecipePatch): Promise<Recipe> {
    const values: Partial<typeof serviceConsumptionRules.$inferInsert> = { updatedAt: new Date() };
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

    const [updated] = await this.db().update(serviceConsumptionRules).set(values).where(eq(serviceConsumptionRules.id, id)).returning();
    if (!updated) throw new Error(`Receita não encontrada: ${id}`);
    return toRecipe(updated);
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
