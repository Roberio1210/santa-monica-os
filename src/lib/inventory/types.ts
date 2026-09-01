import type { RecipeUsageType, TechnicalFunction } from "@/lib/recipes/types";

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

/**
 * Missão Financeiro V5.2 — descrição curta do comportamento REAL de cada classificação, para
 * exibição na UI (lista/detalhe de produtos). Nunca inventa comportamento: cada texto reflete
 * exatamente `CLASSIFICATION_STOCK_BEHAVIOR` (controla quantidade / é consumível fisicamente) e
 * `STOCK_CONSUMABLE_CLASSIFICATIONS` (elegibilidade para baixa automática por receita de serviço,
 * que é mais restrita do que "consumível" em geral — ex.: EPI e manutenção são fisicamente
 * consumíveis mas nunca entram no motor de receita automática).
 */
export const itemClassificationDescriptions: Record<ItemClassification, string> = {
  quimico_volume: "Produto químico consumível, controlado por volume. Elegível para baixa automática por receita de serviço.",
  solido_peso: "Produto sólido consumível, controlado por peso. Elegível para baixa automática por receita de serviço.",
  consumivel_unidade: "Consumível controlado por unidade. Elegível para baixa automática por receita de serviço.",
  epi: "Equipamento de proteção individual — consumível e controlado fisicamente em estoque, mas não participa do motor de baixa automática por receita de serviço.",
  ferramenta: "Item reutilizável. Possui controle físico de quantidade, mas nunca sofre baixa automática por consumo.",
  equipamento: "Equipamento reutilizável. Possui controle físico de quantidade, mas nunca sofre baixa automática por consumo.",
  patrimonio: "Bem patrimonial — fora do controle de quantidade em estoque; compras deste tipo nunca geram movimentação de estoque.",
  manutencao: "Material usado na manutenção da estrutura/operação — consumível e controlado fisicamente em estoque, mas não participa do motor de baixa automática por receita de serviço.",
  material_divulgacao: "Material de divulgação/marketing — consumível e controlado fisicamente em estoque, mas não participa do motor de baixa automática por receita de serviço.",
  brinde_cliente: "Brinde entregue ao cliente — consumível e controlado fisicamente em estoque, mas não participa do motor de baixa automática por receita de serviço.",
  nao_controlado: "Item não controlado em estoque — sem rastreamento de quantidade nem elegibilidade de baixa.",
};

/**
 * Missão Financeiro V4.4 (correção) — duas perguntas independentes sobre uma classificação:
 * `tracksQuantity` (a compra deve gerar/atualizar `inventory_items.current_quantity`?) e
 * `consumable` (o item se esgota com o uso — elegível para `service_consumption_rules`/receita
 * automática — ou é reutilizável/indefinido, ex.: uma ferramenta que nunca "acaba")? Antes desta
 * missão, `STOCK_CONSUMABLE_CLASSIFICATIONS` respondia as duas perguntas de uma vez só, o que
 * impedia corretamente uma ferramenta reutilizável (ex.: luva eletrostática) ou um material de
 * manutenção consumível (ex.: limpa piso) de ganhar controle de quantidade via compra — mesmo
 * sendo fisicamente contável. Esta tabela nunca é usada para decidir consumo automático de receita
 * (isso continua sendo `STOCK_CONSUMABLE_CLASSIFICATIONS`, inalterado) — só para decidir se
 * `confirmPurchaseImportLine`/`criar_produto` pode gerar `inventory_movements`.
 */
export const CLASSIFICATION_STOCK_BEHAVIOR: Record<ItemClassification, { tracksQuantity: boolean; consumable: boolean }> = {
  quimico_volume: { tracksQuantity: true, consumable: true },
  solido_peso: { tracksQuantity: true, consumable: true },
  consumivel_unidade: { tracksQuantity: true, consumable: true },
  epi: { tracksQuantity: true, consumable: true },
  ferramenta: { tracksQuantity: true, consumable: false },
  equipamento: { tracksQuantity: true, consumable: false },
  /** Patrimônio continua fora do controle de quantidade via compra por decisão de escopo já existente (ver o fluxo dedicado "patrimonio" em `confirmPurchaseImportLine`, que nunca gera `inventory_movements`) — não alterado por esta missão. */
  patrimonio: { tracksQuantity: false, consumable: false },
  manutencao: { tracksQuantity: true, consumable: true },
  material_divulgacao: { tracksQuantity: true, consumable: true },
  brinde_cliente: { tracksQuantity: true, consumable: true },
  nao_controlado: { tracksQuantity: false, consumable: false },
};

/** Classificações elegíveis para `criar_produto` gerar `inventory_movements` (controle de quantidade via compra) — genérico, nunca hardcoded a um produto específico. Ver `CLASSIFICATION_STOCK_BEHAVIOR`. */
export const STOCK_TRACKED_CLASSIFICATIONS: ItemClassification[] = Object.entries(CLASSIFICATION_STOCK_BEHAVIOR)
  .filter(([, behavior]) => behavior.tracksQuantity)
  .map(([classification]) => classification as ItemClassification);

/**
 * Missão 23, seção 8 — decisão do usuário para cada linha da importação de compras, na Etapa 2
 * (confirmação). "ja_contabilizado_manualmente" (Missão de Fechamento da Reconciliação dos Snow
 * Foams) cobre o caso em que a compra já foi identificada e vinculada a um produto existente, mas
 * sua entrada de estoque já foi contabilizada por outro processo — nunca gera
 * `inventory_movement` (ver `resultingMovementId` em `inventoryAudit.ts`).
 */
export type PurchaseLineDecision = "vincular_existente" | "criar_produto" | "ignorar" | "patrimonio" | "despesa_manutencao" | "revisar_depois" | "ja_contabilizado_manualmente";

export const purchaseLineDecisions: PurchaseLineDecision[] = [
  "vincular_existente",
  "criar_produto",
  "ignorar",
  "patrimonio",
  "despesa_manutencao",
  "revisar_depois",
  "ja_contabilizado_manualmente",
];

export const purchaseLineDecisionLabels: Record<PurchaseLineDecision, string> = {
  vincular_existente: "Vincular a produto existente",
  criar_produto: "Criar novo produto",
  ignorar: "Ignorar esta linha",
  patrimonio: "Marcar como equipamento/patrimônio",
  despesa_manutencao: "Marcar como despesa ou manutenção",
  revisar_depois: "Revisar depois",
  ja_contabilizado_manualmente: "Já contabilizado manualmente (vincular sem gerar entrada)",
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
  /**
   * Missão Z2 (Zézinho generativo) — expõe o Catálogo Técnico Mestre (já real no banco desde a
   * missão de catálogo, nunca antes surfaced pelo repositório) para a tool de consulta de
   * estoque conseguir responder "para que serve"/"que tipo de uso" sem inventar. Opcional
   * (mesmo motivo de `active`): não quebra literais existentes em testes/seeds. `undefined` em
   * dados antigos/estáticos é honesto — significa "não catalogado", nunca inferido.
   */
  technicalFunction?: TechnicalFunction | null;
  usageType?: RecipeUsageType | null;
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
  /**
   * Missão Estoque E5.1 — momento real de inserção no sistema (ISO), distinto de `date` (a data
   * ECONÔMICA declarada, que pode ser retroativa). Sempre preenchido por ambas as implementações
   * do repositório na criação; opcional aqui só para não quebrar `Omit<StockMovement, "id" |
   * "previousBalance" | "newBalance">` em todo chamador existente de `recordMovement`/
   * `recordPhysicalCount` — nenhum precisa informar, o repositório sempre define. Usado como
   * desempate determinístico no replay cronológico (`inventorySnapshot.ts`) quando duas
   * movimentações do mesmo item têm a mesma `date`.
   */
  createdAt?: string;
}

// --- Fechamento/Snapshot de Estoque (Missão Estoque E4) ---

/**
 * "PHYSICAL_CONFIRMED" só quando a última movimentação do produto até a data de corte é ela
 * própria uma contagem física (`contagem_fisica_inicial`/`correcao_inventario`/`ajuste_inventario`)
 * datada exatamente na data de corte. Qualquer outro caso é "SYSTEM_THEORETICAL" — saldo projetado
 * a partir do último marco físico conhecido mais as movimentações registradas depois dele, nunca
 * uma nova contagem. Nunca inferida de um resumo — sempre calculada produto a produto.
 */
export type InventoryPositionOrigin = "PHYSICAL_CONFIRMED" | "SYSTEM_THEORETICAL";

/** Um produto dentro do payload congelado de um `InventorySnapshot` — granularidade sempre por item, nunca só um agregado. */
export interface InventorySnapshotProductEntry {
  itemId: string;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  /** Saldo na data de corte — reconstruído a partir do histórico real de movimentações até essa data, nunca lido cegamente de `currentQuantity` (que pode ter avançado desde o fechamento). */
  systemicQuantity: number;
  positionOrigin: InventoryPositionOrigin;
  lastPhysicalCountDate: string;
  /**
   * Missão Estoque E6.2 — true somente quando `lastPhysicalCountDate` vem de uma movimentação
   * REAL de contagem física (ajuste_inventario/contagem_fisica_inicial/correcao_inventario) no
   * histórico do item. false quando não existe nenhuma dessas movimentações e `lastPhysicalCountDate`
   * caiu no fallback `item.lastCountDate` (data de cadastro do produto, nunca uma contagem real).
   * Existe para que o resumo de nível de snapshot (`lastPhysicalCountAt` em `closeInventorySnapshot`)
   * NUNCA agregue data de cadastro de produto como se fosse contagem física.
   */
  hasRealPhysicalCount: boolean;
  lastPhysicalCountQuantity: number;
  /** Soma de movimentações que aumentam estoque (entrada/compra/ajuste_positivo/devolucao) entre a última contagem física e a data de corte. */
  entriesAfterLastCount: number;
  /** Soma de movimentações que reduzem estoque (saida/perda/consumo_interno/ajuste_negativo/avaria/vencimento/transferencia/consumo_teste_calibracao/descarte/outros) no mesmo intervalo — hoje sempre 0 neste sistema (nenhuma jamais existiu), mas o campo é real, não decorativo. */
  trackedConsumptionAfterLastCount: number;
  /**
   * Diferença (novo saldo − saldo anterior) registrada na PRÓPRIA movimentação de contagem física
   * mais recente — só preenchida quando `positionOrigin === "PHYSICAL_CONFIRMED"`. Nunca calculada
   * contra uma contagem que não existe (ver a regra "não inventar diferença física").
   */
  physicalVsTheoreticalDifference: number | null;
  /** Null = custo desconhecido — nunca tratado como 0. */
  unitCost: number | null;
  /** `systemicQuantity * unitCost`, só quando `unitCost` é conhecido — null caso contrário. */
  estimatedValue: number | null;
}

export interface InventorySnapshotPayload {
  competenceMonth: string;
  cutoffAt: string;
  methodology: InventoryPositionOrigin;
  caveat: string;
  products: InventorySnapshotProductEntry[];
  totalProducts: number;
  productsWithCost: number;
  productsWithoutCost: number;
  /** Soma de `estimatedValue` só sobre os produtos com custo conhecido — null quando nenhum produto tem custo. SEMPRE parcial quando `productsWithoutCost > 0` (ver `isPartialValue`). */
  partialInventoryValue: number | null;
  isPartialValue: boolean;
}

/** Espelha `src/db/schema/inventoryClosing.ts` (inventorySnapshots). */
export interface InventorySnapshot {
  id: string;
  competenceMonth: string;
  version: number;
  isOfficial: boolean;
  cutoffAt: string;
  lastPhysicalCountAt: string | null;
  methodology: InventoryPositionOrigin;
  caveat: string;
  payload: InventorySnapshotPayload;
  payloadHash: string;
  hashAlgorithm: string;
  totalProducts: number;
  productsWithCost: number;
  isPartialValue: boolean;
  supersededAt: string | null;
  supersededByVersionId: string | null;
  createdBy: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistInventorySnapshotInput {
  competenceMonth: string;
  version: number;
  cutoffAt: string;
  lastPhysicalCountAt: string | null;
  methodology: InventoryPositionOrigin;
  caveat: string;
  payload: InventorySnapshotPayload;
  payloadHash: string;
  hashAlgorithm: string;
  totalProducts: number;
  productsWithCost: number;
  isPartialValue: boolean;
  createdBy: string;
  notes?: string | null;
  /** id da versão oficial anterior desta competência, a desmarcar na mesma operação, se existir. */
  previousOfficialSnapshotId?: string | null;
}
