import type { MovementType } from "@/lib/inventory/types";

/**
 * Regra compartilhada entre StaticInventoryRepository e PostgresInventoryRepository, para que
 * as duas implementações nunca divirjam no significado de cada tipo de movimentação.
 *
 * entrada/compra somam; saida/perda/consumo_interno subtraem; ajuste_inventario substitui pelo
 * valor absoluto recontado (não é um delta).
 */
export function applyMovementDelta(current: number, type: MovementType, quantity: number): number {
  switch (type) {
    case "entrada":
    case "compra":
      return current + quantity;
    case "saida":
    case "perda":
    case "consumo_interno":
      return current - quantity;
    case "ajuste_inventario":
      return quantity;
  }
}
