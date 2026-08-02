import { describe, expect, it } from "vitest";
import { computeOrderTimers, minutesSince } from "@/lib/attendance/timers";

const NOW = new Date("2026-08-02T12:00:00Z");

describe("minutesSince", () => {
  it("calcula minutos entre um timestamp ISO e agora", () => {
    expect(minutesSince("2026-08-02T11:00:00Z", NOW)).toBe(60);
  });

  it("nunca retorna negativo com timestamp futuro", () => {
    expect(minutesSince("2026-08-02T13:00:00Z", NOW)).toBe(0);
  });
});

describe("computeOrderTimers", () => {
  it("sinceEntryMinutes sempre reflete agora - visitCreatedAt, qualquer que seja o status", () => {
    const timers = computeOrderTimers({ status: "recebido", visitCreatedAt: "2026-08-02T11:00:00Z", updatedAt: "2026-08-02T11:00:00Z" }, NOW);
    expect(timers.sinceEntryMinutes).toBe(60);
  });

  it("inExecutionMinutes só existe quando o status atual é em_execucao", () => {
    const emExecucao = computeOrderTimers({ status: "em_execucao", visitCreatedAt: "2026-08-02T10:00:00Z", updatedAt: "2026-08-02T11:30:00Z" }, NOW);
    expect(emExecucao.inExecutionMinutes).toBe(30);

    const outroStatus = computeOrderTimers({ status: "aguardando_conferencia", visitCreatedAt: "2026-08-02T10:00:00Z", updatedAt: "2026-08-02T11:30:00Z" }, NOW);
    expect(outroStatus.inExecutionMinutes).toBeNull();
  });

  it("totalMinutes só existe quando entregue — nunca confundido com o elapsed ainda em aberto", () => {
    const entregue = computeOrderTimers({ status: "entregue", visitCreatedAt: "2026-08-02T09:00:00Z", updatedAt: "2026-08-02T11:00:00Z" }, NOW);
    expect(entregue.totalMinutes).toBe(120);

    const aberto = computeOrderTimers({ status: "em_execucao", visitCreatedAt: "2026-08-02T09:00:00Z", updatedAt: "2026-08-02T11:00:00Z" }, NOW);
    expect(aberto.totalMinutes).toBeNull();
  });

  it("nunca retorna minutos negativos mesmo com timestamps futuros", () => {
    const timers = computeOrderTimers({ status: "recebido", visitCreatedAt: "2026-08-02T13:00:00Z", updatedAt: "2026-08-02T13:00:00Z" }, NOW);
    expect(timers.sinceEntryMinutes).toBe(0);
  });
});
