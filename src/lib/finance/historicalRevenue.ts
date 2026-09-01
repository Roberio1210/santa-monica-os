import "server-only";
import { eq, lt, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { historicalSpreadsheetWashRecords, historicalSpreadsheetParkingRecords } from "@/db/schema/historicalSpreadsheet";
import type { HistoricalRevenueCandidateInput } from "@/lib/finance/dre";
import { DATA_CORTE_JUMPPARK } from "@/lib/config/historical-source-precedence";

export interface RawWashRecordRow {
  externalId: string;
  recordDate: string;
  clientName: string | null;
  serviceTypeRaw: string | null;
  totalReceived: string | number | null;
}

export interface RawParkingRecordRow {
  externalId: string;
  recordDate: string;
  totalAmount: string | number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Missão UX/Navegação 2 — parte pura (sem banco), testável isoladamente. `totalReceived` nulo ou
 * zero é OMITIDO (nunca vira um lançamento de R$0 — "ausência de dado ≠ zero", mesmo princípio já
 * usado em `computeDreReport`). Um registro por lavação real (a fonte já tem essa granularidade,
 * nunca agregada aqui).
 */
export function mapWashRecordsToRevenueCandidates(rows: RawWashRecordRow[]): HistoricalRevenueCandidateInput[] {
  return rows
    .filter((r) => r.totalReceived !== null && Number(r.totalReceived) > 0)
    .map((r) => ({
      externalId: r.externalId,
      date: r.recordDate,
      description: `Lavação (planilha histórica)${r.serviceTypeRaw ? ` — ${r.serviceTypeRaw}` : ""}${r.clientName ? ` — ${r.clientName}` : ""}`,
      category: "Lavação" as const,
      amount: round2(Number(r.totalReceived)),
    }));
}

/** Um registro por dia real de estacionamento (a fonte já é diária, nunca agregada aqui). `totalAmount` zero é mantido (dia real sem faturamento não é "ausência de dado" — a linha existe). */
export function mapParkingRecordsToRevenueCandidates(rows: RawParkingRecordRow[]): HistoricalRevenueCandidateInput[] {
  return rows
    .filter((r) => Number(r.totalAmount) > 0)
    .map((r) => ({
      externalId: r.externalId,
      date: r.recordDate,
      description: `Estacionamento (planilha histórica) — ${r.recordDate}`,
      category: "Estacionamento" as const,
      amount: round2(Number(r.totalAmount)),
    }));
}

/**
 * Missão UX/Navegação 2 — receita histórica real (planilha pré-JumpPark) para a DRE, direto de
 * `historical_spreadsheet_wash_records`/`historical_spreadsheet_parking_records`. Busca só
 * `date < DATA_CORTE_JUMPPARK` (defesa em profundidade: `buildHistoricalRevenueCandidates`, em
 * `dre.ts`, filtra de novo de forma pura — nunca confia só na busca). Nunca grava nada.
 */
export async function fetchHistoricalRevenueCandidates(): Promise<HistoricalRevenueCandidateInput[]> {
  const db = getDb();
  if (!db) return [];

  const [washRows, parkingRows] = await Promise.all([
    db
      .select({
        externalId: historicalSpreadsheetWashRecords.externalId,
        recordDate: historicalSpreadsheetWashRecords.recordDate,
        clientName: historicalSpreadsheetWashRecords.clientName,
        serviceTypeRaw: historicalSpreadsheetWashRecords.serviceTypeRaw,
        totalReceived: historicalSpreadsheetWashRecords.totalReceived,
      })
      .from(historicalSpreadsheetWashRecords)
      .where(and(eq(historicalSpreadsheetWashRecords.active, true), lt(historicalSpreadsheetWashRecords.recordDate, DATA_CORTE_JUMPPARK))),
    db
      .select({
        externalId: historicalSpreadsheetParkingRecords.externalId,
        recordDate: historicalSpreadsheetParkingRecords.recordDate,
        totalAmount: historicalSpreadsheetParkingRecords.totalAmount,
      })
      .from(historicalSpreadsheetParkingRecords)
      .where(and(eq(historicalSpreadsheetParkingRecords.active, true), lt(historicalSpreadsheetParkingRecords.recordDate, DATA_CORTE_JUMPPARK))),
  ]);

  return [...mapWashRecordsToRevenueCandidates(washRows), ...mapParkingRecordsToRevenueCandidates(parkingRows)];
}
