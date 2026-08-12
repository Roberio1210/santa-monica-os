/**
 * Missão de Consolidação do Histórico 2026 — decisão de negócio DEFINITIVA, confirmada pelo
 * gestor em 11/08/2026, após auditoria dia a dia do uso real do JumpPark em maio/2026 (ver
 * docs/historical-data-precedence.md para a auditoria completa e a justificativa).
 *
 * REGRA DE PRECEDÊNCIA (nunca as duas fontes ao mesmo tempo, nunca somadas):
 *   - Antes de DATA_CORTE_JUMPPARK: a PLANILHA HISTÓRICA é a fonte oficial.
 *   - A partir de DATA_CORTE_JUMPPARK (inclusive): o JUMPPARK é a fonte oficial EXCLUSIVA.
 *   - Havendo divergência entre as duas fontes no período coberto pelo JumpPark, o JumpPark
 *     sempre prevalece — a planilha nunca complementa nem corrige o período do JumpPark.
 *   - Nenhuma rotina de histórico/faturamento/serviços/consumo de estoque deve ler
 *     `jumppark_service_orders` sem filtrar por este corte, nem somar registros da planilha
 *     com registros do JumpPark no mesmo período.
 *
 * Esta é a ÚNICA fonte de verdade para essa data no código — nunca redeclarar/hardcodar em
 * outro lugar. Qualquer rotina futura de importação de planilha ou de recontrução de histórico
 * deve importar daqui.
 */
export const DATA_CORTE_JUMPPARK = "2026-05-01";

export type HistoricalDataSource = "historical_spreadsheet" | "jumppark";

/** true quando a data está no período em que a PLANILHA HISTÓRICA é a fonte oficial (antes do corte). */
export function isSpreadsheetOfficialPeriod(dateIso: string): boolean {
  return dateIso < DATA_CORTE_JUMPPARK;
}

/** true quando a data está no período em que o JUMPPARK é a fonte oficial exclusiva (a partir do corte, inclusive). */
export function isJumpParkOfficialPeriod(dateIso: string): boolean {
  return dateIso >= DATA_CORTE_JUMPPARK;
}

/** Fonte oficial para uma data específica — nunca as duas ao mesmo tempo, nunca somadas. */
export function officialHistoricalSource(dateIso: string): HistoricalDataSource {
  return isJumpParkOfficialPeriod(dateIso) ? "jumppark" : "historical_spreadsheet";
}
