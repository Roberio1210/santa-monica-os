import { describe, expect, it } from "vitest";
import { buildCommercialHistory } from "@/lib/crm-intelligente/commercialHistory";
import type { ServiceOrder } from "@/lib/attendance/types";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";

const catalog: ServiceCatalogEntry[] = [
  { id: "bronze", name: "Bronze", category: "Pacote", defaultPrice: 150 },
  { id: "vitrificacao", name: "Vitrificação", category: "Vitrificação", defaultPrice: 800 },
  { id: "polimento-comercial", name: "Polimento Comercial", category: "Polimento", defaultPrice: 300 },
  { id: "polimento-tecnico", name: "Polimento Técnico", category: "Polimento", defaultPrice: 400 },
];

function order(id: string, serviceIds: string[]): ServiceOrder {
  return {
    id,
    serviceVisitId: `visit-${id}`,
    status: "entregue",
    items: serviceIds.map((serviceId, idx) => ({ id: `${id}-item${idx}`, serviceOrderId: id, serviceId, serviceName: catalog.find((c) => c.id === serviceId)!.name, notes: null })),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildCommercialHistory", () => {
  it("agrupa pacotes individualmente pelo nome real", () => {
    const history = buildCommercialHistory({ orders: [order("o1", ["bronze"])], catalog });
    expect(history.packages).toEqual([{ label: "Bronze", count: 1, totalValue: 150 }]);
    expect(history.byCategory).toEqual([]);
  });

  it("agrupa demais serviços pela categoria real do catálogo, somando valor e contagem", () => {
    const history = buildCommercialHistory({ orders: [order("o1", ["polimento-comercial"]), order("o2", ["polimento-tecnico"])], catalog });
    expect(history.byCategory).toEqual([{ label: "Polimento", count: 2, totalValue: 700 }]);
  });

  it("total gasto é a soma real de tudo, nunca estimado", () => {
    const history = buildCommercialHistory({ orders: [order("o1", ["bronze", "vitrificacao"])], catalog });
    expect(history.totalSpent).toBe(950);
  });

  it("sem ordens, retorna histórico vazio (nunca inventa dado)", () => {
    const history = buildCommercialHistory({ orders: [], catalog });
    expect(history).toEqual({ totalSpent: 0, packages: [], byCategory: [] });
  });
});
