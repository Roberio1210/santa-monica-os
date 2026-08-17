import type { CashFlowPeriodPreset, CashFlowPeriodRange } from "@/lib/finance/types";

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function firstDayOfPreviousMonth(dateIso: string): string {
  const date = new Date(`${firstDayOfMonth(dateIso)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(dateIso: string): string {
  const date = new Date(`${firstDayOfMonth(dateIso)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Missão Financeiro V4.1, Fase 2 — resolve o preset do seletor de período em um intervalo
 * [from, to] real, sempre ancorado em `asOfDate` (nunca `new Date()` direto, para o cálculo ser
 * determinístico e testável). "personalizado" exige customFrom/customTo explícitos — sem eles,
 * cai em "hoje" (nunca inventa um intervalo).
 */
export function resolveCashFlowPeriod(preset: CashFlowPeriodPreset, asOfDate: string, customFrom?: string, customTo?: string): CashFlowPeriodRange {
  switch (preset) {
    case "hoje":
      return { from: asOfDate, to: asOfDate };
    case "7_dias":
      return { from: addDays(asOfDate, -6), to: asOfDate };
    case "mes_atual":
      return { from: firstDayOfMonth(asOfDate), to: asOfDate };
    case "mes_anterior": {
      const from = firstDayOfPreviousMonth(asOfDate);
      return { from, to: lastDayOfMonth(from) };
    }
    case "personalizado":
      if (customFrom && customTo && customFrom <= customTo) return { from: customFrom, to: customTo };
      return { from: asOfDate, to: asOfDate };
  }
}
