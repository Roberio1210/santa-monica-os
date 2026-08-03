import { describe, expect, it } from "vitest";
import { computeCustomerProfile, RECORRENTE_VISIT_THRESHOLD, VIP_MAX_INACTIVITY_DAYS, VIP_VISIT_THRESHOLD } from "@/lib/crm-intelligente/profile";
import type { Customer, ServiceOrder, ServiceVisit, Vehicle } from "@/lib/attendance/types";

const NOW = new Date("2026-08-03T12:00:00Z");

function customer(): Customer {
  return { id: "c1", name: "Cliente Teste", phone: "11999990000", cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

function visit(id: string, createdAt: string): ServiceVisit {
  return { id, customerId: "c1", vehicleId: "v1", mileageAtVisit: null, createdAt };
}

function order(id: string, serviceVisitId: string): ServiceOrder {
  return {
    id,
    serviceVisitId,
    status: "entregue",
    items: [{ id: `${id}-item`, serviceOrderId: id, serviceId: "svc1", serviceName: "Bronze", notes: null }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("computeCustomerProfile", () => {
  it("calcula primeira/última visita, dias como cliente e dias desde a última visita a partir de dados reais", () => {
    const visits = [visit("visit1", "2026-01-01T10:00:00Z"), visit("visit2", "2026-02-01T10:00:00Z")];
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits, orders: [], servicePriceById: {}, now: NOW });

    expect(profile.firstVisitAt).toBe("2026-01-01T10:00:00Z");
    expect(profile.lastVisitAt).toBe("2026-02-01T10:00:00Z");
    expect(profile.daysAsCustomer).toBe(214);
    expect(profile.daysSinceLastVisit).toBe(183);
  });

  it("nunca inventa ticket médio quando não há ordem com item — retorna null, não 0", () => {
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits: [], orders: [], servicePriceById: {}, now: NOW });
    expect(profile.averageTicket).toBeNull();
    expect(profile.totalSpent).toBe(0);
  });

  it("calcula ticket médio real quando há ordens com item", () => {
    const orders = [order("o1", "visit1"), order("o2", "visit2")];
    const profile = computeCustomerProfile({
      customer: customer(),
      vehicles: [],
      visits: [visit("visit1", "2026-01-01T00:00:00Z")],
      orders,
      servicePriceById: { svc1: 150 },
      now: NOW,
    });
    expect(profile.totalSpent).toBe(300);
    expect(profile.averageTicket).toBe(150);
  });

  it(`marca cliente recorrente com >= ${RECORRENTE_VISIT_THRESHOLD} visitas`, () => {
    const visits = Array.from({ length: RECORRENTE_VISIT_THRESHOLD }, (_, i) => visit(`v${i}`, "2026-01-01T00:00:00Z"));
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits, orders: [], servicePriceById: {}, now: NOW });
    expect(profile.isRecurring).toBe(true);
  });

  it("não marca recorrente abaixo do limiar", () => {
    const visits = [visit("v1", "2026-01-01T00:00:00Z")];
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits, orders: [], servicePriceById: {}, now: NOW });
    expect(profile.isRecurring).toBe(false);
  });

  it(`marca VIP só com >= ${VIP_VISIT_THRESHOLD} visitas E menos de ${VIP_MAX_INACTIVITY_DAYS} dias sem aparecer`, () => {
    const visits = Array.from({ length: VIP_VISIT_THRESHOLD }, (_, i) => visit(`v${i}`, "2026-08-01T00:00:00Z"));
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits, orders: [], servicePriceById: {}, now: NOW });
    expect(profile.isVip).toBe(true);
  });

  it("cliente muito recorrente mas sumido há muito tempo não é VIP", () => {
    const visits = Array.from({ length: VIP_VISIT_THRESHOLD }, (_, i) => visit(`v${i}`, "2025-01-01T00:00:00Z"));
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits, orders: [], servicePriceById: {}, now: NOW });
    expect(profile.daysSinceLastVisit).toBeGreaterThan(VIP_MAX_INACTIVITY_DAYS);
    expect(profile.isVip).toBe(false);
  });

  it("cliente sem visitas nunca é VIP nem recorrente, e datas ficam null (nunca inventadas)", () => {
    const profile = computeCustomerProfile({ customer: customer(), vehicles: [], visits: [], orders: [], servicePriceById: {}, now: NOW });
    expect(profile.isVip).toBe(false);
    expect(profile.isRecurring).toBe(false);
    expect(profile.firstVisitAt).toBeNull();
    expect(profile.lastVisitAt).toBeNull();
    expect(profile.daysAsCustomer).toBeNull();
    expect(profile.daysSinceLastVisit).toBeNull();
  });

  it("conta veículos e visitas reais", () => {
    const vehicles: Vehicle[] = [{ id: "v1", customerId: "c1", plate: "ABC1D23", brand: "Toyota", model: "Corolla", year: 2022, color: "Branco", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }];
    const visits = [visit("visit1", "2026-01-01T00:00:00Z"), visit("visit2", "2026-02-01T00:00:00Z")];
    const profile = computeCustomerProfile({ customer: customer(), vehicles, visits, orders: [], servicePriceById: {}, now: NOW });
    expect(profile.vehicleCount).toBe(1);
    expect(profile.visitCount).toBe(2);
  });
});
