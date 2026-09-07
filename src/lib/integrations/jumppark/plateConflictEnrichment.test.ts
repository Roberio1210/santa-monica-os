import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { enrichPlateConflictReviewItem } from "./plateConflictEnrichment";
import type { PlateConflictReviewViewModel } from "./plateConflictEvidence";
import { getPlanningRepository } from "@/lib/planning/repository-factory";

/**
 * Missão 19 (Etapa C do design da Missão 16) — testes do enrichment read-only. Roda contra o
 * repositório em memória por padrão (sem `TEST_DATABASE_URL`), como `assignPlateToVehicle.test.ts`
 * (Missão 11). O único bloco que precisa de Postgres real (busca de `jumppark_service_orders` por
 * id — não há implementação em memória para essa consulta, por desenho) fica isolado e gateado por
 * `hasRealDb`, com fixtures exclusivos e cleanup completo.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

/** Marca um vehicle como source='jumppark' — mesmo helper usado em `assignPlateToVehicle.test.ts`. */
async function markAsJumpParkSource(vehicleId: string): Promise<void> {
  const db = getDb();
  if (db) {
    const { vehicles } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(vehicles).set({ source: "jumppark" }).where(eq(vehicles.id, vehicleId));
    return;
  }
  const row = await getAttendanceRepository().getVehicle(vehicleId);
  if (row) row.source = "jumppark";
}

async function makeVehicle() {
  const repo = getAttendanceRepository();
  const suffix = randomUUID();
  const customer = await repo.createCustomer({ name: `Cliente M19 ${suffix}`, phone: `48999${Math.floor(Math.random() * 900000 + 100000)}` });
  const vehicle = await repo.createVehicle({ customerId: customer.id, plate: null, brand: "Marca Teste", model: "Modelo Teste", year: null, color: "Preto" });
  return { customer, vehicle };
}

function baseViewModel(overrides: Partial<PlateConflictReviewViewModel> = {}): PlateConflictReviewViewModel {
  return {
    reviewItemId: `review-${randomUUID()}`,
    subjectKey: `vehicle_plate_collision_manual_jumppark:MQT${randomUUID().slice(0, 4)}`,
    status: "pending",
    conflictType: "manual_jumppark",
    normalizedPlate: "MQT1A01",
    displayPlate: "MQT1A01",
    existingVehicles: [],
    incomingOrderIds: [],
    decidedAt: null,
    decidedNotes: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("enrichPlateConflictReviewItem — Missão 19 (Etapa C)", () => {
  it("A. manual_jumppark com vehicle/customer encontrados -> dados atuais presentes", async () => {
    const { customer, vehicle } = await makeVehicle();
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles).toHaveLength(1);
    const ev = enriched.existingVehicles[0];
    expect(ev.unavailable).toBe(false);
    expect(ev.plate).toBe(vehicle.plate);
    expect(ev.model).toBe(vehicle.model);
    expect(ev.brand).toBe(vehicle.brand);
    expect(ev.source).toBe("manual");
    expect(ev.customer?.id).toBe(customer.id);
    expect(ev.customer?.name).toBe(customer.name);
    expect(ev.customer?.phone).toBe(customer.phone);
  });

  it("B. appointment futuro encontrado -> presente no ViewModel enriquecido", async () => {
    const { customer, vehicle } = await makeVehicle();
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const appt = await getPlanningRepository().createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: "dev-lavacao", scheduledAt: future, expectedDurationMinutes: null });
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles[0].appointment?.id).toBe(appt.id);
    expect(enriched.existingVehicles[0].appointment?.serviceName).toBe("Lavação Completa");
    expect(enriched.existingVehicles[0].appointment?.status).toBe("agendado");
  });

  it("C. mais de um appointment futuro -> escolhe o mais próximo por scheduledAt", async () => {
    const { customer, vehicle } = await makeVehicle();
    const planningRepo = getPlanningRepository();
    const far = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const near = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();
    await planningRepo.createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: "dev-lavacao", scheduledAt: far, expectedDurationMinutes: null });
    const nearAppt = await planningRepo.createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: "dev-polimento", scheduledAt: near, expectedDurationMinutes: null });
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles[0].appointment?.id).toBe(nearAppt.id);
  });

  it("D. appointment cancelado não é selecionado", async () => {
    const { customer, vehicle } = await makeVehicle();
    const planningRepo = getPlanningRepository();
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const appt = await planningRepo.createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: "dev-lavacao", scheduledAt: future, expectedDurationMinutes: null });
    await planningRepo.updateAppointmentStatus(appt.id, "cancelado");
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles[0].appointment).toBeNull();
  });

  it("E. sem nenhum appointment -> null, sem crash", async () => {
    const { customer, vehicle } = await makeVehicle();
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles[0].appointment).toBeNull();
  });

  it("G. incoming order ausente -> unavailable, sem crash", async () => {
    const vm = baseViewModel({ incomingOrderIds: ["order-que-nao-existe-nesta-missao"] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.incomingOrders).toHaveLength(1);
    expect(enriched.incomingOrders[0].unavailable).toBe(true);
    expect(enriched.incomingOrders[0].orderId).toBe("order-que-nao-existe-nesta-missao");
    expect(enriched.incomingOrders[0].externalId).toBeNull();
  });

  it("H. jumppark_jumppark -> lados distinguíveis, nenhuma reconciliação", async () => {
    const { customer: c1, vehicle: v1 } = await makeVehicle();
    await markAsJumpParkSource(v1.id);
    const { customer: c2, vehicle: v2 } = await makeVehicle();
    await markAsJumpParkSource(v2.id);
    const vm = baseViewModel({
      conflictType: "jumppark_jumppark",
      existingVehicles: [
        { vehicleId: v1.id, customerId: c1.id, source: "jumppark" },
        { vehicleId: v2.id, customerId: c2.id, source: "jumppark" },
      ],
    });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles).toHaveLength(2);
    expect(enriched.existingVehicles.map((v) => v.vehicleId)).toEqual([v1.id, v2.id]);
    expect(enriched.existingVehicles.map((v) => v.customer?.id)).toEqual([c1.id, c2.id]);
  });

  it("I. múltiplos candidates (manual + jumppark) -> todos enriquecidos, nenhum reduzido", async () => {
    const { customer: c1, vehicle: v1 } = await makeVehicle();
    const { customer: c2, vehicle: v2 } = await makeVehicle();
    await markAsJumpParkSource(v2.id);
    const vm = baseViewModel({
      existingVehicles: [
        { vehicleId: v1.id, customerId: c1.id, source: "manual" },
        { vehicleId: v2.id, customerId: c2.id, source: "jumppark" },
      ],
    });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles).toHaveLength(2);
    expect(enriched.existingVehicles.every((v) => !v.unavailable)).toBe(true);
  });

  it("J. vehicle ausente -> unavailable true, sem crash, nada inventado", async () => {
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: "vehicle-que-nao-existe", customerId: "customer-x", source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    const ev = enriched.existingVehicles[0];
    expect(ev.unavailable).toBe(true);
    expect(ev.plate).toBeNull();
    expect(ev.model).toBeNull();
    expect(ev.customer).toBeNull();
    expect(ev.appointment).toBeNull();
  });

  it("K. customer ausente (vehicle encontrado, customerId sem registro) -> customer null, sem crash", async () => {
    const repo = getAttendanceRepository();
    const vehicle = await repo.createVehicle({ customerId: randomUUID(), plate: null, brand: "X", model: "Y", year: null, color: null });
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: vehicle.customerId, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    const ev = enriched.existingVehicles[0];
    expect(ev.unavailable).toBe(false);
    expect(ev.customer).toBeNull();
  });

  it("L. service ausente (serviceId sem correspondência no catálogo) -> não crasha, fallback seguro", async () => {
    const { customer, vehicle } = await makeVehicle();
    const future = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();
    await getPlanningRepository().createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: "servico-inexistente", scheduledAt: future, expectedDurationMinutes: null });
    const vm = baseViewModel({ existingVehicles: [{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }] });
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles[0].appointment).not.toBeNull();
    expect(typeof enriched.existingVehicles[0].appointment?.serviceName).toBe("string");
  });

  it("existingVehicles/incomingOrderIds vazios (herdado da Missão 18) -> ViewModel enriquecido vazio, sem crash", async () => {
    const vm = baseViewModel({});
    const enriched = await enrichPlateConflictReviewItem(vm);
    expect(enriched.existingVehicles).toEqual([]);
    expect(enriched.incomingOrders).toEqual([]);
  });

  it("M/N/O. nenhuma escrita em DB, nenhuma chamada externa JumpPark, nenhum sync — auditoria estrutural do módulo", () => {
    const source = readFileSync(path.join(__dirname, "plateConflictEnrichment.ts"), "utf8");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(source).not.toMatch(/jumpParkClient|refreshJumpParkCustomers|customersRefresh/);
  });

  it("P. parser da Missão 18 continua puro e sem DB — auditoria estrutural", () => {
    const source = readFileSync(path.join(__dirname, "plateConflictEvidence.ts"), "utf8");
    expect(source).not.toMatch(/@\/db\/client|getDb|repository-factory/);
  });
});

describe.skipIf(!hasRealDb)("enrichPlateConflictReviewItem — incoming orders via Postgres real (planning-tests)", () => {
  const testExternalId = `M19-${randomUUID()}`;
  let insertedOrderId: string | null = null;

  it("F. incomingOrderIds encontrados -> dados da ordem incoming presentes, sem chamar API externa", async () => {
    const db = getDb();
    if (!isDatabaseConfigured() || !db) throw new Error("TEST_DATABASE_URL não configurada — este teste não deveria rodar (gateado por hasRealDb).");

    const [row] = await db
      .insert(jumpParkServiceOrders)
      .values({
        externalId: testExternalId,
        orderDate: "2026-01-01",
        plateMasked: "MQT9Z99",
        vehicleModel: "Modelo Incoming Teste",
        clientName: "Cliente Incoming Teste M19",
        clientPhoneMasked: "4899****999",
        source: "jumppark",
      })
      .returning();
    insertedOrderId = row.id;

    try {
      const vm = baseViewModel({ incomingOrderIds: [row.id] });
      const enriched = await enrichPlateConflictReviewItem(vm);
      expect(enriched.incomingOrders).toHaveLength(1);
      const order = enriched.incomingOrders[0];
      expect(order.unavailable).toBe(false);
      expect(order.externalId).toBe(testExternalId);
      expect(order.plateMasked).toBe("MQT9Z99");
      expect(order.vehicleModel).toBe("Modelo Incoming Teste");
      expect(order.clientName).toBe("Cliente Incoming Teste M19");
    } finally {
      if (insertedOrderId) {
        const { eq } = await import("drizzle-orm");
        await db.delete(jumpParkServiceOrders).where(eq(jumpParkServiceOrders.id, insertedOrderId));
        insertedOrderId = null;
      }
    }
  });
});
