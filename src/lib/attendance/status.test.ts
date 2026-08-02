import { describe, expect, it } from "vitest";
import { isFinalStatus, nextStatus } from "@/lib/attendance/status";

describe("nextStatus", () => {
  it("segue a sequência operacional completa", () => {
    expect(nextStatus("aguardando_execucao")).toBe("em_execucao");
    expect(nextStatus("em_execucao")).toBe("aguardando_conferencia");
    expect(nextStatus("aguardando_conferencia")).toBe("pronto_entrega");
    expect(nextStatus("pronto_entrega")).toBe("entregue");
  });

  it("retorna null quando já está no status final", () => {
    expect(nextStatus("entregue")).toBeNull();
  });
});

describe("isFinalStatus", () => {
  it("só 'entregue' é final", () => {
    expect(isFinalStatus("entregue")).toBe(true);
    expect(isFinalStatus("pronto_entrega")).toBe(false);
    expect(isFinalStatus("aguardando_execucao")).toBe(false);
  });
});
