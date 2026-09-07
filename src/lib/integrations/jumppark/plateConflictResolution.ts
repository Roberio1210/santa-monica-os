import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { auditLogs } from "@/db/schema/system";
import { normalizePlate } from "@/lib/crm/normalize";
import { parsePlateConflictReviewItem, type PlateConflictReviewRawRow } from "@/lib/integrations/jumppark/plateConflictEvidence";

/**
 * Missão 28 (Etapas E3/E4/E5) — as três decisões humanas para um conflito de placa. Cada função
 * é a ÚNICA fonte de mutação: recebe só `reviewItemId` (+ nota opcional) e RECONSULTA tudo no
 * banco dentro de uma transação travada (`SELECT ... FOR UPDATE`, mesmo padrão já usado e testado
 * em `src/lib/jumppark-orders/confirmation.ts`) — nunca confia em vehicle/customer/order id vindo
 * do cliente. Idempotente: item que não está mais `pending` no momento do lock retorna
 * `already_resolved` sem mutar nada. Toda decisão grava em `audit_logs` (já existente, sem
 * migration) dentro da MESMA transação da mutação.
 */

export interface PlateConflictActorContext {
  actorUserId: string | null;
  notes: string | null;
}

export type PlateConflictResolutionOutcome =
  | { status: "resolved"; newStatus: "linked" | "kept_separate" | "deferred" }
  | { status: "not_found" }
  | { status: "already_resolved"; currentStatus: string }
  | { status: "invalid_evidence"; reason: string };

/**
 * Traduz o resultado de uma resolução para o formato `{error, success}` que a UI usa
 * (`useActionState`, mesmo padrão de `reverseConsumptionAction` em `src/app/estoque/ordens/actions.ts`).
 * Vive aqui (não em `actions.ts`) porque um arquivo `"use server"` só pode exportar funções
 * async — esta é síncrona e pura, então fica no módulo de domínio, testável sem servidor.
 */
export interface PlateConflictActionState {
  error: string | null;
  success: string | null;
}

export function outcomeToActionState(outcome: PlateConflictResolutionOutcome, successMessage: string): PlateConflictActionState {
  switch (outcome.status) {
    case "resolved":
      return { error: null, success: successMessage };
    case "not_found":
      return { error: "Item de revisão não encontrado — pode já ter sido removido.", success: null };
    case "already_resolved":
      return { error: `Este item já foi decidido enquanto isso (status atual: "${outcome.currentStatus}"). A lista foi atualizada.`, success: null };
    case "invalid_evidence":
      return { error: `Não foi possível concluir: ${outcome.reason}`, success: null };
  }
}

type PlateConflictReviewRow = typeof identityReviewItems.$inferSelect;
type LoadedPlateConflict = {
  row: PlateConflictReviewRow;
  viewModel: Extract<ReturnType<typeof parsePlateConflictReviewItem>, { kind: "plateConflict" }>["viewModel"];
};
type LoadResult = { ok: true; data: LoadedPlateConflict } | { ok: false; outcome: PlateConflictResolutionOutcome };

/** Trava a linha (`FOR UPDATE`) e revalida, dentro da transação, que ainda é um conflito de placa válido e `pending`. */
async function loadPendingPlateConflictForUpdate(tx: DbOrTx, reviewItemId: string): Promise<LoadResult> {
  const [row] = await tx.select().from(identityReviewItems).where(eq(identityReviewItems.id, reviewItemId)).for("update").limit(1);
  if (!row) return { ok: false, outcome: { status: "not_found" } };

  const parsed = parsePlateConflictReviewItem(row as PlateConflictReviewRawRow);
  if (parsed.kind !== "plateConflict") {
    return { ok: false, outcome: { status: "invalid_evidence", reason: `Este item não é (ou não é mais) reconhecível como conflito de placa (${parsed.kind}).` } };
  }

  if (row.status !== "pending") {
    return { ok: false, outcome: { status: "already_resolved", currentStatus: row.status } };
  }

  return { ok: true, data: { row, viewModel: parsed.viewModel } };
}

async function writeResolutionAuditLog(
  tx: DbOrTx,
  params: { action: string; reviewItemId: string; actorUserId: string | null; notes: string | null; beforeState: Record<string, unknown>; afterState: Record<string, unknown> },
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: "identity_review_items",
    entityId: params.reviewItemId,
    beforeState: params.beforeState,
    afterState: params.afterState,
    source: "manual",
    notes: params.notes,
  });
}

function reviewItemSnapshot(row: PlateConflictReviewRow): Record<string, unknown> {
  return { status: row.status, decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null, decidedNotes: row.decidedNotes, evidence: row.evidence };
}

/**
 * E3 — "É o mesmo veículo". A operação mais sensível: nunca cria um segundo vehicle, nunca funde
 * customers, nunca apaga nada. Para `manual_jumppark`, anexa `external_id="plate:<placa>"` ao
 * vehicle manual (dali em diante o PASSO A do sync trata essa placa nativamente — a mesma técnica
 * de `linkOrderToCustomerAction`, Missão 28 legada). Para `jumppark_jumppark`, só religa as ordens
 * ao vehicle jumppark já existente, sem tocar `external_id` (nunca reescreve a chave de join).
 * Exige exatamente 1 candidato da origem esperada na evidência — mais de um (ou zero) é tratado
 * como evidência inconsistente, nunca escolhido arbitrariamente.
 */
export async function resolvePlateConflictSameVehicle(reviewItemId: string, context: PlateConflictActorContext): Promise<PlateConflictResolutionOutcome> {
  const db = getDb();
  if (!db) throw new Error("resolvePlateConflictSameVehicle exige DATABASE_URL configurada.");

  return db.transaction(async (tx) => {
    const loaded = await loadPendingPlateConflictForUpdate(tx, reviewItemId);
    if (!loaded.ok) return loaded.outcome;
    const { row, viewModel } = loaded.data;

    const wantedSource = viewModel.conflictType === "manual_jumppark" ? "manual" : "jumppark";
    const matches = viewModel.existingVehicles.filter((v) => v.source === wantedSource);
    if (matches.length !== 1) {
      return { status: "invalid_evidence", reason: `Esperado exatamente 1 veículo de origem "${wantedSource}" na evidência — encontrado ${matches.length}. Não é seguro decidir automaticamente qual é o correto.` };
    }
    const target = matches[0];

    const [targetVehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, target.vehicleId)).for("update").limit(1);
    if (!targetVehicle) {
      return { status: "invalid_evidence", reason: "O veículo referenciado nesta evidência não existe mais." };
    }
    if (targetVehicle.source !== wantedSource) {
      return { status: "invalid_evidence", reason: `O veículo referenciado mudou de origem (agora "${targetVehicle.source}") — evidência desatualizada, revise novamente.` };
    }
    if (normalizePlate(targetVehicle.plate) !== viewModel.normalizedPlate) {
      return { status: "invalid_evidence", reason: "A placa atual do veículo não corresponde mais à placa deste conflito — evidência desatualizada, revise novamente." };
    }
    if (wantedSource === "manual" && targetVehicle.externalId !== null) {
      return { status: "invalid_evidence", reason: "Este veículo manual já foi vinculado a uma identidade JumpPark por outra decisão." };
    }

    const orderIds = viewModel.incomingOrderIds;
    const beforeOrders = orderIds.length > 0 ? await tx.select().from(jumpParkServiceOrders).where(inArray(jumpParkServiceOrders.id, orderIds)) : [];
    const conflictingOrder = beforeOrders.find((o) => o.customerLinkLocked && o.vehicleId !== null && o.vehicleId !== target.vehicleId);
    if (conflictingOrder) {
      return { status: "invalid_evidence", reason: "Uma das ordens desta evidência já está vinculada a outro veículo por uma decisão diferente — possível resolução concorrente conflitante." };
    }

    if (wantedSource === "manual") {
      await tx.update(vehicles).set({ externalId: `plate:${viewModel.normalizedPlate}`, updatedAt: new Date() }).where(eq(vehicles.id, target.vehicleId));
    }
    if (orderIds.length > 0) {
      await tx
        .update(jumpParkServiceOrders)
        .set({ customerId: target.customerId, vehicleId: target.vehicleId, customerLinkLocked: true, updatedAt: new Date() })
        .where(inArray(jumpParkServiceOrders.id, orderIds));
    }

    const decidedAt = new Date();
    await tx.update(identityReviewItems).set({ status: "linked", decidedAt, decidedNotes: context.notes, updatedAt: decidedAt }).where(eq(identityReviewItems.id, reviewItemId));

    await writeResolutionAuditLog(tx, {
      action: "plate_conflict_resolved_same_vehicle",
      reviewItemId,
      actorUserId: context.actorUserId,
      notes: context.notes,
      beforeState: {
        reviewItem: reviewItemSnapshot(row),
        vehicle: { id: targetVehicle.id, externalId: targetVehicle.externalId, source: targetVehicle.source },
        orders: beforeOrders.map((o) => ({ id: o.id, customerId: o.customerId, vehicleId: o.vehicleId, customerLinkLocked: o.customerLinkLocked })),
      },
      afterState: {
        reviewItem: { status: "linked", decidedAt: decidedAt.toISOString(), decidedNotes: context.notes },
        vehicle: { id: targetVehicle.id, externalId: wantedSource === "manual" ? `plate:${viewModel.normalizedPlate}` : targetVehicle.externalId, source: targetVehicle.source },
        orders: orderIds.map((id) => ({ id, customerId: target.customerId, vehicleId: target.vehicleId, customerLinkLocked: true })),
      },
    });

    return { status: "resolved", newStatus: "linked" };
  });
}

/**
 * E4 — "São veículos diferentes". Nunca muta vehicle/customer/order — só registra a decisão
 * (`kept_separate`, mesmo status já usado pelo fluxo legado de ambiguidade de cliente). O escopo
 * da decisão fica implícito em `evidence.incomingOrderIds`, que permanece intocado — é exatamente
 * o que a regra de reabertura da Missão 25 (E1) compara a cada sync: uma ordem incoming NOVA que
 * não estava nesse conjunto reabre o item automaticamente, sem qualquer código adicional aqui.
 */
export async function resolvePlateConflictDifferentVehicles(reviewItemId: string, context: PlateConflictActorContext): Promise<PlateConflictResolutionOutcome> {
  const db = getDb();
  if (!db) throw new Error("resolvePlateConflictDifferentVehicles exige DATABASE_URL configurada.");

  return db.transaction(async (tx) => {
    const loaded = await loadPendingPlateConflictForUpdate(tx, reviewItemId);
    if (!loaded.ok) return loaded.outcome;
    const { row } = loaded.data;

    const decidedAt = new Date();
    await tx.update(identityReviewItems).set({ status: "kept_separate", decidedAt, decidedNotes: context.notes, updatedAt: decidedAt }).where(eq(identityReviewItems.id, reviewItemId));

    await writeResolutionAuditLog(tx, {
      action: "plate_conflict_resolved_different_vehicles",
      reviewItemId,
      actorUserId: context.actorUserId,
      notes: context.notes,
      beforeState: reviewItemSnapshot(row),
      afterState: { status: "kept_separate", decidedAt: decidedAt.toISOString(), decidedNotes: context.notes },
    });

    return { status: "resolved", newStatus: "kept_separate" };
  });
}

/**
 * E5 — "Não tenho certeza". Mapeia para `deferred` (já existente, mesmo significado de sempre —
 * "revisar depois"). Nenhuma mutação de vehicle/customer/order/appointment/JumpPark.
 */
export async function deferPlateConflictReview(reviewItemId: string, context: PlateConflictActorContext): Promise<PlateConflictResolutionOutcome> {
  const db = getDb();
  if (!db) throw new Error("deferPlateConflictReview exige DATABASE_URL configurada.");

  return db.transaction(async (tx) => {
    const loaded = await loadPendingPlateConflictForUpdate(tx, reviewItemId);
    if (!loaded.ok) return loaded.outcome;
    const { row } = loaded.data;

    const decidedAt = new Date();
    await tx.update(identityReviewItems).set({ status: "deferred", decidedAt, decidedNotes: context.notes, updatedAt: decidedAt }).where(eq(identityReviewItems.id, reviewItemId));

    await writeResolutionAuditLog(tx, {
      action: "plate_conflict_deferred",
      reviewItemId,
      actorUserId: context.actorUserId,
      notes: context.notes,
      beforeState: reviewItemSnapshot(row),
      afterState: { status: "deferred", decidedAt: decidedAt.toISOString(), decidedNotes: context.notes },
    });

    return { status: "resolved", newStatus: "deferred" };
  });
}
