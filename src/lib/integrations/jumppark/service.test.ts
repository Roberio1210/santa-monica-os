import { describe, expect, it } from "vitest";
import { mapOperationOrders } from "@/lib/integrations/jumppark/service";
import type { JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";

describe("mapOperationOrders", () => {
  it("só inclui ordens finalizadas (com exitDateTime)", () => {
    const orders: JumpParkServiceOrder[] = [
      { serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" },
      { serviceOrderId: "2", entryDateTime: "2026-08-01 10:00:00" }, // ainda no pátio, sem saída
    ];
    const result = mapOperationOrders(orders);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("deriva a data (YYYY-MM-DD) a partir de entryDateTime", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", entryDateTime: "2026-08-01 08:00:00", exitDateTime: "2026-08-01 09:00:00" }];
    expect(mapOperationOrders(orders)[0].date).toBe("2026-08-01");
  });

  it("cai para exitDateTime quando entryDateTime está ausente", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", exitDateTime: "2026-08-02 18:00:00" }];
    expect(mapOperationOrders(orders)[0].date).toBe("2026-08-02");
  });

  it("nunca inventa placa/telefone completos — sempre mascarados", () => {
    const orders: JumpParkServiceOrder[] = [{ serviceOrderId: "1", exitDateTime: "2026-08-01 09:00:00", plate: "ABC1D23", clientPhone: "48999998888" }];
    const result = mapOperationOrders(orders)[0];
    expect(result.plateMasked).not.toBe("ABC1D23");
    expect(result.clientPhoneMasked).not.toBe("48999998888");
  });
});
