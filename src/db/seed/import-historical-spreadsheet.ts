import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { historicalSpreadsheetParkingRecords, historicalSpreadsheetWashRecords, services } from "@/db/schema";
import { DATA_CORTE_JUMPPARK, isSpreadsheetOfficialPeriod } from "@/lib/config/historical-source-precedence";

/**
 * Missão de Consolidação do Histórico 2026 — importação real e idempotente da planilha
 * histórica (lavação + estacionamento) para o período 01/01/2026–30/04/2026, autorizada
 * explicitamente pelo gestor em 11/08/2026 após auditoria aprovada.
 *
 * Lê os JSONs já extraídos e conferidos (dados-importacao/*-extraido.json — gerados por
 * dados-importacao/extract.py, que já filtra DATA < DATA_CORTE_JUMPPARK). Este script
 * REVALIDA o corte por segurança (Etapa 3 da missão: "a rotina de importação deve
 * obrigatoriamente consultar officialHistoricalSource(date)") — nunca confia cegamente no
 * arquivo já filtrado.
 *
 * Idempotente via external_id único real (constraint no banco, não checagem de aplicação):
 * rodar de novo nunca duplica.
 */

interface WashRecordJson {
  externalId: string;
  sourceSheet: string;
  sourceRow: number;
  recordDate: string;
  clientName: string | null;
  vehicleModel: string | null;
  plate: string | null;
  serviceTypeRaw: string | null;
  washAmount: number | null;
  additionalDescription: string | null;
  additionalAmount: number | null;
  discountAmount: number | null;
  totalReceived: number | null;
  paymentMethodRaw: string | null;
  conferenceStatus: string | null;
  machineAmountReceivedRaw: string | null;
  martelinhoRaw: string | null;
}

interface ParkingRecordJson {
  externalId: string;
  sourceSheet: string;
  recordDate: string;
  dayOfWeek: string | null;
  creditAmount: number;
  debitAmount: number;
  pixAmount: number;
  cashAmount: number;
  totalAmount: number;
}

/**
 * Mapeamento serviço → catálogo real — só quando a correspondência é inequívoca (Etapa 5 da
 * missão). CONVENCIONAL/CORTESIA e qualquer variante não listada aqui ficam com
 * canonicalServiceId = null (pendente), nunca aproximados por preço ou suposição.
 */
const SAFE_SERVICE_MAPPING: Record<string, string> = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PARCERIA: "lavacao-parceria-iesa",
  EXTERNA: "lavagem-externa",
  "EXTERNA S/ CERA": "lavagem-externa",
  "EXTERNA C/ CERA LÍQUIDA": "lavagem-externa",
  "EXTERNA C/ CERA PASTA": "lavagem-externa",
  "EXTERNA COM CERA": "lavagem-externa",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const washJson = JSON.parse(readFileSync("dados-importacao/lavacao-extraido.json", "utf-8")) as { records: WashRecordJson[] };
  const parkingJson = JSON.parse(readFileSync("dados-importacao/estacionamento-extraido.json", "utf-8")) as { records: ParkingRecordJson[] };

  const serviceIdByExternalId = new Map<string, string>();
  const serviceRows = await db.select({ id: services.id, externalId: services.externalId }).from(services);
  for (const row of serviceRows) {
    if (row.externalId) serviceIdByExternalId.set(row.externalId, row.id);
  }

  // ---------- LAVAÇÃO ----------
  let washInserted = 0;
  let washAlreadyExisted = 0;
  let washSkippedPostCutoff = 0;
  const mappedCounts: Record<string, number> = {};
  const pendingCounts: Record<string, number> = {};

  for (const record of washJson.records) {
    if (!isSpreadsheetOfficialPeriod(record.recordDate)) {
      // Nunca deveria acontecer (extract.py já filtrou) — checagem de segurança da Etapa 3.
      washSkippedPostCutoff += 1;
      continue;
    }

    const typeKey = record.serviceTypeRaw?.trim().toUpperCase() ?? "";
    const canonicalExternalId = SAFE_SERVICE_MAPPING[typeKey];
    const canonicalServiceId = canonicalExternalId ? (serviceIdByExternalId.get(canonicalExternalId) ?? null) : null;

    if (canonicalServiceId) {
      mappedCounts[typeKey] = (mappedCounts[typeKey] ?? 0) + 1;
    } else {
      pendingCounts[typeKey || "(vazio)"] = (pendingCounts[typeKey || "(vazio)"] ?? 0) + 1;
    }

    const [existing] = await db.select({ id: historicalSpreadsheetWashRecords.id }).from(historicalSpreadsheetWashRecords).where(eq(historicalSpreadsheetWashRecords.externalId, record.externalId)).limit(1);
    if (existing) {
      washAlreadyExisted += 1;
      continue;
    }

    await db.insert(historicalSpreadsheetWashRecords).values({
      externalId: record.externalId,
      sourceSheet: record.sourceSheet,
      sourceRow: record.sourceRow,
      recordDate: record.recordDate,
      clientName: record.clientName,
      vehicleModel: record.vehicleModel,
      plate: record.plate,
      serviceTypeRaw: record.serviceTypeRaw,
      canonicalServiceId,
      washAmount: record.washAmount !== null ? String(record.washAmount) : null,
      additionalDescription: record.additionalDescription,
      additionalAmount: record.additionalAmount !== null ? String(record.additionalAmount) : null,
      discountAmount: record.discountAmount !== null ? String(record.discountAmount) : null,
      totalReceived: record.totalReceived !== null ? String(record.totalReceived) : null,
      paymentMethodRaw: record.paymentMethodRaw,
      conferenceStatus: record.conferenceStatus,
      machineAmountReceivedRaw: record.machineAmountReceivedRaw,
      martelinhoRaw: record.martelinhoRaw,
      source: "historical_spreadsheet",
    });
    washInserted += 1;
  }

  // ---------- ESTACIONAMENTO ----------
  let parkingInserted = 0;
  let parkingAlreadyExisted = 0;
  let parkingSkippedPostCutoff = 0;

  for (const record of parkingJson.records) {
    if (!isSpreadsheetOfficialPeriod(record.recordDate)) {
      parkingSkippedPostCutoff += 1;
      continue;
    }

    const [existing] = await db.select({ id: historicalSpreadsheetParkingRecords.id }).from(historicalSpreadsheetParkingRecords).where(eq(historicalSpreadsheetParkingRecords.externalId, record.externalId)).limit(1);
    if (existing) {
      parkingAlreadyExisted += 1;
      continue;
    }

    await db.insert(historicalSpreadsheetParkingRecords).values({
      externalId: record.externalId,
      sourceSheet: record.sourceSheet,
      recordDate: record.recordDate,
      dayOfWeek: record.dayOfWeek,
      creditAmount: String(record.creditAmount),
      debitAmount: String(record.debitAmount),
      pixAmount: String(record.pixAmount),
      cashAmount: String(record.cashAmount),
      totalAmount: String(record.totalAmount),
      source: "historical_spreadsheet",
    });
    parkingInserted += 1;
  }

  console.log(`DATA_CORTE_JUMPPARK usada nesta importação: ${DATA_CORTE_JUMPPARK}`);
  console.log(`Lavação: ${washInserted} inserido(s), ${washAlreadyExisted} já existia(m), ${washSkippedPostCutoff} rejeitado(s) por estarem >= corte.`);
  console.log(`Lavação — serviços mapeados ao catálogo:`, mappedCounts);
  console.log(`Lavação — serviços pendentes (sem correspondência segura):`, pendingCounts);
  console.log(`Estacionamento: ${parkingInserted} inserido(s), ${parkingAlreadyExisted} já existia(m), ${parkingSkippedPostCutoff} rejeitado(s) por estarem >= corte.`);

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao importar histórico da planilha:", error instanceof Error ? error.message : error);
  process.exit(1);
});
