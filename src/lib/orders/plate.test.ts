import { describe, expect, it } from "vitest";
import { normalizePlate, slugifyServiceName } from "@/lib/orders/plate";

describe("normalizePlate", () => {
  it("maiúscula e sem espaços", () => {
    expect(normalizePlate(" abc 1d23 ")).toBe("ABC1D23");
  });

  it("retorna null quando não há placa — nunca inventa uma", () => {
    expect(normalizePlate(null)).toBeNull();
    expect(normalizePlate(undefined)).toBeNull();
    expect(normalizePlate("")).toBeNull();
  });
});

describe("slugifyServiceName", () => {
  it("gera um slug estável a partir do texto real do JumpPark", () => {
    expect(slugifyServiceName("Lavagem Completa Gold")).toBe("lavagem-completa-gold");
  });

  it("remove acentos e caracteres especiais", () => {
    expect(slugifyServiceName("Higienização Interna (Básica)")).toBe("higienizacao-interna-basica");
  });
});
