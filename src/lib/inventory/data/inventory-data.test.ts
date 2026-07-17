import { describe, expect, it } from "vitest";
import { initialCount20260710 } from "@/lib/inventory/data/initial-count-2026-07-10";
import { receiptNewItems2026_07, receiptRestocks2026_07 } from "@/lib/inventory/data/receipts-2026-07";

const LEGACY_UNITS = new Set(["L", "kg"]);

describe("initialCount20260710 — contagem física de 10/07/2026", () => {
  it("tem 48 itens, exatamente como transcrito da contagem", () => {
    expect(initialCount20260710).toHaveLength(48);
  });

  it("nunca armazena litros ou quilos — tudo padronizado em ml/g/unidade/caixa", () => {
    for (const item of initialCount20260710) {
      expect(LEGACY_UNITS.has(item.unit)).toBe(false);
    }
  });

  it("todo id é único (chave de idempotência do seed)", () => {
    const ids = initialCount20260710.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("só os 2 itens com conteúdo real desconhecido ficam measurement_pending", () => {
    const pending = initialCount20260710.filter((i) => i.quantityStatus === "measurement_pending").map((i) => i.id);
    expect(pending.sort()).toEqual(["composto-polidor-extra-forte-corte-farben", "hard-cleaner-wax-xtreme-expert"].sort());
  });
});

describe("receipts-2026-07 — entradas de 15, 16 e 17/07/2026", () => {
  it("tem 17 itens novos, cada um com id único e não colidindo com a contagem de 10/07", () => {
    expect(receiptNewItems2026_07).toHaveLength(17);
    const receiptIds = new Set(receiptNewItems2026_07.map((i) => i.id));
    expect(receiptIds.size).toBe(receiptNewItems2026_07.length);

    const stocktakeIds = new Set(initialCount20260710.map((i) => i.id));
    for (const id of receiptIds) {
      expect(stocktakeIds.has(id)).toBe(false);
    }
  });

  it("nunca armazena litros ou quilos nas entradas novas", () => {
    for (const item of receiptNewItems2026_07) {
      expect(LEGACY_UNITS.has(item.unit)).toBe(false);
    }
  });

  it("o Composto Polidor Extra Forte de 16/07 é um lote separado do item pendente de 10/07 — nunca fundido", () => {
    const newLot = receiptNewItems2026_07.find((i) => i.id === "composto-polidor-extra-forte-farben-lote-2026-07-16");
    expect(newLot).toBeDefined();
    expect(newLot?.id).not.toBe("composto-polidor-extra-forte-corte-farben");
    expect(newLot?.quantityStatus ?? "confirmed").toBe("confirmed");

    const originalStillPending = initialCount20260710.find((i) => i.id === "composto-polidor-extra-forte-corte-farben");
    expect(originalStillPending?.quantityStatus).toBe("measurement_pending");
  });

  it("cada item novo referencia um RECEIPT válido (15, 16 ou 17/07/2026)", () => {
    const validReferences = new Set(["RECEIPT-2026-07-15", "RECEIPT-2026-07-16", "RECEIPT-2026-07-17"]);
    for (const item of receiptNewItems2026_07) {
      expect(validReferences.has(item.reference)).toBe(true);
    }
  });

  it("todo restock aponta para um item já existente na contagem de 10/07", () => {
    const stocktakeIds = new Set(initialCount20260710.map((i) => i.id));
    for (const restock of receiptRestocks2026_07) {
      expect(stocktakeIds.has(restock.itemExternalId)).toBe(true);
    }
  });
});
