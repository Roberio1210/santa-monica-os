import { describe, expect, it } from "vitest";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import { OBJECTIVE_DATA_AVAILABILITY } from "@/lib/zezinho/objective/types";
import type { ToolId } from "@/lib/zezinho/tools/types";

const ALL_TOOL_IDS: ToolId[] = [
  "jumppark_period_summary",
  "jumppark_wash_packages",
  "cash_ledger_totals",
  "dre_result",
  "crm_customers",
  "inventory_overview",
  "central_alerts",
  "full_period_comparison",
];

describe("TOOL_REGISTRY — consistência do catálogo", () => {
  it("tem uma definição para cada ToolId conhecido", () => {
    for (const id of ALL_TOOL_IDS) {
      expect(TOOL_REGISTRY[id]).toBeDefined();
      expect(TOOL_REGISTRY[id].id).toBe(id);
    }
  });

  it("toda ferramenta documenta qual service real reaproveita (rastreabilidade)", () => {
    for (const id of ALL_TOOL_IDS) {
      expect(TOOL_REGISTRY[id].reuses.length).toBeGreaterThan(0);
      expect(TOOL_REGISTRY[id].source.length).toBeGreaterThan(0);
    }
  });

  it("todo objetivo referenciado pelas ferramentas é um objetivo de negócio válido", () => {
    const validObjectives = new Set(Object.keys(OBJECTIVE_DATA_AVAILABILITY));
    for (const id of ALL_TOOL_IDS) {
      for (const objective of TOOL_REGISTRY[id].objectives) {
        expect(validObjectives.has(objective)).toBe(true);
      }
    }
  });
});
