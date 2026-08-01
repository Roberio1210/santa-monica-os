import { describe, expect, it } from "vitest";
import { unmaskForOperationalView } from "@/lib/painel-gerencial/operational-view";

describe("unmaskForOperationalView", () => {
  it("retorna o valor completo, sem máscara", () => {
    expect(unmaskForOperationalView("ABC1D23")).toBe("ABC1D23");
    expect(unmaskForOperationalView("48999998888")).toBe("48999998888");
  });

  it("nunca inventa valor para dado ausente", () => {
    expect(unmaskForOperationalView(null)).toBeNull();
    expect(unmaskForOperationalView(undefined)).toBeNull();
    expect(unmaskForOperationalView("   ")).toBeNull();
  });
});
