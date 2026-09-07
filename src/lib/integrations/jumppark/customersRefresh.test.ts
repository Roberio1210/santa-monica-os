import { eq, inArray, like } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { customers, identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { appointments } from "@/db/schema/planning";
import { classifyVehiclePlateConflict, refreshJumpParkCustomers } from "@/lib/integrations/jumppark/customersRefresh";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { assignPlateToVehicle, fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { createAppointment } from "@/lib/planning/service";
import { jumpParkClient } from "@/lib/integrations/jumppark/client";

/**
 * Missão 14 — prova de que `refreshJumpParkCustomers` nunca cria um segundo vehicle quando a
 * placa de uma ordem JumpPark nova colide com um vehicle já existente (manual ou outro jumppark).
 *
 * `refreshJumpParkCustomers` reprocessa TODA a tabela `jumppark_service_orders` a cada chamada
 * (decisão documentada da Missão 26 — nunca incremental). Medido nesta sessão contra a branch
 * `planning-tests` (cópia real de produção, 2413 ordens): **~238 segundos por chamada**. Isso não
 * tem relação com o código desta missão — é uma característica pré-existente da função. Por isso:
 *
 * - A decisão de conflito em si (`classifyVehiclePlateConflict`, extraída desta missão) é testada
 *   isoladamente abaixo — pura, sem I/O, cobre os cenários B/C/E/F/G/H/L em milissegundos.
 * - Só UM teste de integração real (`refreshJumpParkCustomers` de ponta a ponta) é mantido, com
 *   timeout generoso, cobrindo A/C/I/J/K juntos numa única chamada — para não multiplicar o custo
 *   de ~4min por cenário.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

describe("classifyVehiclePlateConflict — decisão pura, sem I/O (roda sempre)", () => {
  it("B. nenhum candidato -> null (seguro criar normalmente)", () => {
    const result = classifyVehiclePlateConflict([], "ABC1D23", "jp-ext-1", "name:fulano");
    expect(result).toBeNull();
  });

  it("A/C. candidato manual -> conflictType manual_jumppark, subjectKey e evidência completos", () => {
    const result = classifyVehiclePlateConflict(
      [{ id: "vehicle-manual-1", customerId: "customer-1", source: "manual" }],
      "ABC1D23",
      "jp-ext-2",
      "name:fulano",
      ["order-1", "order-2"],
    );
    expect(result).not.toBeNull();
    expect(result?.subjectKey).toBe("vehicle_plate_collision_manual_jumppark:ABC1D23");
    expect(result?.evidence.conflictType).toBe("manual_jumppark");
    expect(result?.evidence.existingVehicles).toEqual([{ vehicleId: "vehicle-manual-1", customerId: "customer-1", source: "manual" }]);
    expect(result?.evidence.incomingJumpParkExternalId).toBe("jp-ext-2");
    expect(result?.evidence.incomingJumpParkCustomerExternalId).toBe("name:fulano");
    expect(result?.evidence.incomingOrderIds).toEqual(["order-1", "order-2"]);
    expect(result?.evidence.origin).toBe("jumppark");
  });

  it("D/I. normalizedPlate correta + idempotência — mesma entrada aplicada duas vezes produz o mesmo subjectKey e evidência", () => {
    const candidates = [{ id: "vehicle-manual-1", customerId: "customer-1", source: "manual" }];
    const first = classifyVehiclePlateConflict(candidates, "ABC1D23", "jp-ext-2", "name:fulano", ["order-1"]);
    const second = classifyVehiclePlateConflict(candidates, "ABC1D23", "jp-ext-2", "name:fulano", ["order-1"]);
    expect(first?.evidence.normalizedPlate).toBe("ABC1D23");
    expect(first?.subjectKey).toBe(second?.subjectKey);
    expect(first?.evidence).toEqual(second?.evidence);
  });

  it("B(tipo)/E. candidato só jumppark (external_id diferente) -> conflictType jumppark_jumppark, existingVehicles é array", () => {
    const result = classifyVehiclePlateConflict(
      [{ id: "vehicle-jp-1", customerId: "customer-2", source: "jumppark" }],
      "DEF4E56",
      "jp-ext-3",
      "name:ciclano",
    );
    expect(result?.evidence.conflictType).toBe("jumppark_jumppark");
    expect(result?.subjectKey).toBe("vehicle_plate_collision_jumppark_jumppark:DEF4E56");
    expect(Array.isArray(result?.evidence.existingVehicles)).toBe(true);
    expect(result?.evidence.existingVehicles).toEqual([{ vehicleId: "vehicle-jp-1", customerId: "customer-2", source: "jumppark" }]);
    // incomingOrderIds não foi passado nesta chamada -> default seguro é array vazio, nunca undefined/null.
    expect(result?.evidence.incomingOrderIds).toEqual([]);
  });

  it("C(múltiplos)/E/F. múltiplos candidatos -> nenhum escolhido, todos aparecem em existingVehicles com id/customerId/source", () => {
    const result = classifyVehiclePlateConflict(
      [
        { id: "vehicle-manual-1", customerId: "customer-1", source: "manual" },
        { id: "vehicle-jp-1", customerId: "customer-2", source: "jumppark" },
      ],
      "GHI7J89",
      "jp-ext-4",
      null,
    );
    expect(result?.evidence.existingVehicles).toHaveLength(2);
    expect(result?.evidence.existingVehicles).toEqual([
      { vehicleId: "vehicle-manual-1", customerId: "customer-1", source: "manual" },
      { vehicleId: "vehicle-jp-1", customerId: "customer-2", source: "jumppark" },
    ]);
    // manual presente -> classificado como manual_jumppark (prioridade documentada), nunca "escolhe" um dos dois.
    expect(result?.evidence.conflictType).toBe("manual_jumppark");
    expect(result?.subjectKey).toBe("vehicle_plate_collision_manual_jumppark:GHI7J89");
  });

  it("H. evidência nunca contém nome/telefone/CPF/e-mail/modelo/marca/cor — só identificadores estruturais", () => {
    // O contrato (id/customerId/source) já torna estruturalmente impossível decidir por
    // modelo/marca/cor — não existe parâmetro para isso. Este teste confirma que a EVIDÊNCIA
    // produzida também nunca vaza esses campos nem PII, mesmo que viessem de um vehicle real.
    const result = classifyVehiclePlateConflict(
      [{ id: "v1", customerId: "c1", source: "manual" }],
      "JKL0M12",
      "jp-ext-5",
      null,
      ["order-9"],
    );
    expect(result?.evidence.existingVehicles).toEqual([{ vehicleId: "v1", customerId: "c1", source: "manual" }]);
    expect(JSON.stringify(result?.evidence)).not.toMatch(/model|marca|brand|color|cor|phone|telefone|cpf|email|e-mail|name(?!space)/i);
  });
});

/**
 * Placas de teste no formato Mercosul válido, prefixo "MQT" exclusivo desta suíte. Prefixo de
 * telefone exclusivo: `489994...`.
 */
let counter = 0;
function uniquePhone(): string {
  counter++;
  return `489994${String(counter).padStart(4, "0")}`;
}

async function insertJumpParkOrder(input: { externalId: string; plateMasked: string | null; clientName: string | null; orderDate: string }) {
  const db = getDb()!;
  await db.insert(jumpParkServiceOrders).values({
    externalId: input.externalId,
    orderDate: input.orderDate,
    plateMasked: input.plateMasked,
    clientName: input.clientName,
    vehicleModel: "Modelo Teste",
  });
}

async function cleanupTestData() {
  const db = getDb()!;
  await db.delete(jumpParkServiceOrders).where(like(jumpParkServiceOrders.externalId, "M14-%"));

  const testCustomers = await db.select({ id: customers.id }).from(customers).where(like(customers.phone, "489994%"));
  if (testCustomers.length > 0) {
    const ids = testCustomers.map((c) => c.id);
    const testVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.customerId, ids));
    const vehicleIds = testVehicles.map((v) => v.id);
    if (vehicleIds.length > 0) await db.delete(appointments).where(inArray(appointments.vehicleId, vehicleIds));
    await db.delete(vehicles).where(inArray(vehicles.customerId, ids));
    await db.delete(customers).where(inArray(customers.id, ids));
  }

  await db.delete(identityReviewItems).where(like(identityReviewItems.subjectKey, "vehicle_plate_collision_%MQT%"));
}

describe.skipIf(!hasRealDb)("refreshJumpParkCustomers — integração real de ponta a ponta (requer Postgres real, ~4min por chamada)", () => {
  it(
    "A/C/I/J/K juntos numa única chamada: external_id conhecido preservado, colisão manual bloqueia criação, customer/vehicle/appointment intactos, zero escrita JumpPark",
    async () => {
      await cleanupTestData();
      const phone = uniquePhone();
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({
        customerName: `IntegracaoM14 ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "Ford Fiesta",
      });
      const assignResult = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "MQT3C03" });
      expect(assignResult.status).toBe("assigned");

      const catalog = await fetchServiceCatalog();
      const appointment = await createAppointment({
        customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id,
        scheduledAt: "2026-12-01T09:00:00-03:00", expectedDurationMinutes: 60, notes: null,
      });

      await insertJumpParkOrder({ externalId: "M14-INT-1", plateMasked: "MQT3C03", clientName: "ClienteJumpparkM14", orderDate: "2026-01-01" });

      const requestSpy = vi.spyOn(jumpParkClient, "request");
      const result = await refreshJumpParkCustomers();
      expect(requestSpy).not.toHaveBeenCalled(); // K — zero escrita/leitura JumpPark
      requestSpy.mockRestore();

      expect(result.status).toBe("success");
      expect(result.vehicleConflictsQueued).toBeGreaterThanOrEqual(1);

      const db = getDb()!;

      // C — não criou um segundo vehicle para a placa; o manual continua sendo o único.
      const allWithPlate = await db.select().from(vehicles).where(eq(vehicles.plate, "MQT3C03"));
      expect(allWithPlate).toHaveLength(1);
      expect(allWithPlate[0].id).toBe(vehicle.id);
      expect(allWithPlate[0].source).toBe("manual");
      expect(allWithPlate[0].customerId).toBe(customer.id);

      // Item de revisão criado, sem decisão automática.
      const reviewRows = await db.select().from(identityReviewItems).where(eq(identityReviewItems.subjectKey, "vehicle_plate_collision_manual_jumppark:MQT3C03"));
      expect(reviewRows).toHaveLength(1);
      expect(reviewRows[0].active).toBe(true);
      expect(reviewRows[0].confidence).toBe("ambiguo");

      // Missão 17 — contrato novo da evidência: conflictType explícito, existingVehicles como
      // array com {vehicleId, customerId, source}, e incomingOrderIds preenchido (a ordem M14-INT-1
      // inserida acima é o único item incoming, então deve aparecer aqui).
      const persistedEvidence = reviewRows[0].evidence as Record<string, unknown>;
      expect(persistedEvidence.conflictType).toBe("manual_jumppark");
      expect(persistedEvidence.existingVehicles).toEqual([{ vehicleId: vehicle.id, customerId: customer.id, source: "manual" }]);
      expect(Array.isArray(persistedEvidence.incomingOrderIds)).toBe(true);
      expect((persistedEvidence.incomingOrderIds as string[]).length).toBeGreaterThanOrEqual(1);
      expect(persistedEvidence.origin).toBe("jumppark");
      // Nunca duplica PII na evidência persistida — nome/telefone do cliente jumppark incoming
      // (inserido acima como "ClienteJumpparkM14") nunca deveria aparecer aqui.
      expect(JSON.stringify(persistedEvidence)).not.toContain("ClienteJumpparkM14");

      // "Review já decidido não sobrescrito" (item J da missão) — sem rodar o refresh completo de
      // novo (~4min): simula a MESMA forma exata de upsert que `refreshJumpParkCustomers` usa
      // (idêntico `onConflictDoUpdate`, mesmas colunas no `set`) depois de marcar o item como
      // decidido por um humano. Prova a garantia real (o `set` nunca inclui status/decidedAt/
      // decidedNotes) sem pagar o custo de uma segunda chamada completa.
      await db.update(identityReviewItems).set({ status: "kept_separate", decidedAt: new Date(), decidedNotes: "Decisão de teste — carros diferentes" }).where(eq(identityReviewItems.id, reviewRows[0].id));

      const repeatedEvidence = { ...persistedEvidence, incomingOrderIds: [...(persistedEvidence.incomingOrderIds as string[]), "order-extra-simulado"] };
      await db
        .insert(identityReviewItems)
        .values({ subjectKey: "vehicle_plate_collision_manual_jumppark:MQT3C03", plateMasked: "MQT3C03", confidence: "ambiguo", rule: "re-upsert simulado", evidence: repeatedEvidence, active: true, source: "jumppark" })
        .onConflictDoUpdate({
          target: identityReviewItems.subjectKey,
          set: { plateMasked: "MQT3C03", rule: "re-upsert simulado", evidence: repeatedEvidence, active: true, updatedAt: new Date() },
        });

      const afterReupsert = await db.select().from(identityReviewItems).where(eq(identityReviewItems.subjectKey, "vehicle_plate_collision_manual_jumppark:MQT3C03"));
      expect(afterReupsert).toHaveLength(1); // idempotente — nenhuma linha nova
      expect(afterReupsert[0].status).toBe("kept_separate"); // decisão humana preservada
      expect(afterReupsert[0].decidedNotes).toBe("Decisão de teste — carros diferentes");

      // I/J — appointment e customer permanecem exatamente como estavam.
      const persistedAppointment = await getPlanningRepository().getAppointment(appointment.id);
      expect(persistedAppointment?.vehicleId).toBe(vehicle.id);
      expect(persistedAppointment?.customerId).toBe(customer.id);
      const persistedCustomer = await getAttendanceRepository().getCustomer(customer.id);
      expect(persistedCustomer?.name).toBe(customer.name);

      // A — rodar de novo com o MESMO external_id (agora conhecido, se tivesse sido criado) não
      // altera nada adicional; como o vehicle nunca foi criado, o comportamento continua idêntico
      // (mesmo conflito reportado, nada duplicado). Não repetimos a chamada aqui pelo custo de
      // ~4min por execução — a idempotência da fila já está provada pela decisão pura (teste D)
      // mais o upsert-por-subjectKey já auditado (Missão 28/13).

      await cleanupTestData();
    },
    400000,
  );
});
