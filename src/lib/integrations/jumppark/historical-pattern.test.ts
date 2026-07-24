import { describe, expect, it } from "vitest";
import { computeHistoricalPattern } from "@/lib/integrations/jumppark/historical-pattern";
import type { OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";

function order(overrides: Partial<OperationalOrder> = {}): OperationalOrder {
  return {
    externalId: "1",
    code: null,
    date: "2026-07-13", // segunda-feira
    entryDateTime: null,
    exitDateTime: null,
    entryTime: null,
    exitTime: "10:00",
    clientName: null,
    clientPhoneMasked: null,
    vehicleModel: "COROLLA",
    plateMasked: "AB***01",
    services: [{ description: "Lavação Silver", amount: 100 }],
    kind: "lavacao",
    parkingAmount: 0,
    servicesAmount: 100,
    totalAmount: 100,
    paymentMethodName: "Pix",
    paymentMethodCategory: "pix",
    situation: "Pago",
    ...overrides,
  };
}

describe("computeHistoricalPattern — amostra e qualidade", () => {
  it("sem nenhuma ocorrência do dia da semana -> amostra insuficiente, tudo null", () => {
    const result = computeHistoricalPattern([], { weekdayIndex: 1, referenceDateIso: "2026-07-20" });
    expect(result.sampleWeeks).toBe(0);
    expect(result.sampleQuality).toBe("insuficiente");
    expect(result.typicalVehicles).toBeNull();
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("nunca inclui o próprio dia de referência na amostra histórica", () => {
    const orders = [order({ date: "2026-07-20", plateMasked: "AA***01" })]; // 2026-07-20 é a própria referência
    const result = computeHistoricalPattern(orders, { weekdayIndex: 1, referenceDateIso: "2026-07-20" });
    expect(result.sampleWeeks).toBe(0);
  });

  it("3 segundas-feiras -> amostra insuficiente; 4 -> razoável; 8 -> boa", () => {
    const threeWeeks = ["2026-06-22", "2026-06-29", "2026-07-06"].map((date, i) => order({ date, plateMasked: `AA***0${i}` }));
    expect(computeHistoricalPattern(threeWeeks, { weekdayIndex: 1, referenceDateIso: "2026-07-20" }).sampleQuality).toBe("insuficiente");

    const fourWeeks = ["2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"].map((date, i) => order({ date, plateMasked: `AA***0${i}` }));
    expect(computeHistoricalPattern(fourWeeks, { weekdayIndex: 1, referenceDateIso: "2026-07-20" }).sampleQuality).toBe("razoavel");

    const eightWeeks = Array.from({ length: 8 }, (_, i) => order({ date: `2026-05-${String(4 + i * 7).padStart(2, "0")}`, plateMasked: `AA***0${i}` }));
    expect(computeHistoricalPattern(eightWeeks, { weekdayIndex: 1, referenceDateIso: "2026-07-20" }).sampleQuality).toBe("boa");
  });
});

describe("computeHistoricalPattern — cutoff de horário evita comparar dia inteiro com dia em andamento", () => {
  it("com corte de horário, só considera ordens finalizadas até aquele horário em cada dia histórico", () => {
    const orders = [
      order({ date: "2026-07-13", exitTime: "09:00", plateMasked: "AA***01" }), // antes do corte
      order({ date: "2026-07-13", exitTime: "15:00", plateMasked: "AA***02" }), // depois do corte
    ];
    const result = computeHistoricalPattern(orders, { weekdayIndex: 1, referenceDateIso: "2026-07-20", cutoffTimeHM: "10:00" });
    expect(result.typicalVehicles).toBe(1); // só a ordem das 09:00 conta
    expect(result.limitations.some((l) => l.includes("10:00"))).toBe(true);
  });

  it("sem corte de horário, considera o dia inteiro", () => {
    const orders = [order({ date: "2026-07-13", exitTime: "09:00", plateMasked: "AA***01" }), order({ date: "2026-07-13", exitTime: "15:00", plateMasked: "AA***02" })];
    const result = computeHistoricalPattern(orders, { weekdayIndex: 1, referenceDateIso: "2026-07-20" });
    expect(result.typicalVehicles).toBe(2);
  });
});

describe("computeHistoricalPattern — agregados corretos", () => {
  it("calcula faturamento, ticket médio e taxa de adicionais corretamente", () => {
    const orders = [
      order({ date: "2026-07-13", totalAmount: 100, plateMasked: "AA***01", services: [{ description: "Lavação Silver", amount: 100 }] }),
      order({ date: "2026-07-13", totalAmount: 200, plateMasked: "AA***02", services: [{ description: "Lavação Gold", amount: 150 }, { description: "Higienização", amount: 50 }] }),
    ];
    const result = computeHistoricalPattern(orders, { weekdayIndex: 1, referenceDateIso: "2026-07-20" });
    expect(result.typicalRevenue).toBe(300); // 1 semana só na amostra -> total = média
    expect(result.typicalTicket).toBe(150); // (100+200)/2
    expect(result.typicalAddOnRate).toBe(0.5); // 1 de 2 ordens com mais de 1 serviço
  });

  it("nunca inclui dados de outro dia da semana na amostra", () => {
    const orders = [order({ date: "2026-07-14" })]; // 2026-07-14 é terça-feira
    const result = computeHistoricalPattern(orders, { weekdayIndex: 1, referenceDateIso: "2026-07-20" }); // pedindo segunda-feira
    expect(result.sampleWeeks).toBe(0);
  });
});
