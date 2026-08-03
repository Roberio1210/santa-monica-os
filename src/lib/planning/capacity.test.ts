import { describe, expect, it } from "vitest";
import { computeAverageDurationByServiceName, computeCapacitySummary, computeForecast, computeTomorrowPreparation, MIN_DURATION_SAMPLE_SIZE } from "@/lib/planning/capacity";
import type { AppointmentView, CapacityConfig } from "@/lib/planning/types";

const config: CapacityConfig = { id: "cfg-1", boxesCount: 3, dailyOperatingMinutes: 480 };

describe("computeCapacitySummary", () => {
  it("sem config, retorna configured: false — nunca uma capacidade inventada", () => {
    expect(computeCapacitySummary(null, [])).toEqual({ configured: false });
  });

  it("com config e nenhum agendamento, capacidade totalmente disponível", () => {
    const result = computeCapacitySummary(config, []);
    expect(result).toMatchObject({ configured: true, dailyCapacityMinutes: 1440, committedMinutes: 0, availableMinutes: 1440, percentOccupied: 0 });
  });

  it("soma apenas agendamentos com duração informada", () => {
    const result = computeCapacitySummary(config, [{ expectedDurationMinutes: 60 }, { expectedDurationMinutes: 120 }, { expectedDurationMinutes: null }]);
    expect(result).toMatchObject({ configured: true, committedMinutes: 180, availableMinutes: 1260, appointmentsMissingDuration: 1 });
  });

  it("percentual e boxes ocupados calculados corretamente", () => {
    const result = computeCapacitySummary(config, [{ expectedDurationMinutes: 720 }]);
    expect(result).toMatchObject({ configured: true, percentOccupied: 50, estimatedBoxesOccupied: 1.5 });
  });

  it("permite ficar negativo quando sobrecarregado — nunca esconde o excesso", () => {
    const result = computeCapacitySummary(config, [{ expectedDurationMinutes: 2000 }]);
    expect(result).toMatchObject({ configured: true, availableMinutes: -560 });
  });
});

describe("computeAverageDurationByServiceName", () => {
  it("ignora ordens com mais de um serviço (ambíguo)", () => {
    const result = computeAverageDurationByServiceName([{ serviceNames: ["Bronze", "Higienização Interna"], visitCreatedAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-01T11:00:00Z" }]);
    expect(result).toEqual({});
  });

  it("calcula média real em minutos para serviço único", () => {
    const result = computeAverageDurationByServiceName([
      { serviceNames: ["Bronze"], visitCreatedAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-01T11:00:00Z" },
      { serviceNames: ["Bronze"], visitCreatedAt: "2026-01-02T10:00:00Z", updatedAt: "2026-01-02T11:30:00Z" },
    ]);
    expect(result.Bronze).toEqual({ averageMinutes: 75, sampleSize: 2 });
  });

  it("ignora durações inválidas (updatedAt antes de visitCreatedAt)", () => {
    const result = computeAverageDurationByServiceName([{ serviceNames: ["Bronze"], visitCreatedAt: "2026-01-01T11:00:00Z", updatedAt: "2026-01-01T10:00:00Z" }]);
    expect(result).toEqual({});
  });
});

describe("computeForecast", () => {
  it("sem capacidade configurada, nunca calculável", () => {
    expect(computeForecast({ configured: false }, {}, ["Bronze"])).toEqual({ calculable: false });
  });

  it("sem amostra suficiente para nenhum pacote, nunca calculável", () => {
    const capacity = computeCapacitySummary(config, []);
    const stats = { Bronze: { averageMinutes: 60, sampleSize: MIN_DURATION_SAMPLE_SIZE - 1 } };
    expect(computeForecast(capacity, stats, ["Bronze"])).toEqual({ calculable: false });
  });

  it("com amostra suficiente, calcula quantos cabem no restante", () => {
    const capacity = computeCapacitySummary(config, [{ expectedDurationMinutes: 240 }]);
    const stats = { Bronze: { averageMinutes: 60, sampleSize: MIN_DURATION_SAMPLE_SIZE } };
    const result = computeForecast(capacity, stats, ["Bronze"]);
    expect(result).toEqual({ calculable: true, entries: [{ serviceName: "Bronze", canFit: 20 }] });
  });

  it("nunca inclui pacote sem amostra, mesmo com outros calculáveis", () => {
    const capacity = computeCapacitySummary(config, []);
    const stats = { Bronze: { averageMinutes: 60, sampleSize: MIN_DURATION_SAMPLE_SIZE } };
    const result = computeForecast(capacity, stats, ["Bronze", "Gold"]);
    expect(result).toEqual({ calculable: true, entries: [{ serviceName: "Bronze", canFit: 24 }] });
  });
});

function view(expectedDurationMinutes: number | null): AppointmentView {
  return {
    id: "a1",
    scheduledAt: "2026-01-02T10:00:00Z",
    status: "agendado",
    customerId: "c1",
    customerName: "Cliente",
    phone: null,
    vehicleId: "v1",
    vehicleLabel: "Veículo",
    plate: null,
    serviceId: "s1",
    serviceName: "Bronze",
    expectedDurationMinutes,
    notes: null,
    signals: [],
  };
}

describe("computeTomorrowPreparation", () => {
  it("soma só durações conhecidas e conta as ausentes", () => {
    const result = computeTomorrowPreparation([view(60), view(null)], { configured: false }, { calculable: false });
    expect(result).toMatchObject({ vehicleCount: 2, serviceCount: 2, totalPredictedMinutes: 60, appointmentsMissingDuration: 1 });
  });
});
