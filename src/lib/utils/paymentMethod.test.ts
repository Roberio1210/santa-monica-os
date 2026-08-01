import { describe, expect, it } from "vitest";
import { classifyPaymentMethod } from "@/lib/utils/paymentMethod";

describe("classifyPaymentMethod", () => {
  it("classifica dinheiro, débito, crédito e pix, com e sem acento", () => {
    expect(classifyPaymentMethod("Dinheiro")).toBe("dinheiro");
    expect(classifyPaymentMethod("Cash")).toBe("dinheiro");
    expect(classifyPaymentMethod("Débito")).toBe("debito");
    expect(classifyPaymentMethod("Debito")).toBe("debito");
    expect(classifyPaymentMethod("Crédito")).toBe("credito");
    expect(classifyPaymentMethod("Credito")).toBe("credito");
    expect(classifyPaymentMethod("Pix")).toBe("pix");
  });

  it("valor não reconhecido vira 'outro', nunca lança", () => {
    expect(classifyPaymentMethod("Vale-refeição")).toBe("outro");
    expect(classifyPaymentMethod("")).toBe("outro");
  });
});
