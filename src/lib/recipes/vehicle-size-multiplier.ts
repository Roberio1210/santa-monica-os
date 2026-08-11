import type { OrderVehicleCategory } from "@/lib/jumppark-orders/types";
import type { ProcessStep } from "@/lib/recipes/types";

/**
 * Missão de Automação JumpPark → Consumo, seção 6 — multiplicador de consumo por porte do
 * veículo, aplicado só a etapas sensíveis à área (nunca a produtos usados em quantidade fixa).
 *
 * LIMITAÇÃO DOCUMENTADA: a missão pediu 5 níveis (Hatch pequeno/Sedan/SUV médio/SUV grande/
 * Caminhonete), mas o schema real (`vehicle_category_assignments`/`service_consumption_rules`)
 * só distingue 4 categorias (hatch/sedan/suv/caminhonete) — não há separação SUV médio/grande em
 * nenhuma estrutura existente hoje, e criar essa distinção exigiria uma migração de enum que
 * atravessa Fase B/D inteiras só para um multiplicador. Decisão desta missão: usar 1.15 (o valor
 * de "SUV médio") para toda a categoria "suv", documentado aqui explicitamente — nunca escondido.
 */
export const VEHICLE_SIZE_MULTIPLIER: Record<Exclude<OrderVehicleCategory, "desconhecido">, number> = {
  hatch: 0.9,
  sedan: 1.0,
  suv: 1.15,
  caminhonete: 1.3,
};

/**
 * Etapas sensíveis à área do veículo (mais carroceria = mais solução). Pneus, clay bar e itens de
 * quantidade fixa/desgaste ficam de fora de propósito — nunca recebem o multiplicador "cego".
 */
export const AREA_SENSITIVE_STEPS: ProcessStep[] = ["pre_lavagem", "shampoo", "vidros", "protecao_externa", "limpeza_interna", "cera"];

/**
 * Retorna 1 (sem ajuste) quando a categoria é "desconhecida" (nunca inventa porte) ou quando a
 * etapa não é sensível à área — nesses casos o consumo é sempre a quantidade de referência pura.
 */
export function getVehicleSizeMultiplier(category: OrderVehicleCategory, processStep: ProcessStep): number {
  if (category === "desconhecido") return 1;
  if (!AREA_SENSITIVE_STEPS.includes(processStep)) return 1;
  return VEHICLE_SIZE_MULTIPLIER[category];
}
