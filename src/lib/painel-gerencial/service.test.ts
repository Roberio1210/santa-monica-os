import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolvePeriod } from "@/lib/utils/timezone";
import { previousPeriodOf } from "@/lib/painel-gerencial/service";

describe("previousPeriodOf — filtros de período e comparação", () => {
  it("para 'hoje', o período anterior é exatamente ontem", () => {
    const today = resolvePeriod("today", undefined, new Date("2026-07-20T15:00:00-03:00"));
    const previous = previousPeriodOf(today);
    expect(previous).toEqual({ from: "2026-07-19", to: "2026-07-19" });
  });

  it("para um período de 7 dias, o anterior tem os mesmos 7 dias imediatamente antes", () => {
    const last7 = resolvePeriod("last7days", undefined, new Date("2026-07-20T15:00:00-03:00"));
    const previous = previousPeriodOf(last7);
    expect(previous.to).toBe("2026-07-13");
    expect(previous.from).toBe("2026-07-07");
  });

  it("para um período personalizado de 1 dia, o anterior também tem 1 dia", () => {
    const custom = resolvePeriod("custom", { from: "2026-07-10", to: "2026-07-10" });
    const previous = previousPeriodOf(custom);
    expect(previous).toEqual({ from: "2026-07-09", to: "2026-07-09" });
  });
});

describe("segurança dos logs — nenhum módulo do Painel Gerencial registra dado sensível em log", () => {
  it("nenhum arquivo de src/lib/painel-gerencial usa console.* diretamente", () => {
    const dir = path.resolve(__dirname);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(path.join(dir, file), "utf-8");
      expect(content, `${file} não deve chamar console.*`).not.toMatch(/console\.(log|warn|error|info|debug)\s*\(/);
    }
  });
});
