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

/**
 * Missão 23 (Auditoria e Consolidação) — como o produto deve ser tratado. Opcional, nunca
 * inferida automaticamente para um item já cadastrado. Fundamental para nunca misturar
 * patrimônio/ferramenta com consumo químico controlado em estoque (ver purchase-import-service.ts).
 */
export type ItemClassification =
  | "quimico_volume"
  | "solido_peso"
  | "consumivel_unidade"
  | "epi"
  | "ferramenta"
  | "equipamento"
  | "patrimonio"
  | "manutencao"
  | "material_divulgacao"
  | "brinde_cliente"
  | "nao_controlado";

export const itemClassifications: ItemClassification[] = [
  "quimico_volume",
  "solido_peso",
  "consumivel_unidade",
  "epi",
  "ferramenta",
  "equipamento",
  "patrimonio",
  "manutencao",
  "material_divulgacao",
  "brinde_cliente",
  "nao_controlado",
];

export const itemClassificationLabels: Record<ItemClassification, string> = {
  quimico_volume: "Produto químico (volume)",
  solido_peso: "Produto sólido (peso)",
  consumivel_unidade: "Consumível (unidade)",
  epi: "EPI",
  ferramenta: "Ferramenta",
  equipamento: "Equipamento",
  patrimonio: "Patrimônio",
  manutencao: "Manutenção",
  material_divulgacao: "Material de divulgação",
  brinde_cliente: "Brinde entregue ao cliente",
  nao_controlado: "Item não controlado em estoque",
};

/** Classificações tratadas como consumo químico/consumível real de estoque — as demais (EPI em diante) nunca entram em cálculos de consumo automático/receita. */
export const STOCK_CONSUMABLE_CLASSIFICATIONS: ItemClassification[] = ["quimico_volume", "solido_peso", "consumivel_unidade"];

/** Missão 23, seção 8 — decisão do usuário para cada linha da importação de compras, na Etapa 2 (confirmação). */
export type PurchaseLineDecision = "vincular_existente" | "criar_produto" | "ignorar" | "patrimonio" | "despesa_manutencao" | "revisar_depois";

export const purchaseLineDecisions: PurchaseLineDecision[] = ["vincular_existente", "criar_produto", "ignorar", "patrimonio", "despesa_manutencao", "revisar_depois"];

export const purchaseLineDecisionLabels: Record<PurchaseLineDecision, string> = {
  vincular_existente: "Vincular a produto existente",
  criar_produto: "Criar novo produto",
  ignorar: "Ignorar esta linha",
  patrimonio: "Marcar como equipamento/patrimônio",
  despesa_manutencao: "Marcar como despesa ou manutenção",
  revisar_depois: "Revisar depois",
};

export type PurchaseLineStatus = "pendente" | "confirmado" | "ignorado" | "duplicado";

export type PurchaseImportStatus = "previa" | "parcial" | "concluido";

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
  /** Estoque ideal (Missão 22) — nível confortável de operação, distinto do mínimo. Definido manualmente, nunca inferido. */
  idealStock: number | null;
  /** Fornecedor mais recente conhecido (Missão 22) — atualizado automaticamente a cada entrada com fornecedor informado. */
  supplier: string | null;
  /** Localização física (Missão 22) — ex.: "Prateleira A". Texto livre. */
  location: string | null;
  /** Missão 23 — nunca inferida automaticamente. */
  classification: ItemClassification | null;
  /** Missão 23 — quando preenchido, este item foi incorporado a outro (consolidação) e não deve mais receber movimentações diretamente. */
  canonicalItemId: string | null;
  /** Missão 23 — data/hora ISO da consolidação, quando `canonicalItemId` está preenchido. */
  consolidatedAt: string | null;
  notes: string | null;
  /** Data da última contagem física, formato ISO (YYYY-MM-DD). */
  lastCountDate: string;
  /** Custo unitário (por unidade de currentQuantity). Null quando não cadastrado. */
  unitCost: number | null;
  /** "measurement_pending" quando o conteúdo real da embalagem ainda não foi medido. Default "confirmed". */
  quantityStatus: QuantityStatus;
  /**
   * Missão de Fechamento de Lacunas Operacionais — opcional (não quebra literais existentes em
   * testes/seeds) para permitir descontinuar um produto sem apagar seu histórico real.
   * `undefined`/`true` = ativo (comportamento padrão de sempre); `false` = inativo, não aparece
   * mais em `listItems()`, mas continua acessível via `getItem`/`listInactiveItems` com todo o
   * histórico intacto.
   */
  active?: boolean;
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
 * "descarte"/"outros" (Missão 22) cobrem os motivos de baixa manual que não tinham tipo
 * correspondente ainda.
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
  | "correcao_inventario"
  | "descarte"
  | "outros";

/** Rótulos em PT-BR para todo o vocabulário de MovementType — usado em toda a UI gerencial de Estoque (Missão 34), nunca duplicado por página. */
export const movementTypeLabels: Record<MovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste_inventario: "Ajuste de inventário",
  perda: "Perda",
  consumo_interno: "Consumo",
  compra: "Compra",
  contagem_fisica_inicial: "Contagem inicial",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  avaria: "Avaria",
  vencimento: "Vencimento",
  devolucao: "Devolução",
  transferencia: "Transferência",
  consumo_teste_calibracao: "Teste/calibração",
  correcao_inventario: "Correção de inventário",
  descarte: "Descarte",
  outros: "Outros",
};

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
  /** Documento/lote de referência (ex.: "STOCKTAKE-2026-07-10", "RECEIPT-2026-07-15") — a Missão 22 reaproveita este campo para "número da nota". */
  reference: string | null;
  /** Fornecedor desta movimentação (Missão 22) — só em entradas/compras. Opcional: movimentações de outros tipos/anteriores à Missão 22 nunca precisam informar. */
  supplier?: string | null;
  /** Preço unitário pago nesta movimentação (Missão 22) — só em entradas/compras; base do custo médio ponderado. Opcional pelo mesmo motivo de `supplier`. */
  unitPricePaid?: number | null;
  /**
   * Chave de idempotência opcional (Missão 34) — quando informada, `recordMovement` nunca cria uma
   * segunda movimentação para o mesmo `externalId`: retorna a já existente, sem alterar saldo de
   * novo. Existe para permitir uma futura sincronização automática de compras (ou qualquer
   * reprocessamento) sem duplicar entrada de estoque. Null/undefined = sem chave, comportamento
   * de sempre (movimentação sempre criada, como em todo formulário manual hoje).
   */
  externalId?: string | null;
  /** Saldo do item imediatamente antes desta movimentação. Null só na 1ª movimentação já existente antes deste campo existir. */
  previousBalance: number | null;
  /** Saldo do item imediatamente após esta movimentação. */
  newBalance: number | null;
}
