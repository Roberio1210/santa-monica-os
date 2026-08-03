import type { ServiceVisit, Vehicle } from "@/lib/attendance/types";
import type { VehicleMemory } from "@/lib/crm-intelligente/types";

/** Puro — nunca faz I/O. Uma entrada por veículo do cliente, com contagem/última visita reais. */
export function buildVehicleMemories(vehicles: Vehicle[], visits: ServiceVisit[]): VehicleMemory[] {
  return vehicles.map((vehicle) => {
    const vehicleVisits = visits.filter((v) => v.vehicleId === vehicle.id);
    const sorted = [...vehicleVisits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { vehicle, visitCount: vehicleVisits.length, lastVisitAt: sorted[0]?.createdAt ?? null };
  });
}
