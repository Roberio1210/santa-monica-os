import { describe, expect, it } from "vitest";
import { maskPhone, maskPlate } from "@/lib/utils/mask";

describe("maskPlate", () => {
  it("mantém só as 2 primeiras e 2 últimas posições visíveis", () => {
    expect(maskPlate("ABC1D23")).toBe("AB***23");
  });

  it("nunca expõe uma placa completa", () => {
    const masked = maskPlate("XYZ9988");
    expect(masked).not.toBe("XYZ9988");
    expect(masked).toContain("***");
  });

  it("retorna 'Não informado' quando não há placa — nunca inventa uma", () => {
    expect(maskPlate(null)).toBe("Não informado");
    expect(maskPlate(undefined)).toBe("Não informado");
  });
});

describe("maskPhone", () => {
  it("expõe só os 2 últimos dígitos", () => {
    expect(maskPhone("47999998877")).toBe("*******77");
  });

  it("nunca expõe um telefone completo", () => {
    const masked = maskPhone("47988887777");
    expect(masked).not.toContain("988887777");
  });

  it("retorna null quando não há telefone — nunca inventa um", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
  });
});
