import { describe, expect, it } from "vitest";
import { runHistoricalBackfill, splitDateRangeIntoBatches } from "@/lib/integrations/jumppark/backfill";

describe("splitDateRangeIntoBatches", () => {
  it("divide um intervalo em lotes de N dias, sem sobreposição, cobrindo o intervalo inteiro", () => {
    const batches = splitDateRangeIntoBatches("2025-01-01", "2025-01-31", 14);
    expect(batches).toEqual([
      { start: "2025-01-01", end: "2025-01-14" },
      { start: "2025-01-15", end: "2025-01-28" },
      { start: "2025-01-29", end: "2025-01-31" },
    ]);
  });

  it("intervalo menor que um lote vira um único lote", () => {
    expect(splitDateRangeIntoBatches("2025-01-01", "2025-01-05", 14)).toEqual([{ start: "2025-01-01", end: "2025-01-05" }]);
  });

  it("intervalo de um único dia vira um lote de um dia", () => {
    expect(splitDateRangeIntoBatches("2025-01-01", "2025-01-01", 14)).toEqual([{ start: "2025-01-01", end: "2025-01-01" }]);
  });

  it("data final antes da inicial retorna lista vazia, nunca lança", () => {
    expect(splitDateRangeIntoBatches("2025-02-01", "2025-01-01", 14)).toEqual([]);
  });

  it("datas inválidas retornam lista vazia, nunca lança", () => {
    expect(splitDateRangeIntoBatches("não-é-data", "2025-01-01", 14)).toEqual([]);
    expect(splitDateRangeIntoBatches("2025-01-01", "2025-01-31", 0)).toEqual([]);
    expect(splitDateRangeIntoBatches("2025-01-01", "2025-01-31", -5)).toEqual([]);
  });

  it("lotes cobrem o intervalo sem lacunas nem sobreposição (dia seguinte ao fim de um lote é o início do próximo)", () => {
    const batches = splitDateRangeIntoBatches("2025-06-01", "2025-08-15", 30);
    for (let i = 1; i < batches.length; i++) {
      const prevEnd = new Date(batches[i - 1].end);
      const curStart = new Date(batches[i].start);
      const diffDays = (curStart.getTime() - prevEnd.getTime()) / 86_400_000;
      expect(diffDays).toBe(1);
    }
    expect(batches[0].start).toBe("2025-06-01");
    expect(batches[batches.length - 1].end).toBe("2025-08-15");
  });
});

describe("runHistoricalBackfill sem banco configurado", () => {
  it("nunca lança e retorna todos os lotes como pendentes, databaseConfigured=false", async () => {
    const result = await runHistoricalBackfill({ overallStart: "2025-01-01", overallEnd: "2025-01-31", batchDays: 14 });
    expect(result.databaseConfigured).toBe(false);
    expect(result.totalBatches).toBe(3);
    expect(result.batchesProcessedThisRun).toBe(0);
    expect(result.batchesRemaining).toBe(3);
    expect(result.finished).toBe(false);
  });

  it("intervalo sem nenhum lote válido marca finished=true (nada a fazer)", async () => {
    const result = await runHistoricalBackfill({ overallStart: "2025-02-01", overallEnd: "2025-01-01" });
    expect(result.totalBatches).toBe(0);
    expect(result.finished).toBe(true);
  });
});
