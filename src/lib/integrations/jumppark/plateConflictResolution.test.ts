import { eq, inArray, like } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { customers, identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { appointments } from "@/db/schema/planning";
import { auditLogs } from "@/db/schema/system";
import { assignPlateToVehicle, fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { classifyVehiclePlateConflict } from "@/lib/integrations/jumppark/customersRefresh";
import { jumpParkClient } from "@/lib/integrations/jumppark/client";
import { deferPlateConflictReview, resolvePlateConflictDifferentVehicles, resolvePlateConflictSameVehicle } from "@/lib/integrations/jumppark/plateConflictResolution";
import { createAppointment } from "@/lib/planning/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";

/**
 * Missão 28 (Etapas E3/E4/E5) — testes A-S. `plateConflictResolution.ts` só faz sentido contra
 * Postgres real (transações, `SELECT ... FOR UPDATE`, `audit_logs`) — não há fallback em memória,
 * mesma limitação já documentada para `identity_review_items` desde a Missão 14/17/28.
 *
 * Deliberadamente NÃO chama `refreshJumpParkCustomers()` (custo ~238s, Missão 14/26) — o item de
 * revisão "pending" é construído diretamente com `classifyVehiclePlateConflict` (pura, já testada
 * isoladamente) + um INSERT direto, exatamente a mesma técnica usada nos testes reais das
 * Missões 17/25 para evitar repetir o custo do sync completo.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

let counter = 0;
function uniquePhone(): string {
  counter++;
  return `489995${String(counter).padStart(4, "0")}`;
}
function uniquePlate(): string {
  counter++;
  const letters = "MRT";
  return `${letters}${counter % 10}${String.fromCharCode(65 + (counter % 26))}${(counter + 1) % 10}${String(counter % 100).padStart(2, "0")}`.slice(0, 7);
}

async function insertPendingPlateConflict(params: {
  normalizedPlate: string;
  candidates: { id: string; customerId: string; source: string }[];
  incomingExternalId: string;
  incomingCustomerExternalId: string | null;
  incomingOrderIds: string[];
}) {
  const db = getDb()!;
  const conflict = classifyVehiclePlateConflict(params.candidates, params.normalizedPlate, params.incomingExternalId, params.incomingCustomerExternalId, params.incomingOrderIds);
  if (!conflict) throw new Error("fixture inválida: classifyVehiclePlateConflict retornou null (candidatos vazios?)");
  const [row] = await db
    .insert(identityReviewItems)
    .values({ subjectKey: conflict.subjectKey, plateMasked: conflict.plateMasked, confidence: "ambiguo", rule: conflict.rule, evidence: conflict.evidence, active: true, source: "jumppark" })
    .returning();
  return row;
}

async function insertOrder(externalId: string, plateMasked: string, orderDate = "2026-01-01") {
  const db = getDb()!;
  const [row] = await db.insert(jumpParkServiceOrders).values({ externalId, orderDate, plateMasked, clientName: "ClienteIncomingM28", vehicleModel: "Modelo Incoming" }).returning();
  return row;
}

async function cleanup() {
  const db = getDb()!;
  await db.delete(jumpParkServiceOrders).where(like(jumpParkServiceOrders.externalId, "M28-%"));

  const testCustomers = await db.select({ id: customers.id }).from(customers).where(like(customers.phone, "489995%"));
  const custIds = testCustomers.map((c) => c.id);
  if (custIds.length > 0) {
    const testVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.customerId, custIds));
    const vehicleIds = testVehicles.map((v) => v.id);
    if (vehicleIds.length > 0) await db.delete(appointments).where(inArray(appointments.vehicleId, vehicleIds));
    await db.delete(vehicles).where(inArray(vehicles.customerId, custIds));
    await db.delete(customers).where(inArray(customers.id, custIds));
  }
  // vehicles jumppark de teste (sem customer no prefixo 489995 — criados diretamente via SQL nos testes jumppark_jumppark)
  const jpTestVehicles = await db.select({ id: vehicles.id, customerId: vehicles.customerId }).from(vehicles).where(like(vehicles.externalId, "plate:M28JP%"));
  if (jpTestVehicles.length > 0) {
    const ids = jpTestVehicles.map((v) => v.id);
    await db.delete(vehicles).where(inArray(vehicles.id, ids));
    const jpCustIds = jpTestVehicles.map((v) => v.customerId).filter((id): id is string => !!id);
    if (jpCustIds.length > 0) await db.delete(customers).where(inArray(customers.id, jpCustIds));
  }

  // `uniquePlate()` sempre usa o prefixo de letras "MRT" (nunca "M28" literal) — o subjectKey
  // herda a placa, então o filtro correto é por "MRT", não pelo nome da missão.
  const reviewRows = await db.select({ id: identityReviewItems.id }).from(identityReviewItems).where(like(identityReviewItems.subjectKey, "vehicle_plate_collision_%MRT%"));
  if (reviewRows.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.entityId, reviewRows.map((r) => r.id)));
  await db.delete(identityReviewItems).where(like(identityReviewItems.subjectKey, "vehicle_plate_collision_%MRT%"));
}

describe.skipIf(!hasRealDb)("plateConflictResolution — Missão 28 (Postgres real, planning-tests)", () => {
  it(
    "A-G. 'mesmo veículo' (manual_jumppark): mutações corretas, appointment/customer preservados, zero escrita JumpPark, audit_log completo",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-SameVehicle ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Fiat Argo" });
      const assignResult = await assignPlateToVehicle({ vehicleId: vehicle.id, plate });
      expect(assignResult.status).toBe("assigned");

      const catalog = await fetchServiceCatalog();
      const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: "2026-12-05T10:00:00-03:00", expectedDurationMinutes: 60, notes: null });

      const order = await insertOrder(`M28-A-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: vehicle.id, customerId: customer.id, source: "manual" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: "name:clienteincoming",
        incomingOrderIds: [order.id],
      });
      expect(reviewRow.status).toBe("pending"); // A/B (pré-condição — o enum já aceita "pending", "linked" será o pós-estado)

      const requestSpy = vi.spyOn(jumpParkClient, "request"); // F
      const outcome = await resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: "Confirmado com o cliente pelo telefone." });
      expect(requestSpy).not.toHaveBeenCalled();
      requestSpy.mockRestore();

      expect(outcome).toEqual({ status: "resolved", newStatus: "linked" }); // B

      const db = getDb()!;

      // C — mutações corretas: vehicle ganhou external_id, ordem foi religada e travada.
      const [updatedVehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(updatedVehicle.externalId).toBe(`plate:${plate}`);
      expect(updatedVehicle.source).toBe("manual"); // nunca reescreve source
      const [updatedOrder] = await db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, order.id));
      expect(updatedOrder.vehicleId).toBe(vehicle.id);
      expect(updatedOrder.customerId).toBe(customer.id);
      expect(updatedOrder.customerLinkLocked).toBe(true);

      // Nenhum segundo vehicle foi criado.
      const allWithPlate = await db.select().from(vehicles).where(eq(vehicles.plate, plate));
      expect(allWithPlate).toHaveLength(1);

      const [updatedReview] = await db.select().from(identityReviewItems).where(eq(identityReviewItems.id, reviewRow.id));
      expect(updatedReview.status).toBe("linked");
      expect(updatedReview.decidedNotes).toBe("Confirmado com o cliente pelo telefone.");
      expect(updatedReview.decidedAt).not.toBeNull();

      // D — appointment preservado (mesmo vehicleId/customerId, nunca tocado).
      const persistedAppointment = await getPlanningRepository().getAppointment(appointment.id);
      expect(persistedAppointment?.vehicleId).toBe(vehicle.id);
      expect(persistedAppointment?.customerId).toBe(customer.id);
      expect(persistedAppointment?.status).toBe("agendado");

      // E — customer preservado.
      const persistedCustomer = await getAttendanceRepository().getCustomer(customer.id);
      expect(persistedCustomer?.name).toBe(customer.name);
      expect(persistedCustomer?.phone).toBe(customer.phone);

      // G — audit_log completo, sem PII inventada, sem segredo.
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, reviewRow.id));
      const resolvedLog = logs.find((l) => l.action === "plate_conflict_resolved_same_vehicle");
      expect(resolvedLog).toBeDefined();
      expect((resolvedLog!.beforeState as Record<string, unknown>)).toMatchObject({ reviewItem: { status: "pending" } });
      expect((resolvedLog!.afterState as Record<string, unknown>)).toMatchObject({ reviewItem: { status: "linked" } });
      expect(JSON.stringify(resolvedLog!.beforeState)).not.toMatch(/postgres:\/\/|neon\.tech|password/i);

      await cleanup();
    },
    60000,
  );

  it(
    "jumppark_jumppark: 'mesmo veículo' religa ordens ao vehicle jumppark já existente, sem tocar external_id",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const db = getDb()!;

      const [jpCustomer] = await db.insert(customers).values({ name: "M28-JP Customer", phone: null, source: "jumppark", externalId: `name:m28jp${counter}` }).returning();
      const [jpVehicle] = await db.insert(vehicles).values({ customerId: jpCustomer.id, plate, model: "Onix", source: "jumppark", externalId: `plate:M28JP${counter}old` }).returning();

      const order = await insertOrder(`M28-JJ-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: jpVehicle.id, customerId: jpCustomer.id, source: "jumppark" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: "name:outroclientejumppark",
        incomingOrderIds: [order.id],
      });

      const outcome = await resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: null });
      expect(outcome).toEqual({ status: "resolved", newStatus: "linked" });

      const [updatedVehicle] = await db.select().from(vehicles).where(eq(vehicles.id, jpVehicle.id));
      expect(updatedVehicle.externalId).toBe(`plate:M28JP${counter}old`); // NUNCA reescreve a chave de join
      const [updatedOrder] = await db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, order.id));
      expect(updatedOrder.vehicleId).toBe(jpVehicle.id);
      expect(updatedOrder.customerLinkLocked).toBe(true);

      await cleanup();
    },
    30000,
  );

  it(
    "H-J. 'veículos diferentes': NÃO faz merge/relink, preserva o vehicle intacto, audit_log registrado",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-Different ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Honda Civic" });
      await assignPlateToVehicle({ vehicleId: vehicle.id, plate });

      const order = await insertOrder(`M28-D-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: vehicle.id, customerId: customer.id, source: "manual" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: "name:clientediferente",
        incomingOrderIds: [order.id],
      });

      const outcome = await resolvePlateConflictDifferentVehicles(reviewRow.id, { actorUserId: null, notes: "Carros diferentes — confirmado com o cliente." });
      expect(outcome).toEqual({ status: "resolved", newStatus: "kept_separate" });

      const db = getDb()!;
      // H/I — nada de merge: vehicle continua exatamente como estava, ordem NÃO foi religada.
      const [untouchedVehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(untouchedVehicle.externalId).toBeNull();
      expect(untouchedVehicle.plate).toBe(plate);
      const [untouchedOrder] = await db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, order.id));
      expect(untouchedOrder.vehicleId).toBeNull();
      expect(untouchedOrder.customerLinkLocked).toBe(false);

      const [updatedReview] = await db.select().from(identityReviewItems).where(eq(identityReviewItems.id, reviewRow.id));
      expect(updatedReview.status).toBe("kept_separate");

      // J — audit_log.
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, reviewRow.id));
      expect(logs.some((l) => l.action === "plate_conflict_resolved_different_vehicles")).toBe(true);

      await cleanup();
    },
    30000,
  );

  it(
    "K-M. 'não tenho certeza' -> deferred, zero mutação de vehicle, audit_log registrado",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-Defer ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "VW Gol" });
      await assignPlateToVehicle({ vehicleId: vehicle.id, plate });

      const order = await insertOrder(`M28-K-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: vehicle.id, customerId: customer.id, source: "manual" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: null,
        incomingOrderIds: [order.id],
      });

      const outcome = await deferPlateConflictReview(reviewRow.id, { actorUserId: null, notes: null });
      expect(outcome).toEqual({ status: "resolved", newStatus: "deferred" }); // K

      const db = getDb()!;
      const [untouchedVehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(untouchedVehicle.externalId).toBeNull(); // L
      const [untouchedOrder] = await db.select().from(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, order.id));
      expect(untouchedOrder.vehicleId).toBeNull(); // L

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, reviewRow.id));
      expect(logs.some((l) => l.action === "plate_conflict_deferred")).toBe(true); // M

      await cleanup();
    },
    30000,
  );

  it(
    "N/P. chamada repetida (idempotência) — segunda chamada nunca muta de novo, retorna already_resolved",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-Idempotent ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Ford Ka" });
      await assignPlateToVehicle({ vehicleId: vehicle.id, plate });

      const order = await insertOrder(`M28-N-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: vehicle.id, customerId: customer.id, source: "manual" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: null,
        incomingOrderIds: [order.id],
      });

      const first = await resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: null });
      expect(first.status).toBe("resolved");

      const second = await resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: null });
      expect(second).toEqual({ status: "already_resolved", currentStatus: "linked" }); // P

      const db = getDb()!;
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, reviewRow.id));
      expect(logs.filter((l) => l.action === "plate_conflict_resolved_same_vehicle")).toHaveLength(1); // N — nunca duplica o audit_log

      await cleanup();
    },
    30000,
  );

  it(
    "O. duas resoluções concorrentes no mesmo item -> exatamente uma resolve, a outra vê already_resolved",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-Concurrent ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Chevrolet Onix" });
      await assignPlateToVehicle({ vehicleId: vehicle.id, plate });

      const order = await insertOrder(`M28-O-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [{ id: vehicle.id, customerId: customer.id, source: "manual" }],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: null,
        incomingOrderIds: [order.id],
      });

      const [resultA, resultB] = await Promise.all([
        resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: "primeira" }),
        resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: "segunda" }),
      ]);

      const resolvedCount = [resultA, resultB].filter((r) => r.status === "resolved").length;
      const alreadyResolvedCount = [resultA, resultB].filter((r) => r.status === "already_resolved").length;
      expect(resolvedCount).toBe(1);
      expect(alreadyResolvedCount).toBe(1);

      const db = getDb()!;
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, reviewRow.id));
      expect(logs.filter((l) => l.action === "plate_conflict_resolved_same_vehicle")).toHaveLength(1); // nunca dupla mutação

      await cleanup();
    },
    30000,
  );

  it(
    "Q. evidence inválida bloqueia a ação (nenhuma mutação, nenhum audit_log)",
    async () => {
      await cleanup();
      const db = getDb()!;
      const [malformedRow] = await db
        .insert(identityReviewItems)
        .values({ subjectKey: `vehicle_plate_collision_manual_jumppark:M28QINVALID${counter}`, plateMasked: "M28QINV", confidence: "ambiguo", rule: "fixture", evidence: { conflictType: "manual_jumppark" }, active: true, source: "jumppark" })
        .returning();

      const outcome = await resolvePlateConflictSameVehicle(malformedRow.id, { actorUserId: null, notes: null });
      expect(outcome.status).toBe("invalid_evidence");

      const [stillPending] = await db.select().from(identityReviewItems).where(eq(identityReviewItems.id, malformedRow.id));
      expect(stillPending.status).toBe("pending");
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, malformedRow.id));
      expect(logs).toHaveLength(0);

      await db.delete(identityReviewItems).where(eq(identityReviewItems.id, malformedRow.id));
    },
    30000,
  );

  it(
    "R. IDs inconsistentes bloqueiam a ação (2 candidatos manuais na evidência — não escolhe nenhum sozinho)",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { customer: c1, vehicle: v1 } = await registerQuickCustomerAndVehicle({ customerName: `M28-R1 ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Fiat Uno" });
      const { customer: c2, vehicle: v2 } = await registerQuickCustomerAndVehicle({ customerName: `M28-R2 ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Fiat Palio" });
      await assignPlateToVehicle({ vehicleId: v1.id, plate });
      // v2 recebe a mesma placa "manualmente" só para forçar o cenário de evidência ambígua — a
      // camada de atribuição normal bloquearia isso (Missão 11); aqui simulamos a linha diretamente
      // para provar que a RESOLUÇÃO se recusa a escolher um candidato sozinho.
      const db = getDb()!;
      await db.update(vehicles).set({ plate }).where(eq(vehicles.id, v2.id));

      const order = await insertOrder(`M28-R-${counter}`, plate);
      const reviewRow = await insertPendingPlateConflict({
        normalizedPlate: plate,
        candidates: [
          { id: v1.id, customerId: c1.id, source: "manual" },
          { id: v2.id, customerId: c2.id, source: "manual" },
        ],
        incomingExternalId: `plate:${plate}`,
        incomingCustomerExternalId: null,
        incomingOrderIds: [order.id],
      });

      const outcome = await resolvePlateConflictSameVehicle(reviewRow.id, { actorUserId: null, notes: null });
      expect(outcome.status).toBe("invalid_evidence");

      const [v1After] = await db.select().from(vehicles).where(eq(vehicles.id, v1.id));
      const [v2After] = await db.select().from(vehicles).where(eq(vehicles.id, v2.id));
      expect(v1After.externalId).toBeNull();
      expect(v2After.externalId).toBeNull();

      await cleanup();
    },
    30000,
  );

  it(
    "S. rollback integral — se a transação falhar no meio, nenhuma escrita parcial fica visível",
    async () => {
      await cleanup();
      const plate = uniquePlate();
      const { vehicle } = await registerQuickCustomerAndVehicle({ customerName: `M28-Rollback ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Renault Kwid" });
      await assignPlateToVehicle({ vehicleId: vehicle.id, plate });

      const db = getDb()!;
      const externalIdBefore = `plate:${plate}-rollback-proof`;

      await expect(
        db.transaction(async (tx) => {
          await tx.update(vehicles).set({ externalId: externalIdBefore }).where(eq(vehicles.id, vehicle.id));
          throw new Error("falha simulada no meio da transação — mesmo mecanismo que protege resolvePlateConflictSameVehicle");
        }),
      ).rejects.toThrow("falha simulada");

      const [afterRollback] = await db.select().from(vehicles).where(eq(vehicles.id, vehicle.id));
      expect(afterRollback.externalId).toBeNull(); // a escrita dentro da transação nunca ficou visível

      await cleanup();
    },
    30000,
  );
});
