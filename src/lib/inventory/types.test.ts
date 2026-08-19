import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_STOCK_BEHAVIOR,
  itemClassifications,
  itemClassificationDescriptions,
  itemClassificationLabels,
  STOCK_CONSUMABLE_CLASSIFICATIONS,
  STOCK_TRACKED_CLASSIFICATIONS,
} from "@/lib/inventory/types";

/**
 * Missão Financeiro V5.2 — cobre o mapeamento central de classificação (label + descrição)
 * criado para tornar `ItemClassification` visível na UI de estoque. Nunca testa renderização
 * (o projeto não tem @testing-library/react instalado e esta missão não introduziu uma
 * dependência nova só para isso) — testa a fonte de verdade que a UI consome.
 */
describe("itemClassificationLabels — toda classificação tem rótulo amigável", () => {
  it("cobre exatamente as 11 classificações do enum, sem sobra nem falta", () => {
    expect(Object.keys(itemClassificationLabels).sort()).toEqual([...itemClassifications].sort());
  });

  it("nenhum rótulo expõe o nome técnico bruto (ex.: 'quimico_volume')", () => {
    for (const c of itemClassifications) {
      expect(itemClassificationLabels[c]).not.toBe(c);
      expect(itemClassificationLabels[c]).not.toMatch(/_/);
    }
  });
});

describe("itemClassificationDescriptions — toda classificação tem descrição de comportamento", () => {
  it("cobre exatamente as 11 classificações do enum, sem sobra nem falta", () => {
    expect(Object.keys(itemClassificationDescriptions).sort()).toEqual([...itemClassifications].sort());
  });

  it("nenhuma descrição está vazia", () => {
    for (const c of itemClassifications) {
      expect(itemClassificationDescriptions[c].length).toBeGreaterThan(10);
    }
  });

  it("classificações elegíveis para baixa automática por receita mencionam isso na descrição", () => {
    for (const c of STOCK_CONSUMABLE_CLASSIFICATIONS) {
      expect(itemClassificationDescriptions[c]).toMatch(/baixa automática por receita/i);
    }
  });

  it("ferramenta e equipamento (reutilizáveis) mencionam explicitamente que não sofrem baixa automática", () => {
    expect(itemClassificationDescriptions.ferramenta).toMatch(/nunca sofre baixa automática/i);
    expect(itemClassificationDescriptions.equipamento).toMatch(/nunca sofre baixa automática/i);
  });

  it("classificações consumíveis fora do motor de receita (epi/manutencao/material_divulgacao/brinde_cliente) deixam isso explícito", () => {
    const consumableButNotRecipeEligible = itemClassifications.filter(
      (c) => CLASSIFICATION_STOCK_BEHAVIOR[c].consumable && !STOCK_CONSUMABLE_CLASSIFICATIONS.includes(c),
    );
    expect(consumableButNotRecipeEligible.sort()).toEqual(["brinde_cliente", "epi", "manutencao", "material_divulgacao"].sort());
    for (const c of consumableButNotRecipeEligible) {
      expect(itemClassificationDescriptions[c]).toMatch(/não participa do motor de baixa automática/i);
    }
  });
});

describe("Consistência entre os três mapeamentos de classificação (label, descrição, comportamento)", () => {
  it("STOCK_TRACKED_CLASSIFICATIONS é exatamente o conjunto com tracksQuantity=true", () => {
    const expected = itemClassifications.filter((c) => CLASSIFICATION_STOCK_BEHAVIOR[c].tracksQuantity).sort();
    expect([...STOCK_TRACKED_CLASSIFICATIONS].sort()).toEqual(expected);
  });

  it("patrimonio e nao_controlado permanecem fora do controle de quantidade (não alterados por esta missão)", () => {
    expect(CLASSIFICATION_STOCK_BEHAVIOR.patrimonio.tracksQuantity).toBe(false);
    expect(CLASSIFICATION_STOCK_BEHAVIOR.nao_controlado.tracksQuantity).toBe(false);
  });

  it("ferramenta e equipamento controlam quantidade mas não são consumíveis", () => {
    expect(CLASSIFICATION_STOCK_BEHAVIOR.ferramenta).toEqual({ tracksQuantity: true, consumable: false });
    expect(CLASSIFICATION_STOCK_BEHAVIOR.equipamento).toEqual({ tracksQuantity: true, consumable: false });
  });
});
