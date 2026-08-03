import { describe, expect, it } from "vitest";
import { buildActiveProtections } from "@/lib/crm-intelligente/protections";
import type { CrmTimelineEntry } from "@/lib/crm-intelligente/types";

const NOW = new Date("2026-08-03T12:00:00Z");

function entry(overrides: Partial<CrmTimelineEntry>): CrmTimelineEntry {
  return {
    visitId: "visit1",
    vehicleId: "v1",
    dateIso: "2026-01-01T00:00:00Z",
    services: [],
    diagnosticIssues: [],
    diagnosticObservations: null,
    photos: [],
    recommendations: [],
    discounts: [],
    executionMinutes: null,
    status: "entregue",
    ...overrides,
  };
}

describe("buildActiveProtections", () => {
  it("só mostra proteção quando o serviço real já foi executado alguma vez — recência, nunca vencimento inventado", () => {
    const timeline = [entry({ dateIso: "2026-07-01T00:00:00Z", services: ["Vitrificação"] })];
    const protections = buildActiveProtections({ timeline, now: NOW });

    expect(protections).toHaveLength(1);
    expect(protections[0].serviceName).toBe("Vitrificação");
    expect(protections[0].lastPerformedAt).toBe("2026-07-01T00:00:00Z");
    expect(protections[0].daysSince).toBe(33);
  });

  it("serviço de proteção nunca comprado não aparece — nunca inventa uma proteção que não existe", () => {
    const protections = buildActiveProtections({ timeline: [], now: NOW });
    expect(protections).toEqual([]);
  });

  it("usa a ocorrência mais recente quando o serviço foi feito mais de uma vez", () => {
    const timeline = [entry({ dateIso: "2026-07-01T00:00:00Z", services: ["Cristalização de Vidros"] }), entry({ dateIso: "2026-01-01T00:00:00Z", services: ["Cristalização de Vidros"] })];
    const protections = buildActiveProtections({ timeline, now: NOW });
    expect(protections[0].lastPerformedAt).toBe("2026-07-01T00:00:00Z");
  });
});
