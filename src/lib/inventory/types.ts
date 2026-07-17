export type InventoryCategory =
  | "Lavagem"
  | "Higienização"
  | "Pneus e borrachas"
  | "Vidros"
  | "Couro"
  | "Plásticos"
  | "Polimento"
  | "Ceras e selantes"
  | "Vitrificação"
  | "Motor e chassi"
  | "Boinas e acessórios"
  | "Equipamentos"
  | "EPIs"
  | "Outros";

export const inventoryCategories: InventoryCategory[] = [
  "Lavagem",
  "Higienização",
  "Pneus e borrachas",
  "Vidros",
  "Couro",
  "Plásticos",
  "Polimento",
  "Ceras e selantes",
  "Vitrificação",
  "Motor e chassi",
  "Boinas e acessórios",
  "Equipamentos",
  "EPIs",
  "Outros",
];

export type InventoryUnit = "L" | "ml" | "kg" | "g" | "unidade" | "caixa";

/**
 * lacrado: embalagem fechada de fábrica.
 * aberto: em uso, sem indicação de estar pela metade (padrão quando a contagem não especifica).
 * pela_metade: recipiente com aproximadamente metade do conteúdo, conforme leitura visual na contagem.
 * estimado: quantidade da contagem é uma aproximação declarada (ex.: "estimado(s)" no registro original).
 */
export type InventoryCondition = "lacrado" | "aberto" | "pela_metade" | "estimado";

export type InventoryStatus = "ok" | "atencao" | "comprar" | "sem_minimo";

/** Líquido/massa nunca são convertidos um no outro — apenas derivado da unidade para exibição. */
export type PhysicalState = "liquido" | "massa" | "peca";

/**
 * "measurement_pending": conteúdo real da embalagem ainda não foi medido fisicamente (ex.:
 * pote de composto polidor sem peso informado na contagem) — nunca inventar esse valor.
 */
export type QuantityStatus = "confirmed" | "measurement_pending";

export interface InventoryItem {
  id: string;
  name: string;
  /** Nome exatamente como informado na origem (contagem/nota), quando diverge do nome canônico. Null quando igual a `name`. */
  originalName: string | null;
  brand: string;
  category: InventoryCategory;
  currentQuantity: number;
  unit: InventoryUnit;
  /** Capacidade de cada embalagem, na mesma unidade do item. Null quando não informado na contagem. */
  packageCapacity: number | null;
  /** Número de embalagens/recipientes que compõem a quantidade atual. Null quando não informado. */
  packageCount: number | null;
  condition: InventoryCondition;
  /** Estoque mínimo definido manualmente. Nunca deve ser inferido — null significa "sem mínimo definido". */
  minimumStock: number | null;
  notes: string | null;
  /** Data da última contagem física, formato ISO (YYYY-MM-DD). */
  lastCountDate: string;
  /** Custo unitário (por unidade de currentQuantity). Null quando não cadastrado. */
  unitCost: number | null;
  /** "measurement_pending" quando o conteúdo real da embalagem ainda não foi medido. Default "confirmed". */
  quantityStatus: QuantityStatus;
}

export interface InventoryItemView extends InventoryItem {
  status: InventoryStatus;
  /** unitCost * currentQuantity, ou null quando unitCost não está cadastrado. */
  stockValue: number | null;
  /** Percentual do conteúdo restante em relação à embalagem, quando packageCapacity é conhecido. */
  fillPercent: number | null;
  /** Derivado só da unidade (ml/L→liquido, g/kg→massa, unidade/caixa→peca) — nunca armazenado. */
  physicalState: PhysicalState;
}

/**
 * Taxa completa de tipos do livro-razão (ver docs do módulo). Todo tipo além dos 6 originais
 * (entrada, saida, ajuste_inventario, perda, consumo_interno, compra) foi adicionado de forma
 * aditiva para suportar contagem inicial, calibração e correções sem perder histórico.
 */
export type MovementType =
  | "entrada"
  | "saida"
  | "ajuste_inventario"
  | "perda"
  | "consumo_interno"
  | "compra"
  | "contagem_fisica_inicial"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "avaria"
  | "vencimento"
  | "devolucao"
  | "transferencia"
  | "consumo_teste_calibracao"
  | "correcao_inventario";

export interface StockMovement {
  id: string;
  itemId: string;
  type: MovementType;
  /**
   * Para tipos de delta (entrada/saida/perda/consumo_interno/compra/ajuste_positivo/
   * ajuste_negativo/avaria/vencimento/devolucao/transferencia/consumo_teste_calibracao):
   * quantidade sempre positiva, o sinal é definido pelo type (ver applyMovementDelta). Para
   * ajuste_inventario/contagem_fisica_inicial/correcao_inventario: quantidade absoluta
   * recontada (novo valor de currentQuantity), não um delta.
   */
  quantity: number;
  unit: InventoryUnit;
  date: string;
  notes: string | null;
  responsible: string | null;
  /** Documento/lote de referência (ex.: "STOCKTAKE-2026-07-10", "RECEIPT-2026-07-15"). */
  reference: string | null;
  /** Saldo do item imediatamente antes desta movimentação. Null só na 1ª movimentação já existente antes deste campo existir. */
  previousBalance: number | null;
  /** Saldo do item imediatamente após esta movimentação. */
  newBalance: number | null;
}
