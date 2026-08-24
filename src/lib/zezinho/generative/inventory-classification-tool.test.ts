import { describe, expect, it, vi } from "vitest";
import type { InventoryItemView } from "@/lib/inventory/types";

/**
 * Missão de compras 21/22-08-2026 (atualização de estoque/patrimônio) — `inventory_lookup` passou
 * a expor `classificacao` (enum `item_classification` já existente no schema, nunca uma coluna
 * nova) para que o Zézinho distinga PRODUTO CONSUMÍVEL (saldo é insumo, pode esgotar) de
 * FERRAMENTA/EQUIPAMENTO/PATRIMÔNIO (quantidade = disponibilidade do item físico, nunca "serviços
 * restantes"). Mocka `lookupInventoryItems` (sem banco) para travar exatamente esse mapeamento.
 */

const lookupInventoryItemsMock = vi.fn();
vi.mock("@/lib/zezinho/generative/lookups", () => ({
  lookupInventoryItems: (...args: unknown[]) => lookupInventoryItemsMock(...args),
  lookupCrmCustomers: vi.fn(),
}));

function item(overrides: Partial<InventoryItemView> = {}): InventoryItemView {
  return {
    id: "id",
    name: "Item",
    originalName: null,
    brand: "Marca",
    category: "Outros",
    currentQuantity: 1,
    unit: "unidade",
    packageCapacity: null,
    packageCount: null,
    condition: "lacrado",
    minimumStock: null,
    idealStock: null,
    unitCost: null,
    supplier: null,
    location: null,
    classification: null,
    technicalFunction: null,
    usageType: null,
    canonicalItemId: null,
    consolidatedAt: null,
    lastCountDate: "2026-08-21",
    quantityStatus: "confirmed",
    active: true,
    notes: null,
    status: "sem_minimo",
    stockValue: null,
    fillPercent: null,
    physicalState: "peca",
    ...overrides,
  };
}

async function execute(role: "admin" | "operacional", items: InventoryItemView[]) {
  lookupInventoryItemsMock.mockResolvedValue(items);
  const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
  const tools = buildZezinhoTools(role);
  const run = tools.inventory_lookup!.execute as (input: { nome_produto: string }) => Promise<{ matches: Array<Record<string, unknown>> }>;
  return run({ nome_produto: "qualquer" });
}

describe("inventory_lookup — classificação consumível x ferramenta/equipamento/patrimônio", () => {
  it("Glaco (quimico_volume): classificação exposta corretamente", async () => {
    const result = await execute("admin", [item({ name: "Glaco", brand: "Soft99", classification: "quimico_volume", unit: "ml", currentQuantity: 420 })]);
    expect(result.matches[0].classificacao).toBe("quimico_volume");
    expect(result.matches[0].marca).toBe("Soft99");
  });

  it("ferramenta reutilizável (ex.: kit de pincéis): classificação 'ferramenta', quantidade não é insumo consumível", async () => {
    const result = await execute("admin", [item({ name: "Kit 5 Pincéis para Parafusadeira Work Speed", brand: "Kers", classification: "ferramenta", currentQuantity: 1 })]);
    expect(result.matches[0].classificacao).toBe("ferramenta");
  });

  it("equipamento reutilizável (ex.: pulverizador): classificação 'equipamento'", async () => {
    const result = await execute("admin", [item({ name: "Pulverizador Manual Snow Foam 2L — Preto", brand: "Não informado", classification: "equipamento", currentQuantity: 1 })]);
    expect(result.matches[0].classificacao).toBe("equipamento");
  });

  it("mobiliário/patrimônio (ex.: suporte organizador): classificação 'patrimonio', nunca tratado como consumível", async () => {
    const result = await execute("admin", [item({ name: "Suporte Organizador JDR + 2 Prateleiras", brand: "JDR", classification: "patrimonio", currentQuantity: 1, unitCost: null })]);
    expect(result.matches[0].classificacao).toBe("patrimonio");
  });

  it("ausência de custo (ex.: pulverizadores, suporte) nunca gera valor inventado — custo_unitario fica null mesmo para admin", async () => {
    const result = await execute("admin", [item({ name: "Pulverizador Manual Snow Foam 2L — Amarelo (3 bicos)", classification: "equipamento", unitCost: null })]);
    expect(result.matches[0].custo_unitario).toBeNull();
  });

  it("operacional nunca recebe custo_unitario, mesmo quando o item tem custo real cadastrado", async () => {
    const result = await execute("operacional", [item({ name: "Escova para Cintos de Segurança", brand: "Full Detail", classification: "ferramenta", unitCost: 30.43 })]);
    expect(result.matches[0].custo_unitario).toBeNull();
    expect(result.matches[0].classificacao).toBe("ferramenta");
  });
});
