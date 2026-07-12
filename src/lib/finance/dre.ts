import type {
  AccountsPayable,
  AccountsReceivable,
  AccountTransferType,
  CashMovement,
  CashMovementNature,
  ClassificationOrigin,
  ClassificationRule,
  ClassificationSourceKind,
  DreCostCenterGroup,
  DreGroupTotal,
  DreLine,
  DreLineItem,
  DreReport,
  FinancialClassification,
  FinancialNature,
} from "@/lib/finance/types";

/**
 * DRE gerencial para apoio à administração. Não substitui escrituração contábil, demonstrações
 * oficiais ou obrigações preparadas pela contabilidade.
 *
 * Classificação por nome de categoria (não por id) porque o id difere entre o repositório em
 * memória (slugs) e o Postgres (uuid) — o nome é estável nos dois. Baseado no plano de contas
 * real já existente (src/db/seed/chart-of-accounts.ts) — nenhuma categoria nova foi inventada.
 */
const CATEGORY_DRE_DEFAULTS: Record<string, { dreLine: DreLine; nature: FinancialNature; reviewNeeded?: boolean }> = {
  Estacionamento: { dreLine: "receita_bruta", nature: "receita_operacional" },
  Lavação: { dreLine: "receita_bruta", nature: "receita_operacional" },
  "Serviços adicionais": { dreLine: "receita_bruta", nature: "receita_operacional" },
  Polimento: { dreLine: "receita_bruta", nature: "receita_operacional" },
  Vitrificação: { dreLine: "receita_bruta", nature: "receita_operacional" },
  Higienização: { dreLine: "receita_bruta", nature: "receita_operacional" },
  Faróis: { dreLine: "receita_bruta", nature: "receita_operacional" },
  "Contratos mensais": { dreLine: "receita_bruta", nature: "receita_operacional" },
  "Parcerias pós-pagas": { dreLine: "receita_bruta", nature: "receita_operacional" },
  "Outros serviços": { dreLine: "receita_bruta", nature: "receita_operacional" },

  "Produtos e insumos": { dreLine: "custos_diretos", nature: "custo_direto" },
  "Prestadores PJ": { dreLine: "custos_diretos", nature: "custo_direto" },
  Equipamentos: { dreLine: "despesas_operacionais", nature: "despesa_operacional", reviewNeeded: true },
  Aluguel: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Energia: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Água: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Internet: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Marketing: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  "Salários CLT": { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Contabilidade: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  "Sistemas e assinaturas": { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  "Transporte e logística": { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  "Outras despesas": { dreLine: "despesas_operacionais", nature: "despesa_operacional", reviewNeeded: true },
  Telefonia: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Manutenção: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  Tributos: { dreLine: "tributos", nature: "despesa_operacional" },
  /** Empréstimo: sem detalhamento de principal x juros, fica pendente de revisão — nunca inventamos a composição. */
  "Empréstimos e financiamentos": { dreLine: "resultado_financeiro", nature: "resultado_financeiro", reviewNeeded: true },
  "Reembolso a sócios/colaboradores": { dreLine: "fora_dre", nature: "reembolso" },
  "Retirada de lucro/distribuição a sócios": { dreLine: "fora_dre", nature: "retirada" },
};

const CASH_MOVEMENT_NATURE_DEFAULTS: Record<CashMovementNature, { dreLine: DreLine; nature: FinancialNature; reviewNeeded?: boolean }> = {
  receita: { dreLine: "receita_bruta", nature: "receita_operacional" },
  despesa: { dreLine: "despesas_operacionais", nature: "despesa_operacional" },
  ajuste: { dreLine: "fora_dre", nature: "nao_classificavel", reviewNeeded: true },
  estorno: { dreLine: "deducoes_receita", nature: "deducao_receita" },
  taxa_bancaria: { dreLine: "resultado_financeiro", nature: "resultado_financeiro" },
  tarifa: { dreLine: "resultado_financeiro", nature: "resultado_financeiro" },
  juros: { dreLine: "resultado_financeiro", nature: "resultado_financeiro" },
};

const TRANSFER_NATURE_MAP: Record<AccountTransferType, FinancialNature> = {
  transferencia: "transferencia",
  reposicao_caixa: "transferencia",
  aporte_socios: "aporte",
  retirada: "retirada",
};

export interface ResolvedClassification {
  dreLine: DreLine;
  nature: FinancialNature;
  includeInDre: boolean;
  origin: ClassificationOrigin;
  reviewNeeded: boolean;
}

interface ClassifiableFields {
  categoryName?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  description: string;
}

/**
 * Resolve a classificação vigente de um lançamento, na ordem: classificação manual explícita >
 * regra por fornecedor > regra por parceiro > regra por categoria > regra por palavra-chave >
 * padrão herdado da categoria (tabela acima) > não classificável (fica pendente de revisão).
 * Nunca grava nada — é chamada toda vez que a DRE/fila de classificação é montada.
 */
export function resolveClassification(entity: ClassifiableFields, explicit: FinancialClassification | undefined, rules: ClassificationRule[]): ResolvedClassification {
  if (explicit) {
    return { dreLine: explicit.dreLine, nature: explicit.nature, includeInDre: explicit.includeInDre, origin: explicit.origin, reviewNeeded: explicit.reviewNeeded };
  }

  const enabled = rules.filter((r) => r.enabled);
  const description = entity.description.toLowerCase();

  const supplierRule = entity.supplierId ? enabled.find((r) => r.matchType === "fornecedor" && r.supplierId === entity.supplierId) : undefined;
  if (supplierRule) return fromRule(supplierRule, "herdada_fornecedor");

  const partnerRule = entity.partnerId ? enabled.find((r) => r.matchType === "parceiro" && r.partnerId === entity.partnerId) : undefined;
  if (partnerRule) return fromRule(partnerRule, "herdada_cliente");

  const categoryRule = entity.categoryName ? enabled.find((r) => r.matchType === "categoria" && r.categoryName === entity.categoryName) : undefined;
  if (categoryRule) return fromRule(categoryRule, "herdada_categoria");

  const keywordRule = enabled.find((r) => r.matchType === "palavra_chave" && r.keyword && description.includes(r.keyword.toLowerCase()));
  if (keywordRule) return fromRule(keywordRule, "regra_automatica");

  const categoryDefault = entity.categoryName ? CATEGORY_DRE_DEFAULTS[entity.categoryName] : undefined;
  if (categoryDefault) {
    return {
      dreLine: categoryDefault.dreLine,
      nature: categoryDefault.nature,
      includeInDre: categoryDefault.dreLine !== "fora_dre",
      origin: "herdada_categoria",
      reviewNeeded: categoryDefault.reviewNeeded ?? false,
    };
  }

  return { dreLine: "fora_dre", nature: "nao_classificavel", includeInDre: false, origin: "pendente", reviewNeeded: true };
}

function fromRule(rule: ClassificationRule & { categoryName?: string | null }, origin: ClassificationOrigin): ResolvedClassification {
  return { dreLine: rule.dreLine, nature: rule.nature, includeInDre: rule.includeInDre, origin, reviewNeeded: rule.reviewNeeded };
}

/** Resolve a classificação de um movimento de caixa manual (taxa/tarifa/juros/ajuste/estorno/receita/despesa). */
export function resolveCashMovementNatureClassification(nature: CashMovementNature): ResolvedClassification {
  const found = CASH_MOVEMENT_NATURE_DEFAULTS[nature];
  return { dreLine: found.dreLine, nature: found.nature, includeInDre: found.dreLine !== "fora_dre", origin: "herdada_categoria", reviewNeeded: found.reviewNeeded ?? false };
}

/** Transferências nunca entram na DRE — classificação é sempre determinística pelo tipo, nunca manual/pendente. */
export function resolveTransferClassification(type: AccountTransferType): ResolvedClassification {
  return { dreLine: "fora_dre", nature: TRANSFER_NATURE_MAP[type], includeInDre: false, origin: "regra_automatica", reviewNeeded: false };
}

/**
 * Agrupa um centro de custo na visão gerencial de 3 blocos pedida pelo proprietário. "Lavação"
 * (cc-lavacao) conta como Estética Automotiva — é um subconjunto dela no plano de contas atual.
 * Qualquer outro centro de custo (Administrativo, Estrutura, Marketing, Tecnologia, ou nenhum)
 * cai em Administrativo/Geral.
 */
export function resolveDreCostCenterGroup(costCenterName: string | null): DreCostCenterGroup {
  if (costCenterName === "Estética Automotiva" || costCenterName === "Lavação") return "estetica_automotiva";
  if (costCenterName === "Estacionamento") return "estacionamento";
  return "administrativo_geral";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyGroup(label: string): DreGroupTotal {
  return { label, amount: 0, items: [] };
}

function addItem(group: DreGroupTotal, item: DreLineItem): void {
  group.amount = round2(group.amount + item.amount);
  group.items.push(item);
}

interface DreCandidate {
  sourceKind: ClassificationSourceKind;
  sourceId: string;
  date: string;
  description: string;
  partyName: string | null;
  categoryName: string | null;
  costCenterName: string | null;
  supplierId: string | null;
  partnerId: string | null;
  /** Valor absoluto do lançamento — o sinal (soma/subtrai) é decidido pela linha da DRE, nunca aqui. */
  absAmount: number;
  /** null quando o lançamento não vem de um cash_movement com natureza informada. */
  cashMovementNature: CashMovementNature | null;
}

export interface DreComputationInput {
  regime: "competencia" | "caixa";
  competenceFrom: string;
  competenceTo: string;
  costCenterGroup: DreCostCenterGroup | "consolidado";
  accountsPayable: AccountsPayable[];
  accountsReceivable: AccountsReceivable[];
  cashMovements: CashMovement[];
  classifications: FinancialClassification[];
  rules: ClassificationRule[];
}

/**
 * Motor da DRE gerencial — nunca grava nada, sempre recalcula a partir dos lançamentos reais
 * (accounts_payable/accounts_receivable para competência, cash_movements para caixa). Nunca
 * mistura os dois regimes no mesmo relatório.
 */
export function computeDreReport(input: DreComputationInput): DreReport {
  const candidates: DreCandidate[] =
    input.regime === "competencia" ? buildCompetenceCandidates(input) : buildCashCandidates(input);

  const filtered = candidates.filter((c) => {
    if (c.date < input.competenceFrom || c.date > input.competenceTo) return false;
    if (input.costCenterGroup === "consolidado") return true;
    return resolveDreCostCenterGroup(c.costCenterName) === input.costCenterGroup;
  });

  const receitaBrutaEstetica = emptyGroup("Receita da Estética Automotiva");
  const receitaBrutaEstacionamento = emptyGroup("Receita do Estacionamento");
  const receitaBrutaOutras = emptyGroup("Outras receitas operacionais");
  const deducoes = emptyGroup("Deduções da receita");
  const custosDiretos = emptyGroup("Custos diretos dos serviços");
  const despesasOperacionais = emptyGroup("Despesas operacionais");
  const resultadoFinanceiro = emptyGroup("Resultado financeiro");
  const tributos = emptyGroup("Tributos");
  const naoClassificados: DreLineItem[] = [];

  const explicitByKey = new Map<string, FinancialClassification>();
  for (const c of input.classifications) {
    if (c.accountsPayableId) explicitByKey.set(`accounts_payable:${c.accountsPayableId}`, c);
    if (c.accountsReceivableId) explicitByKey.set(`accounts_receivable:${c.accountsReceivableId}`, c);
    if (c.cashMovementId) explicitByKey.set(`cash_movement:${c.cashMovementId}`, c);
    if (c.accountTransferId) explicitByKey.set(`account_transfer:${c.accountTransferId}`, c);
  }

  for (const candidate of filtered) {
    const explicit = explicitByKey.get(`${candidate.sourceKind}:${candidate.sourceId}`);
    const resolved = candidate.cashMovementNature && !explicit
      ? resolveCashMovementNatureClassification(candidate.cashMovementNature)
      : resolveClassification(candidate, explicit, input.rules);

    const item: DreLineItem = {
      sourceKind: candidate.sourceKind,
      sourceId: candidate.sourceId,
      date: candidate.date,
      description: candidate.description,
      partyName: candidate.partyName,
      categoryName: candidate.categoryName,
      costCenterName: candidate.costCenterName,
      amount: candidate.absAmount,
      origin: resolved.origin,
    };

    if (resolved.origin === "pendente") {
      naoClassificados.push(item);
      continue;
    }
    if (!resolved.includeInDre) continue;

    switch (resolved.dreLine) {
      case "receita_bruta": {
        const group = resolveDreCostCenterGroup(candidate.costCenterName);
        addItem(group === "estetica_automotiva" ? receitaBrutaEstetica : group === "estacionamento" ? receitaBrutaEstacionamento : receitaBrutaOutras, item);
        break;
      }
      case "deducoes_receita":
        addItem(deducoes, item);
        break;
      case "custos_diretos":
        addItem(custosDiretos, item);
        break;
      case "despesas_operacionais":
        addItem(despesasOperacionais, item);
        break;
      case "resultado_financeiro":
        addItem(resultadoFinanceiro, { ...item, amount: candidate.sourceKind === "accounts_receivable" || candidate.cashMovementNature === "juros" ? item.amount : -item.amount });
        break;
      case "tributos":
        addItem(tributos, item);
        break;
      case "fora_dre":
        break;
    }
  }

  const receitaBruta = round2(receitaBrutaEstetica.amount + receitaBrutaEstacionamento.amount + receitaBrutaOutras.amount);
  const receitaLiquida = round2(receitaBruta - deducoes.amount);
  const margemContribuicao = round2(receitaLiquida - custosDiretos.amount);
  const resultadoOperacional = round2(margemContribuicao - despesasOperacionais.amount);
  const resultadoAntesTributos = round2(resultadoOperacional + resultadoFinanceiro.amount);
  const resultadoLiquido = round2(resultadoAntesTributos - tributos.amount);

  return {
    regime: input.regime,
    competenceFrom: input.competenceFrom,
    competenceTo: input.competenceTo,
    costCenterGroup: input.costCenterGroup,
    receitaBrutaEstetica,
    receitaBrutaEstacionamento,
    receitaBrutaOutras,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custosDiretos,
    margemContribuicao,
    despesasOperacionais,
    resultadoOperacional,
    resultadoFinanceiro,
    resultadoAntesTributos,
    tributos,
    resultadoLiquido,
    naoClassificados,
    margemContribuicaoPercentual: receitaBruta > 0 ? round2((margemContribuicao / receitaBruta) * 100) : null,
    margemOperacionalPercentual: receitaBruta > 0 ? round2((resultadoOperacional / receitaBruta) * 100) : null,
    margemLiquidaPercentual: receitaBruta > 0 ? round2((resultadoLiquido / receitaBruta) * 100) : null,
    participacaoEsteticaReceita: receitaBruta > 0 ? round2((receitaBrutaEstetica.amount / receitaBruta) * 100) : null,
    participacaoEstacionamentoReceita: receitaBruta > 0 ? round2((receitaBrutaEstacionamento.amount / receitaBruta) * 100) : null,
    ebitda: null,
    ebitdaIndisponivelMotivo: "Depreciação e amortização não são registradas no sistema — classificação insuficiente para calcular EBITDA.",
  };
}

function buildCompetenceCandidates(input: DreComputationInput): DreCandidate[] {
  const candidates: DreCandidate[] = [];

  for (const ar of input.accountsReceivable) {
    if (ar.status === "cancelled") continue;
    candidates.push({
      sourceKind: "accounts_receivable",
      sourceId: ar.id,
      date: ar.competenceDate,
      description: ar.description,
      partyName: ar.partyName,
      categoryName: ar.categoryName,
      costCenterName: ar.costCenterName,
      supplierId: null,
      partnerId: ar.partnerId,
      absAmount: ar.expectedAmount,
      cashMovementNature: null,
    });
    /** Estorno reverte o efeito gerencial na competência: mesma receita, com dedução equivalente. */
    if (ar.status === "reversed") {
      candidates.push({
        sourceKind: "accounts_receivable",
        sourceId: `${ar.id}:estorno`,
        date: ar.competenceDate,
        description: `Estorno de: ${ar.description}`,
        partyName: ar.partyName,
        categoryName: "Estorno",
        costCenterName: ar.costCenterName,
        supplierId: null,
        partnerId: ar.partnerId,
        absAmount: ar.expectedAmount,
        cashMovementNature: "estorno",
      });
    }
  }

  for (const ap of input.accountsPayable) {
    if (ap.status === "cancelada") continue;
    candidates.push({
      sourceKind: "accounts_payable",
      sourceId: ap.id,
      date: ap.competenceDate,
      description: ap.description,
      partyName: ap.supplierName,
      categoryName: ap.categoryName,
      costCenterName: ap.costCenterName,
      supplierId: ap.supplierId,
      partnerId: null,
      absAmount: ap.originalAmount,
      cashMovementNature: null,
    });
  }

  return candidates;
}

function buildCashCandidates(input: DreComputationInput): DreCandidate[] {
  return input.cashMovements.map((m) => ({
    sourceKind: "cash_movement" as const,
    sourceId: m.id,
    date: m.date,
    description: m.description,
    partyName: m.partyName,
    categoryName: m.categoryName,
    costCenterName: m.costCenterName,
    supplierId: m.supplierId,
    partnerId: m.partnerId,
    absAmount: m.amount,
    cashMovementNature: m.nature,
  }));
}
