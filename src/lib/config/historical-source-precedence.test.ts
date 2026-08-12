import { describe, expect, it } from "vitest";
import { DATA_CORTE_JUMPPARK, isJumpParkOfficialPeriod, isSpreadsheetOfficialPeriod, officialHistoricalSource } from "@/lib/config/historical-source-precedence";

describe("regra de precedência histórica — Missão de Consolidação do Histórico 2026", () => {
  it("DATA_CORTE_JUMPPARK é 2026-05-01, conforme confirmado pelo gestor", () => {
    expect(DATA_CORTE_JUMPPARK).toBe("2026-05-01");
  });

  it("datas antes do corte são período oficial da planilha, nunca do JumpPark", () => {
    expect(isSpreadsheetOfficialPeriod("2026-04-30")).toBe(true);
    expect(isJumpParkOfficialPeriod("2026-04-30")).toBe(false);
    expect(officialHistoricalSource("2026-01-15")).toBe("historical_spreadsheet");
  });

  it("o próprio dia do corte já é oficial do JumpPark (inclusive), nunca da planilha", () => {
    expect(isJumpParkOfficialPeriod("2026-05-01")).toBe(true);
    expect(isSpreadsheetOfficialPeriod("2026-05-01")).toBe(false);
    expect(officialHistoricalSource("2026-05-01")).toBe("jumppark");
  });

  it("datas depois do corte permanecem exclusivamente JumpPark", () => {
    expect(officialHistoricalSource("2026-08-10")).toBe("jumppark");
  });

  it("nunca as duas fontes são oficiais na mesma data — sempre mutuamente exclusivas", () => {
    for (const date of ["2026-01-01", "2026-04-30", "2026-05-01", "2026-05-02", "2026-08-11"]) {
      expect(isSpreadsheetOfficialPeriod(date)).toBe(!isJumpParkOfficialPeriod(date));
    }
  });
});
