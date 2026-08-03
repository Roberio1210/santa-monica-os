import { describe, expect, it } from "vitest";
import { auditReportRowsToCsv, buildAuditReportRows } from "@/lib/inventory/audit-report";
import type { DataQualityIssue } from "@/lib/inventory/data-quality-audit";
import type { DuplicateSuspect } from "@/lib/inventory/duplicate-detection";
import type { InventoryItem } from "@/lib/inventory/types";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Izer Vonixx",
    originalName: null,
    brand: "Vonixx",
    category: "Vitrificação",
    currentQuantity: 1000,
    unit: "ml",
    packageCapacity: null,
    packageCount: null,
    condition: "aberto",
    minimumStock: null,
    idealStock: null,
    supplier: null,
    location: null,
    classification: null,
    canonicalItemId: null,
    consolidatedAt: null,
    notes: null,
    lastCountDate: "2026-07-10",
    unitCost: 0.05,
    quantityStatus: "confirmed",
    ...overrides,
  };
}

function issue(overrides: Partial<DataQualityIssue> = {}): DataQualityIssue {
  return {
    id: "item-1:sem_custo",
    itemId: "item-1",
    ruleId: "sem_custo",
    severity: "atencao",
    title: "Custo zerado",
    explanation: "explicação",
    sourceRef: null,
    recommendedAction: "Cadastrar custo",
    ...overrides,
  };
}

describe("buildAuditReportRows", () => {
  it("nunca inclui produto já consolidado (canonicalItemId preenchido)", () => {
    const rows = buildAuditReportRows([item({ id: "item-2", canonicalItemId: "item-1" })], [], []);
    expect(rows).toEqual([]);
  });

  it("agrega os problemas do item e escolhe a maior gravidade", () => {
    const issues = [issue({ severity: "atencao", title: "Custo zerado" }), issue({ severity: "critico", title: "Saldo negativo", ruleId: "saldo_negativo" })];
    const rows = buildAuditReportRows([item()], issues, []);
    expect(rows[0].highestSeverity).toBe("critico");
    expect(rows[0].issuesFound).toContain("Custo zerado");
    expect(rows[0].issuesFound).toContain("Saldo negativo");
  });

  it("conta duplicidades suspeitas envolvendo o item, nos dois lados do par", () => {
    const suspects: DuplicateSuspect[] = [
      { itemAId: "item-1", itemBId: "item-2", reasons: ["motivo"], similarity: 90 },
      { itemAId: "item-3", itemBId: "item-1", reasons: ["motivo"], similarity: 80 },
    ];
    const rows = buildAuditReportRows([item()], [], suspects);
    expect(rows[0].possibleDuplicatesCount).toBe(2);
  });

  it("item sem nenhum problema tem gravidade nula e ação recomendada honesta", () => {
    const rows = buildAuditReportRows([item()], [], []);
    expect(rows[0].highestSeverity).toBeNull();
    expect(rows[0].recommendedAction).toMatch(/nenhuma ação/i);
  });
});

describe("auditReportRowsToCsv", () => {
  it("gera cabeçalho e uma linha por produto", () => {
    const rows = buildAuditReportRows([item()], [], []);
    const csv = auditReportRowsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Produto");
    expect(lines[1]).toContain("Izer Vonixx");
  });

  it("escapa campos com vírgula ou aspas", () => {
    const rows = buildAuditReportRows([item({ name: 'Cera "Premium", 500ml' })], [], []);
    const csv = auditReportRowsToCsv(rows);
    expect(csv).toContain('"Cera ""Premium"", 500ml"');
  });
});
