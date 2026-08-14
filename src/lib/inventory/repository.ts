import type { InventoryItem, StockMovement } from "@/lib/inventory/types";

/**
 * Contrato de acesso a dados de estoque, desacoplado da implementação. Uma futura
 * implementação com banco de dados real (ex.: Postgres/Neon) deve satisfazer esta mesma
 * interface, sem exigir mudanças nos componentes que a consomem.
 */
export interface InventoryRepository {
  listItems(): Promise<InventoryItem[]>;
  /**
   * Missão de Fechamento de Lacunas Operacionais — produtos com `active=false`, para que
   * desativar um produto nunca signifique perdê-lo: continua encontrável, só sai da listagem
   * padrão de `listItems()`.
   */
  listInactiveItems(): Promise<InventoryItem[]>;
  getItem(id: string): Promise<InventoryItem | null>;
  listMovements(itemId?: string): Promise<StockMovement[]>;
  /**
   * Registra uma movimentação e atualiza a quantidade do item correspondente. `previousBalance`
   * e `newBalance` são sempre calculados pela própria implementação a partir do saldo do item
   * no momento do registro — nunca informados pelo chamador — para que o saldo do livro-razão
   * nunca divirja da regra de negócio (applyMovementDelta).
   * Implementações sem persistência real (ex.: StaticInventoryRepository) devem deixar
   * claro que o efeito não sobrevive a um novo cold start em ambiente serverless.
   */
  recordMovement(movement: Omit<StockMovement, "id" | "previousBalance" | "newBalance">): Promise<StockMovement>;
  /**
   * Missão de Consolidação da Contagem de Estoque V1 — núcleo canônico de UMA posição física
   * confiável: registra o movimento `correcao_inventario` (absoluto) E atualiza
   * `currentQuantity`/`lastCountDate`/`quantityStatus='confirmed'` do item, atomicamente (mesma
   * transação na implementação real) — nunca as duas coisas como chamadas separadas, que
   * deixariam uma janela onde o movimento existe mas o item não reflete a contagem. Único
   * caminho usado tanto pela contagem rápida quanto pela confirmação em lote.
   */
  recordPhysicalCount(input: { itemId: string; countedQuantity: number; date: string; responsible: string; reference: string | null; notes: string | null }): Promise<StockMovement>;
  /**
   * Atualiza só metadados complementares do item (Missão 22) — nunca quantidade/saldo, que só
   * mudam via `recordMovement`. Usada tanto pela edição manual (fornecedor/localização/estoque
   * mínimo/estoque ideal) quanto pela atualização automática do custo médio após uma entrada.
   * `lastCountDate`/`quantityStatus` (Missão de Estoque Gerencial V2) — metadados SOBRE uma
   * contagem já registrada via `recordMovement`, nunca uma via alternativa de alterar saldo.
   */
  updateItemDetails(
    id: string,
    patch: Partial<Pick<InventoryItem, "supplier" | "location" | "minimumStock" | "idealStock" | "unitCost" | "classification" | "canonicalItemId" | "consolidatedAt" | "name" | "brand" | "category" | "lastCountDate" | "quantityStatus">>,
  ): Promise<InventoryItem>;
  /**
   * Missão 23 — usada para desativar um item incorporado numa consolidação. Reaproveitada na
   * Missão de Fechamento de Lacunas Operacionais para descontinuar/reativar um produto pela
   * interface (nunca exclusão destrutiva). `getItem`/histórico continuam funcionando
   * normalmente para um item inativo; apenas `listItems()` deixa de trazê-lo na listagem padrão
   * (ver `listInactiveItems`).
   */
  setItemActive(id: string, active: boolean): Promise<void>;
}
