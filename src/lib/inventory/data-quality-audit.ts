import { resolveUnitConversion } from "@/lib/inventory/unit-conversion";
import type { InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";

/**
 * Auditoria de qualidade de dados (Missão 23, seção 5) — tudo calculado ao vivo, nada persistido,
 * nada corrigido automaticamente. Cada ocorrência sempre tem gravidade, explicação, referência de
 * origem e ação recomendada — nunca um "problema" sem contexto.
 */
export type IssueSeverity = "critico" | "atencao" | "informativo";

export interface DataQualityIssue {
  /** Estável: `${itemId}:${ruleId}` — usada como key em listas e como referência de correção. */
  id: string;
  itemId: string;
  ruleId: string;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  /** id de referência (movimentação, receita) quando a origem do problema é um registro específico. */
  sourceRef: string | null;
  recommendedAction: string;
}

const SIZE_TOKEN_PATTERN = /\b\d+([.,]\d+)?\s*(ml|mililitros?|l|lt|litros?|g|gramas?|kg|quilos?|un|und|unidades?|cx|caixas?)\b/i;

/** Decisão desta sprint — divergência acima disso entre custo médio e preço pago médio vira alerta, nunca corrigida sozinha. */
export const COST_DIVERGENCE_THRESHOLD = 0.3;

function issue(itemId: string, ruleId: string, severity: IssueSeverity, title: string, explanation: string, recommendedAction: string, sourceRef: string | null = null): DataQualityIssue {
  return { id: `${itemId}:${ruleId}`, itemId, ruleId, severity, title, explanation, sourceRef, recommendedAction };
}

export interface DataQualityAuditInput {
  items: InventoryItem[];
  /** Todas as movimentações de todos os itens auditados. */
  movements: StockMovement[];
  recipes: { id: string; itemId: string; isActiveVersion: boolean }[];
  /** Ids de item que já tiveram ao menos uma linha de consumo confirmado sem receita vinculada (`isExtra=true`). */
  extraConsumptionItemIds: Set<string>;
}

export interface DataQualitySummaryCounts {
  totalProducts: number;
  completeProducts: number;
  incompleteProducts: number;
  withoutCost: number;
  withoutSupplier: number;
  withoutLocation: number;
  withoutMinimumStock: number;
  withoutIdealStock: number;
  withoutMovement: number;
  negativeBalance: number;
  inconsistentUnit: number;
  withoutEntryHistory: number;
  consumedWithoutEntry: number;
}

export interface DataQualityAuditResult {
  issues: DataQualityIssue[];
  summary: DataQualitySummaryCounts;
}

/** "Completo" (seção 1) — tem todos os campos complementares cadastrados, nunca inferido. */
function isCompleteItem(item: InventoryItem): boolean {
  return item.supplier !== null && item.location !== null && item.minimumStock !== null && item.idealStock !== null && item.unitCost !== null && item.classification !== null;
}

export function auditDataQuality(input: DataQualityAuditInput): DataQualityAuditResult {
  const { items, movements, recipes, extraConsumptionItemIds } = input;
  const liveItems = items.filter((i) => i.canonicalItemId === null);
  const issues: DataQualityIssue[] = [];

  const movementsByItem = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const list = movementsByItem.get(m.itemId) ?? [];
    list.push(m);
    movementsByItem.set(m.itemId, list);
  }

  const activeRecipesByItem = new Map<string, number>();
  for (const r of recipes) {
    if (!r.isActiveVersion) continue;
    activeRecipesByItem.set(r.itemId, (activeRecipesByItem.get(r.itemId) ?? 0) + 1);
  }

  let withoutCost = 0;
  let withoutSupplier = 0;
  let withoutLocation = 0;
  let withoutMinimumStock = 0;
  let withoutIdealStock = 0;
  let withoutMovement = 0;
  let negativeBalance = 0;
  let inconsistentUnit = 0;
  let withoutEntryHistory = 0;
  let consumedWithoutEntry = 0;
  let completeProducts = 0;

  for (const item of liveItems) {
    const itemMovements = movementsByItem.get(item.id) ?? [];
    const entries = itemMovements.filter((m) => m.type === "entrada" || m.type === "compra");
    const consumptions = itemMovements.filter((m) => m.type === "consumo_interno" || m.type === "consumo_teste_calibracao");
    const totalConsumed = consumptions.reduce((sum, m) => sum + m.quantity, 0);

    if (isCompleteItem(item)) completeProducts += 1;

    if (item.unitCost === null) {
      withoutCost += 1;
      if (item.currentQuantity > 0) {
        issues.push(
          issue(item.id, "custo_zerado_saldo_positivo", "informativo", "Custo médio não cadastrado com saldo em estoque", `Saldo atual de ${item.currentQuantity} ${item.unit}, mas nenhum custo médio cadastrado ainda — nenhuma entrada com preço pago foi registrada.`, "Registrar uma entrada com valor pago para este produto."),
        );
      }
    }
    if (item.supplier === null) {
      withoutSupplier += 1;
      issues.push(issue(item.id, "sem_fornecedor", "informativo", "Sem fornecedor cadastrado", "Nenhum fornecedor conhecido para este produto ainda.", "Cadastrar o fornecedor no detalhe do produto ou registrar uma entrada com fornecedor."));
    }
    if (item.location === null) {
      withoutLocation += 1;
      issues.push(issue(item.id, "sem_localizacao", "informativo", "Sem localização cadastrada", "Nenhuma localização física definida para este produto.", "Cadastrar a localização no detalhe do produto."));
    }
    if (item.minimumStock === null) {
      withoutMinimumStock += 1;
      issues.push(issue(item.id, "sem_estoque_minimo", "informativo", "Sem estoque mínimo configurado", "Sem estoque mínimo, o sistema não consegue avisar quando este produto estiver acabando.", "Definir um estoque mínimo no detalhe do produto."));
    }
    if (item.idealStock === null) {
      withoutIdealStock += 1;
      issues.push(issue(item.id, "sem_estoque_ideal", "informativo", "Sem estoque ideal configurado", "Sem estoque ideal, não é possível calcular quanto comprar para voltar ao nível confortável.", "Definir um estoque ideal no detalhe do produto."));
    }
    if (itemMovements.length === 0) {
      withoutMovement += 1;
      issues.push(issue(item.id, "sem_movimentacao", "informativo", "Nenhuma movimentação registrada", "Este produto nunca teve nenhuma movimentação registrada (nem a contagem inicial).", "Verificar se o cadastro está correto ou registrar a movimentação real."));
    }
    if (item.currentQuantity < 0) {
      negativeBalance += 1;
      issues.push(issue(item.id, "saldo_negativo", "critico", "Saldo negativo", `Saldo atual: ${item.currentQuantity} ${item.unit}. Alguma baixa foi maior que o saldo disponível.`, "Revisar o histórico de movimentações e registrar um ajuste de inventário com a contagem física real."));
    }
    if (entries.length === 0) {
      withoutEntryHistory += 1;
    }
    if (totalConsumed > 0 && entries.length === 0) {
      consumedWithoutEntry += 1;
      issues.push(
        issue(item.id, "consumido_sem_entrada", "informativo", "Consumido sem nenhuma entrada registrada", "Já houve consumo deste produto, mas nunca uma compra/entrada registrada — o saldo depende inteiramente da contagem inicial.", "Registrar as compras reais deste produto (ver importação de compras históricas)."),
      );
    }

    if (SIZE_TOKEN_PATTERN.test(item.name)) {
      issues.push(
        issue(item.id, "embalagem_no_nome", "informativo", "Nome do produto contém o tamanho da embalagem", `"${item.name}" parece incluir um tamanho de embalagem — o produto mestre deveria ter só o nome, sem o tamanho.`, "Considerar renomear e tratar os tamanhos como embalagens de compra (ver assistente de consolidação)."),
      );
    }
    const nameUnitIssue = detectNameUnitMismatch(item.name, item.unit);
    if (nameUnitIssue) {
      inconsistentUnit += 1;
      issues.push(issue(item.id, "unidade_inconsistente_com_nome", "atencao", "Unidade pode estar inconsistente com o nome", nameUnitIssue, "Conferir se a unidade-base cadastrada está correta para este produto."));
    }

    if (item.minimumStock !== null && item.idealStock !== null && item.minimumStock > item.idealStock) {
      issues.push(
        issue(item.id, "minimo_maior_que_ideal", "atencao", "Estoque mínimo maior que o estoque ideal", `Mínimo (${item.minimumStock} ${item.unit}) maior que o ideal (${item.idealStock} ${item.unit}) — deveria ser o contrário.`, "Revisar os dois valores no detalhe do produto."),
      );
    }

    const costIssue = detectCostDivergence(item, entries);
    if (costIssue) issues.push(costIssue);

    for (const m of itemMovements) {
      if (m.responsible === null || m.responsible.trim() === "") {
        issues.push(issue(item.id, `movimentacao_sem_origem:${m.id}`, "atencao", "Movimentação sem responsável registrado", `Movimentação de ${m.date} (${m.type}) não tem responsável identificado.`, "Sem correção automática — nunca inventar quem registrou.", m.id));
      }
    }

    if (extraConsumptionItemIds.has(item.id)) {
      issues.push(
        issue(item.id, "consumo_extra_sem_receita", "informativo", "Já houve consumo automático sem receita vinculada", "Pelo menos uma confirmação de consumo via JumpPark incluiu este item como extra, sem receita.", "Considerar criar uma receita para este produto/etapa, se o consumo for recorrente."),
      );
    }
  }

  // Receita vinculada a produto inativo/consolidado — precisa olhar TODOS os itens, não só os "vivos".
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const r of recipes) {
    if (!r.isActiveVersion) continue;
    const target = itemById.get(r.itemId);
    if (target && target.canonicalItemId !== null) {
      issues.push(
        issue(r.itemId, `receita_produto_inativo:${r.id}`, "critico", "Receita vinculada a um produto que foi consolidado", `A receita ${r.id} ainda aponta para um cadastro incorporado a outro produto (mestre: ${target.canonicalItemId}).`, "Redirecionar a receita para o produto mestre — a consolidação deveria ter feito isso automaticamente.", r.id),
      );
    }
  }

  const summary: DataQualitySummaryCounts = {
    totalProducts: liveItems.length,
    completeProducts,
    incompleteProducts: liveItems.length - completeProducts,
    withoutCost,
    withoutSupplier,
    withoutLocation,
    withoutMinimumStock,
    withoutIdealStock,
    withoutMovement,
    negativeBalance,
    inconsistentUnit,
    withoutEntryHistory,
    consumedWithoutEntry,
  };

  return { issues, summary };
}

function detectNameUnitMismatch(name: string, itemUnit: InventoryUnit): string | null {
  const match = name.match(SIZE_TOKEN_PATTERN);
  if (!match) return null;
  const rawUnit = match[2];
  const conversion = resolveUnitConversion(rawUnit);
  if (!conversion) return null;
  if (conversion.baseUnit === itemUnit) return null;
  return `O nome "${name}" sugere unidade "${conversion.baseUnit}", mas o item está cadastrado como "${itemUnit}".`;
}

function detectCostDivergence(item: InventoryItem, entries: StockMovement[]): DataQualityIssue | null {
  if (item.unitCost === null) return null;
  const pricedEntries = entries.filter((m) => m.unitPricePaid !== null && m.unitPricePaid !== undefined);
  if (pricedEntries.length === 0) return null;

  const avgPricePaid = pricedEntries.reduce((sum, m) => sum + (m.unitPricePaid ?? 0), 0) / pricedEntries.length;
  if (avgPricePaid <= 0) return null;

  const deviation = Math.abs(item.unitCost - avgPricePaid) / avgPricePaid;
  if (deviation <= COST_DIVERGENCE_THRESHOLD) return null;

  return issue(
    item.id,
    "custo_medio_incompativel",
    "atencao",
    "Custo médio muito diferente do histórico de compras",
    `Custo médio cadastrado: ${item.unitCost.toFixed(2)}. Média dos preços pagos no histórico: ${avgPricePaid.toFixed(2)} (${Math.round(deviation * 100)}% de diferença).`,
    "Conferir se o custo médio está correto ou se há uma entrada com preço errado no histórico.",
  );
}
