import { describe, expect, it } from "vitest";
import { generateCustomerMessage, type MessageType } from "@/lib/crm-intelligente/messages";
import type { Customer, Vehicle } from "@/lib/attendance/types";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";

const customer: Customer = { id: "c1", name: "Maria Silva", phone: "48999999999", cpf: null, email: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const vehicle: Vehicle = { id: "v1", customerId: "c1", plate: "ABC1D23", brand: "Toyota", model: "Corolla", year: 2020, color: "Prata", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const profile: CustomerProfile = { customer, firstVisitAt: "2026-01-01T00:00:00.000Z", daysAsCustomer: 200, visitCount: 6, vehicleCount: 1, lastVisitAt: "2026-06-01T00:00:00.000Z", daysSinceLastVisit: 50, totalSpent: 1200, averageTicket: 200, isRecurring: true, isVip: true };

const TYPES: MessageType[] = ["retorno", "agradecimento", "lembrete_manutencao", "aviso_protecao", "convite_lavagem", "vip", "recuperacao", "pos_servico"];

describe("generateCustomerMessage", () => {
  it("gera texto não vazio para todos os 8 tipos, sempre mencionando o primeiro nome", () => {
    for (const type of TYPES) {
      const result = generateCustomerMessage(type, { customer, profile, vehicle, lastServiceNames: ["Lavação Completa"] });
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain("Maria");
      expect(result.type).toBe(type);
    }
  });

  it("menciona o modelo do veículo quando conhecido", () => {
    const result = generateCustomerMessage("retorno", { customer, profile, vehicle, lastServiceNames: [] });
    expect(result.text).toContain("Corolla");
  });

  it("nunca lança e sinaliza aviso honesto quando não há veículo vinculado", () => {
    const result = generateCustomerMessage("retorno", { customer, profile, vehicle: null, lastServiceNames: [] });
    expect(result.warnings.some((w) => w.includes("Nenhum veículo"))).toBe(true);
  });

  it("nunca inventa dias sem retorno — usa 'um tempo' quando daysSinceLastVisit é null", () => {
    const noVisit: CustomerProfile = { ...profile, daysSinceLastVisit: null };
    const result = generateCustomerMessage("recuperacao", { customer, profile: noVisit, vehicle, lastServiceNames: [] });
    expect(result.text).not.toMatch(/null/);
  });

  it("convite_lavagem avisa quando a última visita já foi uma lavação (evita oferecer serviço recém-realizado)", () => {
    const result = generateCustomerMessage("convite_lavagem", { customer, profile, vehicle, lastServiceNames: ["Lavação Bronze"] });
    expect(result.warnings.some((w) => w.includes("já incluiu lavação"))).toBe(true);
  });

  it("usa nome genérico quando cliente não tem nome cadastrado", () => {
    const noName: Customer = { ...customer, name: null };
    const result = generateCustomerMessage("agradecimento", { customer: noName, profile, vehicle, lastServiceNames: [] });
    expect(result.text).not.toContain("null");
  });
});
