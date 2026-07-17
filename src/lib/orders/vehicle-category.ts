import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { vehicleCategoryAssignments } from "@/db/schema";
import { normalizePlate } from "@/lib/orders/plate";
import type { OrderVehicleCategory, VehicleCategoryAssignment } from "@/lib/orders/types";

function toAssignment(row: typeof vehicleCategoryAssignments.$inferSelect): VehicleCategoryAssignment {
  return {
    id: row.id,
    plateNormalized: row.plateNormalized,
    category: row.category as OrderVehicleCategory,
    previousCategory: row.previousCategory as OrderVehicleCategory | null,
    responsibleName: row.responsibleName,
    changedAt: row.changedAt ? row.changedAt.toISOString() : null,
    reason: row.reason,
    notes: row.notes,
  };
}

export async function listVehicleCategoryAssignments(): Promise<VehicleCategoryAssignment[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(vehicleCategoryAssignments).where(eq(vehicleCategoryAssignments.active, true));
  return rows.map(toAssignment);
}

/** "desconhecido" quando a placa nunca foi classificada — nunca inventa uma categoria pelo texto do modelo. */
export async function getVehicleCategory(plate: string | null): Promise<OrderVehicleCategory> {
  const normalized = normalizePlate(plate);
  if (!normalized) return "desconhecido";

  const db = getDb();
  if (!db) return "desconhecido";

  const [row] = await db.select().from(vehicleCategoryAssignments).where(eq(vehicleCategoryAssignments.plateNormalized, normalized)).limit(1);
  return row ? (row.category as OrderVehicleCategory) : "desconhecido";
}

/**
 * Confirmação manual de categoria — sempre auditável: registra categoria anterior, responsável,
 * data e motivo. Nunca confirma automaticamente pelo texto do modelo.
 */
export async function setVehicleCategory(plate: string, category: OrderVehicleCategory, responsibleName: string, reason: string): Promise<VehicleCategoryAssignment> {
  const normalized = normalizePlate(plate);
  if (!normalized) throw new Error("Placa inválida.");
  if (category === "desconhecido") throw new Error("Não é possível confirmar a categoria como 'desconhecido' — isso já é o padrão.");
  if (!responsibleName.trim()) throw new Error("Responsável é obrigatório.");
  if (!reason.trim()) throw new Error("Motivo é obrigatório.");

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const [existing] = await db.select().from(vehicleCategoryAssignments).where(eq(vehicleCategoryAssignments.plateNormalized, normalized)).limit(1);
  const previousCategory = existing ? (existing.category as OrderVehicleCategory) : null;

  if (existing) {
    const [updated] = await db
      .update(vehicleCategoryAssignments)
      .set({ category, previousCategory, responsibleName: responsibleName.trim(), changedAt: new Date(), reason: reason.trim(), updatedAt: new Date() })
      .where(eq(vehicleCategoryAssignments.id, existing.id))
      .returning();
    return toAssignment(updated);
  }

  const [created] = await db
    .insert(vehicleCategoryAssignments)
    .values({
      plateNormalized: normalized,
      category,
      previousCategory: null,
      responsibleName: responsibleName.trim(),
      changedAt: new Date(),
      reason: reason.trim(),
      source: "manual",
    })
    .returning();
  return toAssignment(created);
}
