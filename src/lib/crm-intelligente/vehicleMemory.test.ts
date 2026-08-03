import { describe, expect, it } from "vitest";
import { buildVehicleMemories } from "@/lib/crm-intelligente/vehicleMemory";
import type { ServiceVisit, Vehicle } from "@/lib/attendance/types";

function vehicle(id: string): Vehicle {
  return { id, customerId: "c1", plate: `PLT-${id}`, brand: "Toyota", model: "Corolla", year: 2022, color: "Branco", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

function visit(id: string, vehicleId: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId, mileageAtVisit: null, createdAt };
}

describe("buildVehicleMemories", () => {
  it("conta visitas e acha a última visita real por veículo, isolando cada um", () => {
    const vehicles = [vehicle("v1"), vehicle("v2")];
    const visits = [visit("visit1", "v1", "2026-01-01T00:00:00Z"), visit("visit2", "v1", "2026-03-01T00:00:00Z"), visit("visit3", "v2", "2026-02-01T00:00:00Z")];

    const memories = buildVehicleMemories(vehicles, visits);

    const v1 = memories.find((m) => m.vehicle.id === "v1")!;
    expect(v1.visitCount).toBe(2);
    expect(v1.lastVisitAt).toBe("2026-03-01T00:00:00Z");

    const v2 = memories.find((m) => m.vehicle.id === "v2")!;
    expect(v2.visitCount).toBe(1);
    expect(v2.lastVisitAt).toBe("2026-02-01T00:00:00Z");
  });

  it("veículo sem nenhuma visita fica com contagem 0 e última visita null — nunca inventada", () => {
    const memories = buildVehicleMemories([vehicle("v1")], []);
    expect(memories[0].visitCount).toBe(0);
    expect(memories[0].lastVisitAt).toBeNull();
  });
});
