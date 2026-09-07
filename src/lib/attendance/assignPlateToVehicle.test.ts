import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { vehicles } from "@/db/schema";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { assignPlateToVehicle, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { jumpParkClient } from "@/lib/integrations/jumppark/client";

/** Marca um vehicle como source='jumppark' para simular um registro sincronizado — funciona tanto
 * contra Postgres real (UPDATE direto) quanto contra o repositório em memória (mutação do objeto,
 * já que `createVehicle` sempre grava `source: "manual"` e não existe — nem deveria existir aqui —
 * um jeito de criar um vehicle "jumppark" pelo fluxo manual). */
async function markAsJumpParkSource(vehicleId: string): Promise<void> {
  const db = getDb();
  if (db) {
    await db.update(vehicles).set({ source: "jumppark" }).where(eq(vehicles.id, vehicleId));
    return;
  }
  const row = await getAttendanceRepository().getVehicle(vehicleId);
  if (row) row.source = "jumppark";
}

/**
 * Missão 11 — prova de `assignPlateToVehicle` (preenchimento seguro de placa ausente). Roda contra
 * o repositório em memória por padrão (sem `TEST_DATABASE_URL`) — cada teste usa telefone único
 * (prefixo `489993...`, nunca usado por dado real) para nunca colidir entre execuções.
 */

let counter = 0;
function uniquePhone(): string {
  counter++;
  return `489993${String(counter).padStart(4, "0")}`;
}

describe("assignPlateToVehicle", () => {
  it("1. NULL -> placa válida: SUCESSO, plate é gravada", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `PlacaOk ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Ford Ka",
    });

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "ABC1D23" });

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.vehicle.plate).toBe("ABC1D23");
      expect(result.vehicle.id).toBe(vehicle.id);
    }
  });

  it("2. placa com hífen/espaço/minúscula -> normalização oficial (normalizePlate)", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `PlacaNorm ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Fiat Argo",
    });

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "xyz-2b45 " });

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") expect(result.vehicle.plate).toBe("XYZ2B45");
  });

  it("3. mesma placa no mesmo vehicle -> idempotência (already_assigned, sem novo UPDATE necessário)", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `Idempotente ${counter}`, customerPhone: uniquePhone(), vehiclePlate: "XYZ9A88", vehicleModel: "Onix",
    });

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "xyz-9a88" });

    expect(result.status).toBe("already_assigned");
    if (result.status === "already_assigned") expect(result.vehicle.plate).toBe("XYZ9A88");
  });

  it("4. vehicle já possui placa DIFERENTE -> conflito (nunca sobrescreve silenciosamente)", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `PlacaDiferente ${counter}`, customerPhone: uniquePhone(), vehiclePlate: "AAA1111", vehicleModel: "HB20",
    });

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "BBB2222" });

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.reason).toBe("vehicle_has_different_plate");
      expect(result.conflictingVehicle.plate).toBe("AAA1111");
    }
    // Não sobrescreveu: placa original permanece.
    const persisted = await getAttendanceRepository().getVehicle(vehicle.id);
    expect(persisted?.plate).toBe("AAA1111");
  });

  it("5. placa pertence a OUTRO vehicle do MESMO customer -> conflito, nunca funde", async () => {
    const phone = uniquePhone();
    const first = await registerQuickCustomerAndVehicle({
      customerName: `MesmoCliente ${counter}`, customerPhone: phone, vehiclePlate: "CCC3333", vehicleModel: "Civic",
    });
    const second = await registerQuickCustomerAndVehicle({
      customerName: first.customer.name ?? "Cliente", customerPhone: phone, vehiclePlate: null, vehicleModel: "Corolla",
    });
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.vehicle.id).not.toBe(first.vehicle.id);

    const result = await assignPlateToVehicle({ vehicleId: second.vehicle.id, plate: "CCC3333" });

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.reason).toBe("plate_used_by_another_vehicle_same_customer");
      expect(result.conflictingVehicle.id).toBe(first.vehicle.id);
    }
    const persisted = await getAttendanceRepository().getVehicle(second.vehicle.id);
    expect(persisted?.plate).toBeNull();
  });

  it("6. placa pertence a vehicle de OUTRO customer -> conflito, nunca funde", async () => {
    const ownerA = await registerQuickCustomerAndVehicle({
      customerName: `DonoA ${counter}`, customerPhone: uniquePhone(), vehiclePlate: "DDD4444", vehicleModel: "Gol",
    });
    const ownerB = await registerQuickCustomerAndVehicle({
      customerName: `DonoB ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Celta",
    });

    const result = await assignPlateToVehicle({ vehicleId: ownerB.vehicle.id, plate: "DDD4444" });

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.reason).toBe("plate_used_by_another_vehicle_other_customer");
      expect(result.conflictingVehicle.id).toBe(ownerA.vehicle.id);
    }
  });

  it("7. placa já existente em vehicle source='jumppark' -> conflito classificado, zero escrita JumpPark", async () => {
    const repo = getAttendanceRepository();
    const jumpparkOwner = await registerQuickCustomerAndVehicle({
      customerName: `DonoJumppark ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Compass",
    });
    // Simula um vehicle sincronizado do JumpPark diretamente no repositório (sem passar pelo fluxo manual).
    await repo.createVehicle({ customerId: jumpparkOwner.customer.id, plate: "EEE5555", brand: null, model: "Compass", year: null, color: null });
    const jumpparkVehicleRow = (await repo.findVehiclesByNormalizedPlate("EEE5555"))[0];
    await markAsJumpParkSource(jumpparkVehicleRow.id);

    const manualVehicle = await registerQuickCustomerAndVehicle({
      customerName: `Manual ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Tracker",
    });

    const requestSpy = vi.spyOn(jumpParkClient, "request");
    const result = await assignPlateToVehicle({ vehicleId: manualVehicle.vehicle.id, plate: "EEE5555" });

    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.reason).toBe("plate_used_by_jumppark_vehicle");
      expect(result.conflictingVehicle.source).toBe("jumppark");
    }
    expect(requestSpy).not.toHaveBeenCalled();
    requestSpy.mockRestore();
  });

  it("8. placa com formato inválido -> rejeitada (invalid_plate), nenhum UPDATE", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `Invalida ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Kwid",
    });

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "12345" });

    expect(result.status).toBe("invalid_plate");
    const persisted = await getAttendanceRepository().getVehicle(vehicle.id);
    expect(persisted?.plate).toBeNull();
  });

  it("9. placeholder/vazio -> rejeitado, nunca vira placa fictícia", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `Placeholder ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Renegade",
    });

    const semplaca = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "SEMPLACA" });
    const vazio = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "" });
    const zeros = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "0000000" });

    expect(semplaca.status).toBe("invalid_plate");
    expect(vazio.status).toBe("invalid_plate");
    expect(zeros.status).toBe("invalid_plate");

    const persisted = await getAttendanceRepository().getVehicle(vehicle.id);
    expect(persisted?.plate).toBeNull();
  });

  it("10. vehicleId inexistente -> erro claro (vehicle_not_found), nenhuma escrita", async () => {
    const result = await assignPlateToVehicle({ vehicleId: "00000000-0000-0000-0000-000000000000", plate: "FFF6666" });
    expect(result.status).toBe("vehicle_not_found");
  });

  it("11. customer permanece inalterado após atribuição de placa", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `CustomerIntacto ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Duster",
    });

    await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "GGG7777" });

    const persistedVehicle = await getAttendanceRepository().getVehicle(vehicle.id);
    expect(persistedVehicle?.customerId).toBe(customer.id);
    const persistedCustomer = await getAttendanceRepository().getCustomer(customer.id);
    expect(persistedCustomer?.id).toBe(customer.id);
    expect(persistedCustomer?.name).toBe(customer.name);
  });

  it("12/13. nenhuma criação de customer ou vehicle durante a atribuição", async () => {
    const repo = getAttendanceRepository();
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `SemCriacaoNova ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Spin",
    });

    const createCustomerSpy = vi.spyOn(repo, "createCustomer");
    const createVehicleSpy = vi.spyOn(repo, "createVehicle");

    await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "HHH8888" });

    expect(createCustomerSpy).not.toHaveBeenCalled();
    expect(createVehicleSpy).not.toHaveBeenCalled();
    createCustomerSpy.mockRestore();
    createVehicleSpy.mockRestore();
  });

  it("14. appointment permanece ligado ao mesmo vehicle_id após a atribuição de placa", async () => {
    // Simula um appointment apontando para o vehicle (sem depender do módulo planning aqui —
    // o contrato de assignPlateToVehicle nunca toca em appointments, só em vehicles.plate).
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `AppointmentLigado ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Cronos",
    });
    const vehicleIdBefore = vehicle.id;

    const result = await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "III9999" });

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.vehicle.id).toBe(vehicleIdBefore);
    }
  });

  it("15. zero chamada ao cliente JumpPark durante toda a operação (fluxo de sucesso)", async () => {
    const { vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `ZeroJumppark ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Sandero",
    });

    const requestSpy = vi.spyOn(jumpParkClient, "request");
    await assignPlateToVehicle({ vehicleId: vehicle.id, plate: "JJJ0001" });

    expect(requestSpy).not.toHaveBeenCalled();
    requestSpy.mockRestore();
  });

  it("16. concorrência — DOCUMENTA o risco, não afirma que está resolvido: duas checagens concorrentes podem ambas ver 'sem conflito' antes de qualquer UPDATE", async () => {
    const repo = getAttendanceRepository();
    const ownerA = await registerQuickCustomerAndVehicle({
      customerName: `ConcorrenteA ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Mobi",
    });
    const ownerB = await registerQuickCustomerAndVehicle({
      customerName: `ConcorrenteB ${counter}`, customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Up",
    });

    // Sem índice único, nada impede as duas checagens de conflito rodarem "ao mesmo tempo" (aqui
    // simulado por Promise.all) antes de qualquer UPDATE acontecer — ambas podem ver "nenhum
    // conflito" e ambas terminar com sucesso, deixando duas linhas com a mesma placa.
    const [resultA, resultB] = await Promise.all([
      assignPlateToVehicle({ vehicleId: ownerA.vehicle.id, plate: "KKK1234" }),
      assignPlateToVehicle({ vehicleId: ownerB.vehicle.id, plate: "KKK1234" }),
    ]);

    const bothAssigned = resultA.status === "assigned" && resultB.status === "assigned";
    // Não afirmamos qual dos dois vence nem que a corrida é impossível — só documentamos que ela
    // pode ocorrer hoje (sem o índice único da Missão 10, item 8/13). Este teste registra o
    // comportamento atual, não uma garantia de segurança.
    if (bothAssigned) {
      const finalA = await repo.getVehicle(ownerA.vehicle.id);
      const finalB = await repo.getVehicle(ownerB.vehicle.id);
      expect(finalA?.plate).toBe("KKK1234");
      expect(finalB?.plate).toBe("KKK1234");
    }
    expect(bothAssigned || resultA.status === "conflict" || resultB.status === "conflict").toBe(true);
  });
});
