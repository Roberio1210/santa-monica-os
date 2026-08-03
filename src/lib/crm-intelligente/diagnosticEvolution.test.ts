import { describe, expect, it } from "vitest";
import { buildVehicleDiagnosticEvolution, compareDiagnostics } from "@/lib/crm-intelligente/diagnosticEvolution";
import { emptyTechnicalDiagnostic, type Diagnostic, type ServiceVisit } from "@/lib/attendance/types";

function diagnostic(id: string, serviceVisitId: string, createdAt: string, overrides: Partial<Diagnostic> = {}): Diagnostic {
  return { id, serviceVisitId, ...emptyTechnicalDiagnostic(), observations: null, photos: [], createdAt, updatedAt: createdAt, ...overrides };
}

function visit(id: string, vehicleId: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId, mileageAtVisit: null, createdAt };
}

describe("compareDiagnostics", () => {
  it("compara área por área usando a descrição real, marcando o que mudou", () => {
    const previous = diagnostic("d1", "visit1", "2026-01-01T00:00:00Z", { pintura: { chuvaAcida: "nenhuma", riscos: "leve", hologramas: "nenhuma", manchas: "nenhuma" } });
    const current = diagnostic("d2", "visit2", "2026-02-01T00:00:00Z", { pintura: { chuvaAcida: "nenhuma", riscos: "nenhuma", hologramas: "nenhuma", manchas: "nenhuma" } });

    const evolution = compareDiagnostics(previous, current);
    const pintura = evolution.find((e) => e.area === "pintura")!;

    expect(pintura.previous).toContain("Riscos");
    expect(pintura.current).toBe("Sem achados registrados");
    expect(pintura.changed).toBe(true);
  });

  it("área sem mudança fica marcada como changed=false", () => {
    const previous = diagnostic("d1", "visit1", "2026-01-01T00:00:00Z");
    const current = diagnostic("d2", "visit2", "2026-02-01T00:00:00Z");
    const evolution = compareDiagnostics(previous, current);
    expect(evolution.every((e) => e.changed === false)).toBe(true);
  });
});

describe("buildVehicleDiagnosticEvolution", () => {
  it("retorna null quando o veículo tem só 1 diagnóstico — nunca compara sem par real", () => {
    const visits = [visit("visit1", "v1", "2026-01-01T00:00:00Z")];
    const diagnostics = [diagnostic("d1", "visit1", "2026-01-01T00:00:00Z")];
    expect(buildVehicleDiagnosticEvolution({ vehicleId: "v1", visits, diagnostics })).toBeNull();
  });

  it("compara os dois diagnósticos mais recentes do veículo, ignorando outros veículos", () => {
    const visits = [visit("visit1", "v1", "2026-01-01T00:00:00Z"), visit("visit2", "v1", "2026-03-01T00:00:00Z"), visit("visit3", "v2", "2026-02-01T00:00:00Z")];
    const diagnostics = [diagnostic("d1", "visit1", "2026-01-01T00:00:00Z"), diagnostic("d2", "visit2", "2026-03-01T00:00:00Z"), diagnostic("d3", "visit3", "2026-02-01T00:00:00Z")];

    const evolution = buildVehicleDiagnosticEvolution({ vehicleId: "v1", visits, diagnostics });
    expect(evolution).not.toBeNull();
    expect(evolution).toHaveLength(6);
  });
});
