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

export interface InventoryItem {
  id: string;
  name: string;
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
}

export interface InventoryItemView extends InventoryItem {
  status: InventoryStatus;
  /** unitCost * currentQuantity, ou null quando unitCost não está cadastrado. */
  stockValue: number | null;
  /** Percentual do conteúdo restante em relação à embalagem, quando packageCapacity é conhecido. */
  fillPercent: number | null;
}

export type MovementType =
  | "entrada"
  | "saida"
  | "ajuste_inventario"
  | "perda"
  | "consumo_interno"
  | "compra";

export interface StockMovement {
  id: string;
  itemId: string;
  type: MovementType;
  /**
   * Para entrada/saida/perda/consumo_interno/compra: quantidade delta (sempre positiva, o sinal é
   * definido pelo type). Para ajuste_inventario: quantidade absoluta recontada (novo valor de
   * currentQuantity), não um delta.
   */
  quantity: number;
  unit: InventoryUnit;
  date: string;
  notes: string | null;
  responsible: string | null;
}
