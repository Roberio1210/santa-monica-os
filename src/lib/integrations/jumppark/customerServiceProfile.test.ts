import { describe, expect, it } from "vitest";
import { serviceCategoryOf } from "@/lib/integrations/jumppark/customerServiceProfile";

describe("serviceCategoryOf", () => {
  it("colapsa variantes de tamanho de veículo na mesma categoria de tier", () => {
    expect(serviceCategoryOf("Lavação Gold - SUV")).toBe("Lavação Gold");
    expect(serviceCategoryOf("Lavação Gold - Hatch")).toBe("Lavação Gold");
    expect(serviceCategoryOf("Lavação Bronze - SUV/SEDAN")).toBe("Lavação Bronze");
  });

  it("descrição sem ' - ' vira a própria categoria, sem alteração", () => {
    expect(serviceCategoryOf("Glaco/Cristalização")).toBe("Glaco/Cristalização");
    expect(serviceCategoryOf("Motor")).toBe("Motor");
  });

  it("descrições parecidas mas com prefixos diferentes viram categorias diferentes (limitação real, não inventa correspondência)", () => {
    expect(serviceCategoryOf("Polimento - Comercial")).toBe("Polimento");
    expect(serviceCategoryOf("Polimento Peça - Cliente")).toBe("Polimento Peça");
    expect(serviceCategoryOf("Polimento - Comercial")).not.toBe(serviceCategoryOf("Polimento Peça - Cliente"));
  });
});
