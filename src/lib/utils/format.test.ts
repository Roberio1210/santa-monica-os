import { describe, expect, it } from "vitest";
import { formatElapsedTime } from "@/lib/utils/format";

describe("formatElapsedTime", () => {
  const now = new Date("2026-08-01T15:00:00Z");

  it("mostra minutos quando menos de 1 hora se passou", () => {
    expect(formatElapsedTime("2026-08-01T14:35:00Z", now)).toBe("25 min");
  });

  it("mostra horas e minutos quando passou mais de 1 hora", () => {
    expect(formatElapsedTime("2026-08-01T12:45:00Z", now)).toBe("2h 15min");
  });

  it("omite os minutos quando são exatamente horas cheias", () => {
    expect(formatElapsedTime("2026-08-01T12:00:00Z", now)).toBe("3h");
  });

  it("mostra dias quando passou mais de 24 horas", () => {
    expect(formatElapsedTime("2026-07-30T15:00:00Z", now)).toBe("2 dias");
  });

  it("nunca mostra tempo negativo, mesmo com timestamp futuro", () => {
    expect(formatElapsedTime("2026-08-01T15:05:00Z", now)).toBe("0 min");
  });
});
