import { describe, expect, it } from "vitest";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";

describe("looksLikePhone / looksLikePlate", () => {
  it("telefone com só dígitos é reconhecido como telefone, nunca placa", () => {
    expect(looksLikePhone("48999998888")).toBe(true);
    expect(looksLikePlate("48999998888")).toBe(false);
  });

  it("placa com letra é reconhecida como placa, nunca telefone", () => {
    expect(looksLikePlate("ABC1D23")).toBe(true);
    expect(looksLikePhone("ABC1D23")).toBe(false);
  });

  it("texto curto demais não é reconhecido como nenhum dos dois", () => {
    expect(looksLikePhone("12")).toBe(false);
    expect(looksLikePlate("AB")).toBe(false);
  });
});
