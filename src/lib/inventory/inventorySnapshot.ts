import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { computeInventorySnapshotHash, INVENTORY_SNAPSHOT_HASH_ALGORITHM, verifyInventorySnapshotIntegrity } from "@/lib/inventory/inventorySnapshotHash";
import { applyMovementDelta } from "@/lib/inventory/movement-math";
import type { InventoryItem, InventoryPositionOrigin, InventorySnapshot, InventorySnapshotPayload, InventorySnapshotProductEntry, MovementType, StockMovement } from "@/lib/inventory/types";

/** Movimentações cujo `quantity` é somado ao saldo — mesmo conjunto de `applyMovementDelta` (movement-math.ts), nunca redefinido aqui. */
const POSITIVE_DELTA_TYPES = new Set<MovementType>(["entrada", "compra", "ajuste_positivo", "devolucao"]);
/** Movimentações cujo `quantity` é subtraído do saldo — mesmo conjunto de `applyMovementDelta`. */
const NEGATIVE_DELTA_TYPES = new Set<MovementType>(["saida", "perda", "consumo_interno", "ajuste_negativo", "avaria", "vencimento", "transferencia", "consumo_teste_calibracao", "descarte", "outros"]);
/** Movimentações cujo `quantity` é uma contagem física absoluta — a fonte de verdade de "última contagem física" para cada produto, nunca `item.lastCountDate` sozinho (recalculado aqui a partir do histórico real). */
const PHYSICAL_COUNT_TYPES = new Set<MovementType>(["ajuste_inventario", "contagem_fisica_inicial", "correcao_inventario"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Missão Estoque E5.1 — ordenação determinística para replay: (1) `date` (a competência
 * econômica declarada), depois (2) `createdAt` (o instante real de inserção no sistema — desempate
 * quando duas movimentações do mesmo item compartilham a mesma `date`), depois (3) `id` (último
 * desempate, sempre determinístico mesmo se `createdAt` empatar). NUNCA a ordem de chegada do
 * array — sempre recalculada aqui.
 */
function sortMovementsChronologically(movements: StockMovement[]): StockMovement[] {
  return [...movements].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const createdA = a.createdAt ?? "";
    const createdB = b.createdAt ?? "";
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Missão Estoque E5.1 — reconstrói a posição de UM produto na data de corte por REPLAY
 * cronológico real: começa de 0 e aplica `applyMovementDelta` (a mesma semântica canônica usada
 * pelos dois repositórios — soma/subtrai/substitui conforme o tipo) movimentação a movimentação,
 * na ordem determinística de `sortMovementsChronologically`.
 *
 * Correção da Fase E5 (achado real: "APC Limpador Multifuncional" mostrava 10.000ml em vez dos
 * 13.750ml operacionalmente corretos): a versão anterior confiava no `newBalance` já GRAVADO na
 * última movimentação encontrada — correto quando tudo é inserido em ordem cronológica, mas errado
 * quando uma movimentação é lançada retroativamente (`date` anterior) depois de outras já
 * existentes, porque o `newBalance` gravado nela reflete o saldo AO VIVO no momento da inserção,
 * não o saldo correto na sequência por data. `previousBalance`/`newBalance` continuam existindo
 * para auditoria/rastreabilidade de cada linha isoladamente, mas NUNCA mais são a fonte do saldo
 * calculado aqui — só `applyMovementDelta` + `quantity`, replay puro.
 */
function buildProductEntry(item: InventoryItem, allMovements: StockMovement[], cutoffAt: string): InventorySnapshotProductEntry {
  const upToCutoff = sortMovementsChronologically(allMovements.filter((m) => m.date <= cutoffAt));

  let runningBalance = 0;
  let lastCount: StockMovement | null = null;
  let lastCountBalanceBefore = 0;
  for (const movement of upToCutoff) {
    const balanceBefore = runningBalance;
    runningBalance = applyMovementDelta(runningBalance, movement.type, movement.quantity);
    if (PHYSICAL_COUNT_TYPES.has(movement.type)) {
      lastCount = movement;
      lastCountBalanceBefore = balanceBefore;
    }
  }
  const systemicQuantity = runningBalance;

  const latest = upToCutoff.length > 0 ? upToCutoff[upToCutoff.length - 1] : null;

  /**
   * Missão Estoque E6.2 — correção de causa raiz: `item.lastCountDate` NUNCA é uma contagem física
   * real por si só — é setado para a data de CADASTRO do produto quando ele é criado sem histórico
   * de movimentação (ex.: `confirmPurchaseImportLine` no caminho "criar_produto"). Continuamos
   * expondo esse fallback aqui SOMENTE como a melhor data conhecida para ESTE item isoladamente
   * (nunca deixamos o campo vazio), mas `hasRealPhysicalCount` marca explicitamente quando essa data
   * NÃO veio de uma movimentação de contagem real — é esse flag, não a data em si, que
   * `closeInventorySnapshot` usa para computar o resumo de nível de snapshot, evitando que uma data
   * de cadastro de produto polua a "última contagem física" global do fechamento.
   */
  const hasRealPhysicalCount = lastCount !== null;
  const lastPhysicalCountDate = lastCount?.date ?? item.lastCountDate;
  const lastPhysicalCountQuantity = lastCount ? lastCount.quantity : item.currentQuantity;

  const positionOrigin: InventoryPositionOrigin = latest !== null && lastCount !== null && latest.id === lastCount.id && latest.date === cutoffAt ? "PHYSICAL_CONFIRMED" : "SYSTEM_THEORETICAL";

  const afterLastCount = upToCutoff.filter((m) => m.date > lastPhysicalCountDate);
  const entriesAfterLastCount = round2(afterLastCount.filter((m) => POSITIVE_DELTA_TYPES.has(m.type)).reduce((sum, m) => sum + m.quantity, 0));
  const trackedConsumptionAfterLastCount = round2(afterLastCount.filter((m) => NEGATIVE_DELTA_TYPES.has(m.type)).reduce((sum, m) => sum + m.quantity, 0));

  // Nunca inventar diferença física x teórica: só existe quando HÁ uma contagem física real na própria data de corte — o delta vem do PRÓPRIO replay (saldo antes → saldo depois daquela contagem), nunca do previousBalance/newBalance gravado na linha.
  const physicalVsTheoreticalDifference = positionOrigin === "PHYSICAL_CONFIRMED" && lastCount !== null ? round2(systemicQuantity - lastCountBalanceBefore) : null;

  const unitCost = item.unitCost;
  const estimatedValue = unitCost !== null ? round2(systemicQuantity * unitCost) : null;

  return {
    itemId: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    systemicQuantity: round2(systemicQuantity),
    positionOrigin,
    lastPhysicalCountDate,
    hasRealPhysicalCount,
    lastPhysicalCountQuantity: round2(lastPhysicalCountQuantity),
    entriesAfterLastCount,
    trackedConsumptionAfterLastCount,
    physicalVsTheoreticalDifference,
    unitCost,
    estimatedValue,
  };
}

export interface ComputeInventorySnapshotPayloadInput {
  competenceMonth: string;
  cutoffAt: string;
  /** Ressalva textual explícita — obrigatória, nunca gerada silenciosamente sem revisão de quem fecha. */
  caveat: string;
}

/**
 * Parte pura (sem escrita) — computa o payload completo a partir do estado real do repositório.
 * Nunca cria/altera nenhuma movimentação, nunca toca `inventory_items`. Reaproveitável tanto pelo
 * fechamento real (`closeInventorySnapshot`) quanto por uma simulação/dry-run.
 */
export async function computeInventorySnapshotPayload(input: ComputeInventorySnapshotPayloadInput): Promise<InventorySnapshotPayload> {
  const repo = getInventoryRepository();
  const [items, allMovements] = await Promise.all([repo.listItems(), repo.listMovements()]);

  const movementsByItem = new Map<string, StockMovement[]>();
  for (const movement of allMovements) {
    const list = movementsByItem.get(movement.itemId) ?? [];
    list.push(movement);
    movementsByItem.set(movement.itemId, list);
  }

  const products = items.map((item) => buildProductEntry(item, movementsByItem.get(item.id) ?? [], input.cutoffAt));

  const totalProducts = products.length;
  const productsWithCost = products.filter((p) => p.unitCost !== null).length;
  const productsWithoutCost = totalProducts - productsWithCost;
  const withCost = products.filter((p) => p.estimatedValue !== null);
  const partialInventoryValue = withCost.length > 0 ? round2(withCost.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0)) : null;
  const methodology: InventoryPositionOrigin = totalProducts > 0 && products.every((p) => p.positionOrigin === "PHYSICAL_CONFIRMED") ? "PHYSICAL_CONFIRMED" : "SYSTEM_THEORETICAL";

  return {
    competenceMonth: input.competenceMonth,
    cutoffAt: input.cutoffAt,
    methodology,
    caveat: input.caveat,
    products,
    totalProducts,
    productsWithCost,
    productsWithoutCost,
    partialInventoryValue,
    isPartialValue: productsWithoutCost > 0,
  };
}

/** Gera o texto padrão da ressalva a partir dos dados reais do payload — nunca esconde a metodologia em comentário de código, sempre visível a quem consulta o snapshot. Pode ser sobrescrito por quem fecha, se o texto padrão não descrever bem o caso real. */
export function buildDefaultCaveat(cutoffAt: string, lastPhysicalCountAt: string | null): string {
  if (lastPhysicalCountAt === null) {
    return `Nenhuma movimentação/contagem física encontrada para os produtos considerados neste fechamento (${cutoffAt}).`;
  }
  if (lastPhysicalCountAt === cutoffAt) {
    return `Posição confirmada por contagem física realizada em ${lastPhysicalCountAt}, coincidente com a data de corte deste fechamento.`;
  }
  return (
    `Última contagem física realizada em ${lastPhysicalCountAt}. O saldo de ${cutoffAt} representa posição sistêmica baseada nessa contagem e nas movimentações ` +
    `posteriormente registradas. O consumo operacional entre ${lastPhysicalCountAt} e ${cutoffAt} não possui rastreamento completo e, portanto, o saldo não representa nova contagem física.`
  );
}

export interface CloseInventorySnapshotInput {
  competenceMonth: string;
  cutoffAt: string;
  createdBy: string;
  /** Sobrescreve o texto padrão gerado por `buildDefaultCaveat`, quando informado. */
  caveat?: string;
  notes?: string | null;
  /**
   * Missão Estoque E6.2 — correção controlada e auditável de UM fechamento oficial já existente,
   * NUNCA uma reabertura genérica de estoque. Só tem efeito quando a competência já possui um
   * snapshot oficial: nesse caso, em vez de lançar o erro padrão de "já fechado", exige que o
   * chamador informe o `officialSnapshotId` EXATO da versão vigente (prova de que já releu o
   * estado atual, não um chute) e um `reason` não vazio (fica gravado em `notes` da nova versão,
   * preservando rastreabilidade de por que a versão anterior foi substituída). A versão anterior
   * nunca é apagada — `persistInventorySnapshot` só marca `isOfficial=false`/`supersededAt` nela.
   * Sem este parâmetro, o comportamento de bloqueio original (uma função de reabertura genérica
   * seria necessária) continua exatamente o mesmo.
   */
  correctionOf?: { officialSnapshotId: string; reason: string };
}

export interface CloseInventorySnapshotResult {
  snapshot: InventorySnapshot;
}

/**
 * Fechamento auditável e reproduzível de estoque (Missão Estoque E4) — mesmo espírito de
 * `closeAccountingPeriodWithSnapshot` (Missão Financeiro V7/Fase C7), deliberadamente sem nenhum
 * import cruzado com o módulo financeiro. Sequência: calcula o payload ao vivo (leitura pura),
 * determina a próxima versão e a versão oficial anterior (se existir) a partir do histórico já
 * persistido, calcula o hash, e delega a escrita atômica ao repositório
 * (`persistInventorySnapshot`). Bloqueia fechamento repetido da mesma competência por padrão — a
 * única forma de substituir uma versão oficial já existente é o parâmetro `correctionOf` (Missão
 * Estoque E6.2), narrow e auditável, não uma reabertura genérica (ver seu próprio comentário em
 * `CloseInventorySnapshotInput`). Nunca cria/altera nenhuma movimentação ou item de estoque.
 */
export async function closeInventorySnapshot(input: CloseInventorySnapshotInput): Promise<CloseInventorySnapshotResult> {
  if (!input.createdBy.trim()) throw new Error("Responsável pelo fechamento é obrigatório.");

  const repo = getInventoryRepository();

  const existingOfficial = await repo.getOfficialInventorySnapshot(input.competenceMonth);
  if (existingOfficial) {
    if (!input.correctionOf) {
      throw new Error(`Competência ${input.competenceMonth} já possui um fechamento de estoque oficial (versão ${existingOfficial.version}) — reabra antes de fechar novamente.`);
    }
    if (input.correctionOf.officialSnapshotId !== existingOfficial.id) {
      throw new Error(
        `O snapshot oficial informado para correção (${input.correctionOf.officialSnapshotId}) não corresponde ao vigente (${existingOfficial.id}, versão ${existingOfficial.version}) — releia o estado atual antes de tentar novamente.`,
      );
    }
    if (!input.correctionOf.reason.trim()) {
      throw new Error("Motivo da correção (correctionOf.reason) é obrigatório e não pode ser vazio.");
    }
  }

  const draftPayload = await computeInventorySnapshotPayload({ competenceMonth: input.competenceMonth, cutoffAt: input.cutoffAt, caveat: "" });
  // Missão Estoque E6.2 — só produtos com uma contagem física REAL (`hasRealPhysicalCount`) entram
  // nesse agregado; um produto recém-cadastrado sem nenhuma movimentação de contagem NUNCA pode
  // fazer a "última contagem física" do fechamento pular para a data de cadastro dele.
  const itemsWithRealPhysicalCount = draftPayload.products.filter((p) => p.hasRealPhysicalCount);
  const lastPhysicalCountAt =
    itemsWithRealPhysicalCount.length > 0 ? itemsWithRealPhysicalCount.map((p) => p.lastPhysicalCountDate).reduce((max, d) => (d > max ? d : max)) : null;
  const caveat = input.caveat ?? buildDefaultCaveat(input.cutoffAt, lastPhysicalCountAt);
  const payload: InventorySnapshotPayload = { ...draftPayload, caveat };

  const payloadHash = computeInventorySnapshotHash(payload);

  const existingVersions = await repo.listInventorySnapshots(input.competenceMonth);
  const nextVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions.map((v) => v.version)) + 1;

  const notes = input.correctionOf
    ? `Correção de metadado (Missão Estoque E6.2): ${input.correctionOf.reason}. Substitui a versão ${existingOfficial?.version ?? "?"} (id ${input.correctionOf.officialSnapshotId}), que permanece no histórico marcada como não oficial (supersededAt preenchido), nunca apagada.`
    : (input.notes ?? null);

  const snapshot = await repo.persistInventorySnapshot({
    competenceMonth: input.competenceMonth,
    version: nextVersion,
    cutoffAt: input.cutoffAt,
    lastPhysicalCountAt,
    methodology: payload.methodology,
    caveat,
    payload,
    payloadHash,
    hashAlgorithm: INVENTORY_SNAPSHOT_HASH_ALGORITHM,
    totalProducts: payload.totalProducts,
    productsWithCost: payload.productsWithCost,
    isPartialValue: payload.isPartialValue,
    createdBy: input.createdBy,
    notes,
    previousOfficialSnapshotId: existingOfficial?.id ?? null,
  });

  return { snapshot };
}

/** Leitura oficial — NUNCA recalcula. Retorna null quando a competência nunca foi fechada. */
export async function getOfficialInventoryClosedSnapshot(competenceMonth: string): Promise<InventorySnapshot | null> {
  return getInventoryRepository().getOfficialInventorySnapshot(competenceMonth);
}

export interface InventorySnapshotIntegrityResult {
  snapshot: InventorySnapshot;
  isIntact: boolean;
  recomputedHash: string;
}

/** Reconfere que o payload lido do banco é bit-a-bit o que foi fechado. */
export async function verifyInventorySnapshotIntegrityById(competenceMonth: string, version: number): Promise<InventorySnapshotIntegrityResult | null> {
  const versions = await getInventoryRepository().listInventorySnapshots(competenceMonth);
  const snapshot = versions.find((v) => v.version === version);
  if (!snapshot) return null;
  const recomputedHash = computeInventorySnapshotHash(snapshot.payload);
  return { snapshot, isIntact: verifyInventorySnapshotIntegrity(snapshot.payload, snapshot.payloadHash), recomputedHash };
}
