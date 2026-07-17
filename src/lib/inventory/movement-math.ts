import type { MovementType } from "@/lib/inventory/types";

/**
 * Regra compartilhada entre StaticInventoryRepository e PostgresInventoryRepository, para que
 * as duas implementações nunca divirjam no significado de cada tipo de movimentação.
 *
 * Somam: entrada, compra, ajuste_positivo, devolucao (produto retorna ao estoque).
 * Subtraem: saida, perda, consumo_interno, ajuste_negativo, avaria, vencimento, transferencia
 * (sai deste estoque), consumo_teste_calibracao.
 * Absolutos (substituem o saldo, não são delta): ajuste_inventario, contagem_fisica_inicial,
 * correcao_inventario.
 */
export function applyMovementDelta(current: number, type: MovementType, quantity: number): number {
  switch (type) {
    case "entrada":
    case "compra":
    case "ajuste_positivo":
    case "devolucao":
      return current + quantity;
    case "saida":
    case "perda":
    case "consumo_interno":
    case "ajuste_negativo":
    case "avaria":
    case "vencimento":
    case "transferencia":
    case "consumo_teste_calibracao":
      return current - quantity;
    case "ajuste_inventario":
    case "contagem_fisica_inicial":
    case "correcao_inventario":
      return quantity;
  }
}
