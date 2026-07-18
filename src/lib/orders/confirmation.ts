import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryConsumptionConfirmations, inventoryConsumptionLines, inventoryItems, inventoryMovements } from "@/db/schema";
import { applyMovementDelta } from "@/lib/inventory/movement-math";
import type { ProcessStep } from "@/lib/recipes/types";
import type { ConsumptionConfirmationStatus, OrderVehicleCategory } from "@/lib/orders/types";

/**
 * Drizzle envolve o erro real do Postgres em DrizzleQueryError — o código do erro (23505 =
 * unique_violation) fica em `err.cause.code`, não em `err.code` diretamente.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

export interface ConfirmConsumptionLineInput {
  itemId: string;
  recipeId: string | null;
  processStep: ProcessStep | null;
  /** null quando o item foi adicionado extra (sem receita) — nunca inventado. */
  expectedQuantity: number | null;
  /** Consumo real ajustado pelo responsável — é o valor efetivamente baixado do estoque. */
  confirmedQuantity: number;
  /** Obrigatória quando a quantidade diverge do esperado ou o item é extra. */
  justification: string | null;
  isExtra: boolean;
}

export interface RemovedItemLog {
  itemName: string;
  recipeId: string | null;
  reason: string;
}

export interface ConfirmConsumptionInput {
  externalId: string;
  vehicleCategory: OrderVehicleCategory;
  responsibleName: string;
  /** Justificativa geral — obrigatória quando isPartial. */
  justification: string | null;
  lines: ConfirmConsumptionLineInput[];
  removedItemsLog: RemovedItemLog[];
  isPartial: boolean;
}

export interface ConfirmConsumptionResult {
  confirmationId: string;
  status: ConsumptionConfirmationStatus;
  /** true quando esta chamada só retornou uma confirmação já existente (idempotência), sem criar nada novo. */
  alreadyExisted: boolean;
}

/**
 * Confirmação transacional de consumo (Fase D, seções 5–7). Ou grava tudo (confirmação +
 * todas as linhas + todos os movimentos), ou não grava nada. Nunca permite saldo negativo
 * silencioso — cada linha é validada dentro da mesma transação, antes de qualquer commit.
 * Idempotente via `idempotency_key` (UNIQUE no banco): duas requisições concorrentes para a
 * mesma ordem nunca produzem duas baixas — a segunda sempre recebe o registro já criado pela
 * primeira.
 */
export async function confirmOrderConsumption(input: ConfirmConsumptionInput): Promise<ConfirmConsumptionResult> {
  if (!input.responsibleName.trim()) throw new Error("Responsável é obrigatório.");
  if (input.vehicleCategory === "desconhecido") throw new Error("Categoria do veículo precisa estar confirmada antes de gerar consumo.");
  if (input.lines.length === 0) throw new Error("Nenhum item para confirmar.");
  if (input.isPartial && !input.justification?.trim()) throw new Error("Confirmação parcial exige justificativa.");

  for (const line of input.lines) {
    if (!Number.isFinite(line.confirmedQuantity) || line.confirmedQuantity <= 0) {
      throw new Error("Quantidade confirmada deve ser maior que zero em todos os itens.");
    }
    const diverges = line.expectedQuantity === null || Math.abs(line.confirmedQuantity - line.expectedQuantity) > 0.001;
    if ((diverges || line.isExtra) && !line.justification?.trim()) {
      throw new Error("Justificativa obrigatória para item com quantidade ajustada ou item extra.");
    }
  }

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const existing = await db
    .select()
    .from(inventoryConsumptionConfirmations)
    .where(eq(inventoryConsumptionConfirmations.jumpparkOrderExternalId, input.externalId))
    .orderBy(desc(inventoryConsumptionConfirmations.version));

  const latest = existing[0];
  if (latest && latest.status !== "estornada") {
    return { confirmationId: latest.id, status: latest.status as ConsumptionConfirmationStatus, alreadyExisted: true };
  }

  const version = latest ? latest.version + 1 : 1;
  const idempotencyKey = `${input.externalId}:v${version}`;
  const status: ConsumptionConfirmationStatus = input.isPartial ? "parcial" : "confirmada";
  const today = new Date().toISOString().slice(0, 10);

  try {
    const confirmationId = await db.transaction(async (tx) => {
      const [confirmation] = await tx
        .insert(inventoryConsumptionConfirmations)
        .values({
          jumpparkOrderExternalId: input.externalId,
          version,
          vehicleCategory: input.vehicleCategory,
          status,
          responsibleName: input.responsibleName.trim(),
          justification: input.justification?.trim() || null,
          removedItemsLog: input.removedItemsLog.length > 0 ? input.removedItemsLog : null,
          idempotencyKey,
          source: "jumppark",
        })
        .returning();

      for (const line of input.lines) {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, line.itemId)).limit(1);
        if (!item) throw new Error(`Produto não encontrado: ${line.itemId}`);

        const previousBalance = Number(item.currentQuantity);
        const newBalance = applyMovementDelta(previousBalance, "consumo_interno", line.confirmedQuantity);
        if (newBalance < 0) {
          throw new Error(
            `Consumo de ${item.name} (${line.confirmedQuantity} ${item.unit}) deixaria o saldo negativo (${previousBalance} ${item.unit} disponível). Ajuste a quantidade ou faça um ajuste de inventário antes de confirmar.`,
          );
        }

        await tx.update(inventoryItems).set({ currentQuantity: String(newBalance), updatedAt: new Date() }).where(eq(inventoryItems.id, line.itemId));

        const [movement] = await tx
          .insert(inventoryMovements)
          .values({
            itemId: line.itemId,
            type: "consumo_interno",
            quantity: String(line.confirmedQuantity),
            unit: item.unit,
            date: today,
            responsible: input.responsibleName.trim(),
            reference: `CONSUMO-${input.externalId}`,
            previousBalance: String(previousBalance),
            newBalance: String(newBalance),
            source: "jumppark",
            notes: line.justification,
          })
          .returning();

        await tx.insert(inventoryConsumptionLines).values({
          confirmationId: confirmation.id,
          itemId: line.itemId,
          recipeId: line.recipeId,
          processStep: line.processStep,
          expectedQuantity: line.expectedQuantity !== null ? String(line.expectedQuantity) : null,
          confirmedQuantity: String(line.confirmedQuantity),
          unit: item.unit,
          previousBalance: String(previousBalance),
          newBalance: String(newBalance),
          movementId: movement.id,
          isExtra: line.isExtra,
          lineJustification: line.justification,
          source: "jumppark",
        });
      }

      return confirmation.id;
    });

    return { confirmationId, status, alreadyExisted: false };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      const [row] = await db.select().from(inventoryConsumptionConfirmations).where(eq(inventoryConsumptionConfirmations.idempotencyKey, idempotencyKey)).limit(1);
      if (row) return { confirmationId: row.id, status: row.status as ConsumptionConfirmationStatus, alreadyExisted: true };
    }
    throw err;
  }
}

/**
 * Estorno seguro (Fase D, seção 8). Nunca apaga nem edita os movimentos originais — só cria
 * movimentos "devolucao" novos e marca a confirmação como estornada. `SELECT ... FOR UPDATE`
 * bloqueia a linha durante a transação: duas tentativas concorrentes de estornar a mesma
 * confirmação nunca passam as duas.
 */
export async function reverseOrderConsumption(confirmationId: string, responsibleName: string, reason: string): Promise<void> {
  if (!responsibleName.trim()) throw new Error("Responsável é obrigatório.");
  if (!reason.trim()) throw new Error("Motivo do estorno é obrigatório.");

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const today = new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    const [confirmation] = await tx.select().from(inventoryConsumptionConfirmations).where(eq(inventoryConsumptionConfirmations.id, confirmationId)).for("update").limit(1);
    if (!confirmation) throw new Error("Confirmação não encontrada.");
    if (confirmation.status === "estornada") throw new Error("Esta confirmação já foi estornada — não é possível estornar duas vezes.");

    const lines = await tx.select().from(inventoryConsumptionLines).where(eq(inventoryConsumptionLines.confirmationId, confirmationId));

    for (const line of lines) {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, line.itemId)).limit(1);
      if (!item) throw new Error(`Produto não encontrado: ${line.itemId}`);

      const previousBalance = Number(item.currentQuantity);
      const newBalance = applyMovementDelta(previousBalance, "devolucao", Number(line.confirmedQuantity));

      await tx.update(inventoryItems).set({ currentQuantity: String(newBalance), updatedAt: new Date() }).where(eq(inventoryItems.id, line.itemId));

      const [reversalMovement] = await tx
        .insert(inventoryMovements)
        .values({
          itemId: line.itemId,
          type: "devolucao",
          quantity: line.confirmedQuantity,
          unit: line.unit,
          date: today,
          responsible: responsibleName.trim(),
          reference: `ESTORNO-CONSUMO-${confirmation.jumpparkOrderExternalId}`,
          previousBalance: String(previousBalance),
          newBalance: String(newBalance),
          source: "jumppark",
          notes: reason.trim(),
        })
        .returning();

      await tx.update(inventoryConsumptionLines).set({ reversalMovementId: reversalMovement.id, updatedAt: new Date() }).where(eq(inventoryConsumptionLines.id, line.id));
    }

    await tx
      .update(inventoryConsumptionConfirmations)
      .set({ status: "estornada", reversedAt: new Date(), reversedBy: responsibleName.trim(), reversalReason: reason.trim(), updatedAt: new Date() })
      .where(eq(inventoryConsumptionConfirmations.id, confirmationId));
  });
}
