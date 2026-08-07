"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";

/**
 * Ações manuais da fila "Identidades para revisar" (Missão 28) — nunca excluem ordens, nunca
 * fundem clientes fora desta decisão explícita, sempre reversíveis (decidir de novo troca o
 * status/vínculo livremente; nada aqui apaga uma ordem ou um cliente).
 */

function requireDb() {
  if (!isDatabaseConfigured()) throw new Error("Banco de dados (Neon) não configurado neste ambiente.");
  const db = getDb();
  if (!db) throw new Error("Banco de dados (Neon) não configurado neste ambiente.");
  return db;
}

/**
 * "Vincular" — liga UMA ordem sem cliente identificado a UM dos clientes candidatos daquela
 * placa. Trava a ordem (`customer_link_locked = true`) para que o próximo recálculo automático
 * (a cada sincronização) nunca desfaça esta decisão sozinho. Também vincula o veículo daquela
 * placa, quando já existir um registro `vehicles` para ela.
 */
export async function linkOrderToCustomerAction(formData: FormData): Promise<void> {
  const db = requireDb();
  const orderId = String(formData.get("orderId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const plateMasked = String(formData.get("plateMasked") ?? "");
  if (!orderId || !customerId) throw new Error("Ordem ou cliente não identificado.");

  const vehicleRows = plateMasked ? await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.externalId, `plate:${plateMasked}`)).limit(1) : [];
  const vehicleId = vehicleRows[0]?.id ?? null;

  await db
    .update(jumpParkServiceOrders)
    .set({ customerId, vehicleId, customerLinkLocked: true, updatedAt: new Date() })
    .where(eq(jumpParkServiceOrders.id, orderId));

  revalidatePath("/ordens/clientes/revisao");
  revalidatePath("/ordens/clientes");
  revalidatePath(`/ordens/clientes/${customerId}`);
  redirect("/ordens/clientes/revisao");
}

/**
 * "Manter separados" — decisão explícita de que os clientes candidatos desta placa SÃO pessoas
 * diferentes (ex.: carro emprestado, casal que usa o mesmo carro). Não toca em nenhuma ordem —
 * só registra a decisão no item da fila, para não continuar aparecendo como pendente.
 */
export async function keepSeparateAction(formData: FormData): Promise<void> {
  const db = requireDb();
  const itemId = String(formData.get("itemId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!itemId) throw new Error("Item da fila não identificado.");

  await db.update(identityReviewItems).set({ status: "kept_separate", decidedAt: new Date(), decidedNotes: notes, updatedAt: new Date() }).where(eq(identityReviewItems.id, itemId));

  revalidatePath("/ordens/clientes/revisao");
  redirect("/ordens/clientes/revisao");
}

/** "Revisar depois" — adia a decisão sem descartar o item; ele continua na fila, só marcado como já visto. Reversível a qualquer momento (nova decisão sobrescreve). */
export async function deferReviewAction(formData: FormData): Promise<void> {
  const db = requireDb();
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Item da fila não identificado.");

  await db.update(identityReviewItems).set({ status: "deferred", decidedAt: new Date(), updatedAt: new Date() }).where(eq(identityReviewItems.id, itemId));

  revalidatePath("/ordens/clientes/revisao");
  redirect("/ordens/clientes/revisao");
}

/** Reabre um item já decidido (volta para `pending`) — a reversibilidade exigida pela Missão 28: nenhuma decisão manual é definitiva. */
export async function reopenReviewAction(formData: FormData): Promise<void> {
  const db = requireDb();
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Item da fila não identificado.");

  await db.update(identityReviewItems).set({ status: "pending", decidedAt: null, decidedNotes: null, updatedAt: new Date() }).where(eq(identityReviewItems.id, itemId));

  revalidatePath("/ordens/clientes/revisao");
  redirect("/ordens/clientes/revisao");
}
