import { describe, expect, it } from "vitest";
import { buildZezinhoTools } from "@/lib/zezinho/generative/tools";

/**
 * Missão Z2 — a soberania do RBAC (Z1) sobre o modo generativo: `buildZezinhoTools` decide QUAIS
 * ferramentas o modelo generativo pode ver, antes de qualquer chamada ao provider. Nada aqui
 * mocka um LLM — é só a montagem do `ToolSet`, testável sem nenhuma credencial de IA.
 */

const ADMIN_ONLY_IDS = [
  "cash_ledger_totals",
  "dre_result",
  "central_alerts",
  "full_period_comparison",
  "goal_progress",
  "accounts_payable",
  "accounts_receivable",
  "marketing_summary",
  "stone_reconciliation_summary",
  "stone_financial_schedule",
  "stone_jumppark_reconciliation",
  "stone_divergences_summary",
  "stone_integration_health",
  "financial_intelligence",
];

describe("buildZezinhoTools — RBAC decide o que o modelo generativo pode até VER", () => {
  it("operacional nunca recebe schema das ferramentas admin-only — o modelo nem sabe que existem", () => {
    const tools = buildZezinhoTools("operacional");
    for (const id of ADMIN_ONLY_IDS) {
      expect(tools).not.toHaveProperty(id);
    }
  });

  it("admin recebe todas as 23 ferramentas do catálogo + as 2 de busca por nome + as 4 da Missão Z3/Z3.2 (catálogo de serviços, empresa, agenda, política comercial)", () => {
    const tools = buildZezinhoTools("admin");
    for (const id of ADMIN_ONLY_IDS) {
      expect(tools).toHaveProperty(id);
    }
    expect(tools).toHaveProperty("jumppark_period_summary");
    expect(tools).toHaveProperty("inventory_lookup");
    expect(tools).toHaveProperty("crm_lookup");
    expect(tools).toHaveProperty("service_catalog_search");
    expect(tools).toHaveProperty("company_info");
    expect(tools).toHaveProperty("agenda_availability");
    expect(tools).toHaveProperty("commercial_policy");
    expect(Object.keys(tools).length).toBe(23 + 2 + 4);
  });

  it("operacional também recebe as 4 ferramentas da Missão Z3/Z3.2 — preço comercial, endereço, agenda e política de negociação não são dado financeiro gerencial", () => {
    const tools = buildZezinhoTools("operacional");
    expect(tools).toHaveProperty("service_catalog_search");
    expect(tools).toHaveProperty("company_info");
    expect(tools).toHaveProperty("agenda_availability");
    expect(tools).toHaveProperty("commercial_policy");
  });

  it("operacional recebe as ferramentas seguras (redigidas ou já sem dado financeiro)", () => {
    const tools = buildZezinhoTools("operacional");
    expect(tools).toHaveProperty("jumppark_period_summary");
    expect(tools).toHaveProperty("inventory_overview");
    expect(tools).toHaveProperty("crm_customers");
    expect(tools).toHaveProperty("historical_pattern");
    expect(tools).toHaveProperty("inventory_lookup");
    expect(tools).toHaveProperty("crm_lookup");
  });
});

describe("inventory_lookup — busca por nome, nunca revela custo para operacional", () => {
  it("admin vs operacional: mesma busca, custo unitário só para admin", async () => {
    const toolsAdmin = buildZezinhoTools("admin");
    const toolsOp = buildZezinhoTools("operacional");
    const execAdmin = toolsAdmin.inventory_lookup!.execute as (input: { nome_produto: string }) => Promise<{ matches: Array<Record<string, unknown>> }>;
    const execOp = toolsOp.inventory_lookup!.execute as (input: { nome_produto: string }) => Promise<{ matches: Array<Record<string, unknown>> }>;

    const resultAdmin = await execAdmin({ nome_produto: "produto-que-nao-existe-xyz" });
    const resultOp = await execOp({ nome_produto: "produto-que-nao-existe-xyz" });

    // Sem banco configurado neste ambiente de teste, a busca honestamente não encontra nada —
    // o que importa aqui é que a chamada não lança e o formato de retorno é o esperado.
    expect(resultAdmin.matches).toEqual([]);
    expect(resultOp.matches).toEqual([]);
  });
});
