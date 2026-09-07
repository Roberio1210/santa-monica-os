import "server-only";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { customers, identityReviewItems, vehicles } from "@/db/schema/crm";
import { jumpParkServiceOrders } from "@/db/schema/jumppark";
import { auditLogs } from "@/db/schema/system";
import { aggregateJumpParkCustomersAndVehicles, type OrderForAggregation } from "@/lib/integrations/jumppark/customers";
import { jumpParkLogger } from "@/lib/integrations/jumppark/logger";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { normalizePlate } from "@/lib/crm/normalize";
import { classifyPlateValue } from "@/lib/crm/identityEvidence";

/**
 * Recalcula Clientes e Veículos (tabelas `customers`/`vehicles`, `source = 'jumppark'`) a partir
 * de TODAS as ordens hoje em `jumppark_service_orders` — não é um delta incremental por ordem
 * nova, é um recálculo completo disparado a cada sincronização (Missão 26). Decisão de CTO,
 * documentada: no volume atual (dezenas/centenas de ordens) e no volume esperado no curto prazo
 * (milhares), reprocessar tudo em memória é da ordem de milissegundos — uma sincronização
 * incremental "só do delta" seria complexidade real sem ganho comprovado agora. Se o volume
 * crescer para centenas de milhares de ordens, essa é a primeira otimização a revisitar.
 *
 * Nunca escreve nas linhas de clientes/veículos com `source != 'jumppark'` (clientes cadastrados
 * manualmente no Atendimento) — a chave de conflito é sempre `external_id`, que só é preenchido
 * aqui, nunca pelo fluxo manual do Atendimento.
 *
 * Missão 28 (revisão segura de identidade, 07/08/2026) — o recálculo agora também:
 *   1. Grava `identityConfidence`/`identityConfidenceReason` (puramente derivados, ver
 *      `customers.ts`) a cada passagem.
 *   2. Nunca sobrescreve `customer_id`/`vehicle_id` de uma ordem com `customer_link_locked = true`
 *      — é assim que uma decisão manual da fila "Identidades para revisar" sobrevive ao recálculo
 *      completo. Ordens não travadas são sempre atualizadas com o resultado mais recente da
 *      agregação, inclusive voltando a `null` se a evidência que as vinculava deixou de existir
 *      (autocorretivo: nunca fica "preso" com um vínculo que a regra atual não sustenta mais).
 *   3. Faz upsert dos itens da fila de revisão por `subjectKey`, atualizando só as colunas de
 *      evidência — nunca `status`/`decidedAt`/`decidedNotes` de um item já decidido por um humano.
 *      Itens cuja ambiguidade não existe mais nesta passagem são marcados `active = false` (nunca
 *      apagados) para preservar o histórico e permitir reverter.
 */

/** "manual_jumppark" quando pelo menos um candidato é `source='manual'` (prioridade sobre jumppark — ver `classifyVehiclePlateConflict`); "jumppark_jumppark" só quando TODOS os candidatos são `source='jumppark'`. */
export type VehiclePlateConflictType = "manual_jumppark" | "jumppark_jumppark";

export interface VehicleConflictCandidateEntry {
  vehicleId: string;
  customerId: string;
  source: string;
}

/**
 * Missão 16/17 — contrato estrutural mínimo da evidência: só identificadores (nunca nome/
 * telefone/CPF/e-mail/modelo/marca/cor — tudo isso é buscável depois por ID, nunca duplicado
 * aqui). `incomingOrderIds` é a peça-chave do modelo híbrido aprovado na Missão 16: a ordem crua
 * já fica persistida em `jumppark_service_orders` independente deste bloqueio (o sync a upserta
 * antes de chegar aqui), então qualquer dado do lado incoming (nome, telefone, modelo, cor,
 * valores) pode ser buscado sob demanda por esses ids, sem nunca precisar ser copiado para cá.
 */
export interface VehicleConflictEvidence {
  conflictType: VehiclePlateConflictType;
  normalizedPlate: string;
  /** Sempre array, mesmo com um único candidato — nunca escolhido/reduzido a um só (Missão 14/16). */
  existingVehicles: VehicleConflictCandidateEntry[];
  incomingJumpParkExternalId: string;
  /** `null` quando a ordem incoming não tem identidade de cliente resolvida (sem nome nem telefone utilizável) — nunca inventado. */
  incomingJumpParkCustomerExternalId: string | null;
  /** Ids internos de `jumppark_service_orders` — permitem buscar nome/telefone/modelo/cor/valores da ordem incoming sob demanda, sem duplicar aqui. */
  incomingOrderIds: string[];
  origin: "jumppark";
}

export interface VehicleConflictItem {
  subjectKey: string;
  plateMasked: string;
  rule: string;
  evidence: VehicleConflictEvidence;
}

interface VehicleConflictCandidate {
  id: string;
  customerId: string;
  source: string;
}

/**
 * Missão 14 (ajustada na Missão 17 — contrato de evidência da Missão 16) — decide, de forma PURA
 * (sem I/O, sem `db`, sem chamada de rede), se um vehicle JumpPark com `external_id` novo pode ser
 * criado com segurança ou colide com um vehicle já existente (manual ou outro jumppark sob um
 * `external_id` diferente). `candidates` é o resultado já consultado de
 * `findVehiclesByNormalizedPlate` — esta função nunca faz a consulta, só decide a partir do
 * resultado. Extraída assim para ser testável sem depender do reprocessamento completo de
 * `refreshJumpParkCustomers` (que sempre varre TODA a tabela `jumppark_service_orders` por desenho
 * — ver docstring dela — e por isso é lenta demais para testar em memória).
 *
 * Retorna `null` quando é seguro prosseguir com a criação normal (nenhum candidato encontrado).
 * Retorna o item de revisão a ser upsertado quando há qualquer candidato — nunca escolhe um
 * automaticamente, nunca funde, nunca decide por customer/modelo/marca/cor.
 *
 * Se `candidates` misturar sources (manual + jumppark ao mesmo tempo), a classificação prioriza
 * `manual_jumppark` — um conflito envolvendo um vehicle manual é operacionalmente mais sensível
 * (risco de duplicar um cliente/agendamento real) do que uma inconsistência só entre dois
 * registros jumppark, então nunca fica "escondido" atrás do outro tipo.
 */
export function classifyVehiclePlateConflict(
  candidates: VehicleConflictCandidate[],
  normalizedPlate: string,
  incomingExternalId: string,
  incomingCustomerExternalId: string | null,
  incomingOrderIds: string[] = [],
): VehicleConflictItem | null {
  if (candidates.length === 0) return null;

  const isManualConflict = candidates.some((c) => c.source === "manual");
  const conflictType: VehiclePlateConflictType = isManualConflict ? "manual_jumppark" : "jumppark_jumppark";
  const subjectKey = `vehicle_plate_collision_${conflictType}:${normalizedPlate}`;

  const evidence: VehicleConflictEvidence = {
    conflictType,
    normalizedPlate,
    existingVehicles: candidates.map((c) => ({ vehicleId: c.id, customerId: c.customerId, source: c.source })),
    incomingJumpParkExternalId: incomingExternalId,
    incomingJumpParkCustomerExternalId: incomingCustomerExternalId,
    incomingOrderIds,
    origin: "jumppark",
  };

  return {
    subjectKey,
    plateMasked: normalizedPlate,
    rule: isManualConflict
      ? "Placa de ordem JumpPark nova (external_id ainda desconhecido) coincide com a placa de um vehicle já cadastrado manualmente — nunca fundido/sobrescrito automaticamente, requer decisão manual."
      : "Placa de ordem JumpPark nova (external_id ainda desconhecido) coincide com a placa de outro vehicle já sincronizado da própria JumpPark, sob external_id diferente — inconsistência de identidade, nunca duplicada automaticamente.",
    evidence,
  };
}

export interface ReopenPlateConflictDecision {
  shouldReopen: boolean;
  /** `null` quando `shouldReopen` é `false` — motivo humano-legível, usado como `notes` do `audit_logs` gerado. */
  reason: string | null;
}

/** Fail-safe: evidence sem `incomingOrderIds` reconhecível (ausente, malformada, tipo errado) nunca é lida como "cobre tudo" — só como conjunto vazio, o que força reabertura sempre que a evidência nova trouxer qualquer ordem. */
function extractIncomingOrderIdSet(evidence: unknown): Set<string> {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return new Set();
  const raw = (evidence as Record<string, unknown>).incomingOrderIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((entry): entry is string => typeof entry === "string"));
}

/**
 * Missão 24 (Etapa E1) — decide, de forma PURA (sem I/O), se um review-item de conflito de placa
 * JÁ DECIDIDO por um humano (`existingStatus !== "pending"`) precisa voltar para revisão porque a
 * evidência JumpPark da passagem atual (`newIncomingOrderIds`) contém pelo menos uma ordem que a
 * decisão anterior nunca viu. Comparação sempre por CONJUNTO (nunca por posição/ordem do array,
 * nunca afetada por duplicatas) — "uma decisão humana vale para o caso concreto analisado, nunca
 * para toda ocorrência futura da mesma placa" (Missão 24).
 *
 * Não decide OUTRA coisa: não sabe (nem precisa saber) qual foi a decisão ("mesmo veículo",
 * "diferentes" etc. — Etapa E, ainda não implementada) — só se a evidência atual ultrapassa o que
 * foi revisado. Item ainda `pending` nunca precisa "reabrir" (já está aberto) — `shouldReopen`
 * sempre `false` nesse caso, upsert de evidência continua exatamente como antes desta missão.
 */
export function decidePlateConflictReopen(existingStatus: string, existingEvidence: unknown, newIncomingOrderIds: string[]): ReopenPlateConflictDecision {
  if (existingStatus === "pending") return { shouldReopen: false, reason: null };

  const previouslySeen = extractIncomingOrderIdSet(existingEvidence);
  const uncovered = Array.from(new Set(newIncomingOrderIds)).filter((id) => !previouslySeen.has(id));

  if (uncovered.length === 0) return { shouldReopen: false, reason: null };

  return {
    shouldReopen: true,
    reason: `Nova(s) ordem(ns) JumpPark não abrangida(s) pela decisão anterior: ${uncovered.join(", ")}.`,
  };
}

export interface CustomersRefreshResult {
  status: "success" | "not_configured";
  customersUpserted: number;
  vehiclesUpserted: number;
  ordersLinked: number;
  ordersUnlinked: number;
  reviewItemsUpserted: number;
  reviewItemsDeactivated: number;
  /** Missão 14 — veículos JumpPark cuja criação foi bloqueada por colisão de placa (com vehicle manual ou com outro vehicle jumppark) e viraram item de revisão em vez de duplicata silenciosa. */
  vehicleConflictsQueued: number;
}

const NOT_CONFIGURED_RESULT: CustomersRefreshResult = {
  status: "not_configured",
  customersUpserted: 0,
  vehiclesUpserted: 0,
  ordersLinked: 0,
  ordersUnlinked: 0,
  reviewItemsUpserted: 0,
  reviewItemsDeactivated: 0,
  vehicleConflictsQueued: 0,
};

export async function refreshJumpParkCustomers(): Promise<CustomersRefreshResult> {
  if (!isDatabaseConfigured()) {
    return NOT_CONFIGURED_RESULT;
  }
  const db = getDb();
  if (!db) return NOT_CONFIGURED_RESULT;

  const rows = await db
    .select({
      id: jumpParkServiceOrders.id,
      clientName: jumpParkServiceOrders.clientName,
      clientPhoneMasked: jumpParkServiceOrders.clientPhoneMasked,
      plateMasked: jumpParkServiceOrders.plateMasked,
      vehicleModel: jumpParkServiceOrders.vehicleModel,
      orderDate: jumpParkServiceOrders.orderDate,
      totalAmount: jumpParkServiceOrders.totalAmount,
      servicesAmount: jumpParkServiceOrders.servicesAmount,
      customerLinkLocked: jumpParkServiceOrders.customerLinkLocked,
      currentCustomerId: jumpParkServiceOrders.customerId,
      currentVehicleId: jumpParkServiceOrders.vehicleId,
    })
    .from(jumpParkServiceOrders);

  const orders: OrderForAggregation[] = rows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    clientPhoneMasked: r.clientPhoneMasked,
    plateMasked: r.plateMasked,
    vehicleModel: r.vehicleModel,
    orderDate: r.orderDate,
    totalAmount: Number(r.totalAmount),
    servicesAmount: Number(r.servicesAmount),
  }));
  const lockedOrderIds = new Set(rows.filter((r) => r.customerLinkLocked).map((r) => r.id));
  const currentLinkByOrderId = new Map(rows.map((r) => [r.id, { customerId: r.currentCustomerId, vehicleId: r.currentVehicleId }]));

  // Decisões manuais já tomadas (ordem travada + cliente já vinculado) — alimentam a agregação
  // pura para que a ordem conte nas estatísticas do cliente escolhido (ver customers.ts).
  const lockedLinkRows = await db
    .select({ orderId: jumpParkServiceOrders.id, customerExternalId: customers.externalId })
    .from(jumpParkServiceOrders)
    .innerJoin(customers, eq(jumpParkServiceOrders.customerId, customers.id))
    .where(eq(jumpParkServiceOrders.customerLinkLocked, true));
  const manualCustomerLinks = new Map(lockedLinkRows.filter((r) => r.customerExternalId).map((r) => [r.orderId, r.customerExternalId as string]));

  const aggregation = aggregateJumpParkCustomersAndVehicles(orders, manualCustomerLinks);

  const customerIdByExternalId = new Map<string, string>();
  for (const c of aggregation.customers) {
    const values = {
      name: c.name,
      phone: c.phone,
      totalSpent: String(c.totalSpent),
      lastVisit: c.lastVisitAt,
      firstVisitAt: c.firstVisitAt,
      visitCount: c.visitCount,
      averageTicket: String(c.averageTicket),
      servicesOrderCount: c.servicesOrderCount,
      identityConfidence: c.identityConfidence,
      identityConfidenceReason: c.identityConfidenceReason,
      source: "jumppark" as const,
      externalId: c.externalId,
    };
    const [row] = await db
      .insert(customers)
      .values(values)
      .onConflictDoUpdate({ target: customers.externalId, set: { ...values, updatedAt: new Date() } })
      .returning({ id: customers.id });
    customerIdByExternalId.set(c.externalId, row.id);
  }

  // Missão 14 — proteção contra duplicação de vehicle entre o sync JumpPark e um vehicle já
  // existente (manual, com placa preenchida via `assignPlateToVehicle` da Missão 11, ou até outro
  // jumppark com external_id diferente). O único conflito que este `ON CONFLICT` abaixo já
  // resolve sozinho é quando o `external_id` JÁ é conhecido (PASSO A da missão) — esse caminho
  // permanece 100% inalterado. O risco real é quando o `external_id` é NOVO: sem a checagem
  // abaixo, o INSERT criaria um segundo vehicle para a mesma placa física, silenciosamente.
  const existingExternalIdRows = await db.select({ externalId: vehicles.externalId }).from(vehicles).where(isNotNull(vehicles.externalId));
  const knownExternalIds = new Set(existingExternalIdRows.map((r) => r.externalId as string));

  const vehicleConflictItems: VehicleConflictItem[] = [];

  const vehicleIdByExternalId = new Map<string, string>();
  for (const v of aggregation.vehicles) {
    const ownerId = v.customerExternalId ? customerIdByExternalId.get(v.customerExternalId) : null;
    if (!ownerId) {
      jumpParkLogger.warn("Veículo sem cliente resolvido — pulado no recálculo.", { vehicleExternalId: v.externalId });
      continue;
    }

    // PASSO A — external_id já conhecido: fluxo atual, sem nenhuma mudança. A nova checagem de
    // conflito só se aplica a external_id NOVO (PASSO B/C).
    if (!knownExternalIds.has(v.externalId)) {
      // PASSO B — só placas FULL (Mercosul ou padrão antigo) participam da checagem de conflito;
      // placas mascaradas/parciais/ausentes nunca são comparáveis contra a coluna `plate` de um
      // vehicle manual, então seguem o fluxo atual sem bloqueio (nunca inventamos correspondência
      // a partir de um dado incompleto).
      const evidence = classifyPlateValue(v.plate);
      if (evidence.classification === "FULL" && evidence.fullPlate) {
        // PASSO C — normalizador canônico já existente (mesmo usado por `assignPlateToVehicle`,
        // Missão 11) e o mecanismo de busca cross-source já existente e auditado (Missão 13),
        // nunca uma comparação nova.
        const normalizedPlate = normalizePlate(evidence.fullPlate);
        const candidates = normalizedPlate ? await getAttendanceRepository().findVehiclesByNormalizedPlate(normalizedPlate) : [];
        const conflict = normalizedPlate ? classifyVehiclePlateConflict(candidates, normalizedPlate, v.externalId, v.customerExternalId, v.orderIds) : null;

        if (conflict) {
          vehicleConflictItems.push(conflict);
          jumpParkLogger.warn("Criação de vehicle JumpPark bloqueada por colisão de placa — item de revisão gerado.", {
            vehicleExternalId: v.externalId,
            candidateCount: candidates.length,
            subjectKey: conflict.subjectKey,
          });

          // Não insere, não atualiza vehicle nenhum, não vincula este external_id a nenhum id —
          // ordens deste veículo ficam sem vehicle_id até decisão humana (nunca um vínculo inventado).
          continue;
        }
      }
    }

    const values = {
      customerId: ownerId,
      plate: v.plate,
      model: v.model,
      firstSeenAt: v.firstSeenAt,
      lastSeenAt: v.lastSeenAt,
      visitCount: v.visitCount,
      source: "jumppark" as const,
      externalId: v.externalId,
    };
    const [row] = await db
      .insert(vehicles)
      .values(values)
      .onConflictDoUpdate({ target: vehicles.externalId, set: { ...values, updatedAt: new Date() } })
      .returning({ id: vehicles.id });
    vehicleIdByExternalId.set(v.externalId, row.id);
  }

  let ordersLinked = 0;
  let ordersUnlinked = 0;
  for (const order of orders) {
    if (lockedOrderIds.has(order.id)) continue; // decisão manual — recálculo automático nunca sobrescreve.

    const custExtId = aggregation.orderCustomerExternalId.get(order.id) ?? null;
    const vehExtId = aggregation.orderVehicleExternalId.get(order.id) ?? null;
    const customerId = custExtId ? (customerIdByExternalId.get(custExtId) ?? null) : null;
    const vehicleId = vehExtId ? (vehicleIdByExternalId.get(vehExtId) ?? null) : null;

    if (customerId || vehicleId) ordersLinked += 1;
    else ordersUnlinked += 1;

    const current = currentLinkByOrderId.get(order.id);
    if (current && current.customerId === customerId && current.vehicleId === vehicleId) continue; // já reflete o resultado atual — evita escrita sem necessidade.

    await db.update(jumpParkServiceOrders).set({ customerId, vehicleId, updatedAt: new Date() }).where(eq(jumpParkServiceOrders.id, order.id));
  }

  // Fila de revisão — upsert por subjectKey, sem nunca tocar em status/decidedAt/decidedNotes de
  // itens já decididos por um humano (só as colunas de evidência abaixo).
  const seenSubjectKeys = new Set<string>();
  let reviewItemsUpserted = 0;
  for (const item of aggregation.reviewItems) {
    seenSubjectKeys.add(item.subjectKey);
    const candidatesWithCustomerId = item.candidates.map((c) => ({ ...c, customerId: customerIdByExternalId.get(c.customerExternalId) ?? null }));
    const evidence = { candidates: candidatesWithCustomerId, unresolvedOrders: item.unresolvedOrders };

    await db
      .insert(identityReviewItems)
      .values({
        subjectKey: item.subjectKey,
        plateMasked: item.plateMasked,
        confidence: "ambiguo",
        rule: item.rule,
        evidence,
        active: true,
        source: "jumppark",
      })
      .onConflictDoUpdate({
        target: identityReviewItems.subjectKey,
        set: { plateMasked: item.plateMasked, rule: item.rule, evidence, active: true, updatedAt: new Date() },
      });
    reviewItemsUpserted += 1;
  }

  // Missão 14 — mesmo mecanismo de upsert idempotente por `subjectKey`, para os conflitos de
  // colisão de placa vehicle manual↔jumppark/jumppark↔jumppark detectados acima. Precisam entrar
  // no MESMO `seenSubjectKeys` da fila de ambiguidade de cliente — senão a limpeza de itens obsoletos
  // logo abaixo desativaria, na mesma passagem, um item que acabou de ser criado/atualizado aqui.
  //
  // Missão 24 (Etapa E1) — antes de fazer o upsert, busca em lote as linhas já existentes para
  // estes subjectKeys: se uma já estiver decidida (`status !== "pending"`) e a evidência desta
  // passagem trouxer ordem incoming que a decisão anterior nunca viu, o item volta para `pending`
  // (nunca um status novo — reaproveita o mesmo mecanismo já usado por `reopenReviewAction`) e um
  // `audit_logs` preserva o estado anterior antes de qualquer coisa ser sobrescrita. Itens ainda
  // `pending`, ou decididos sem ordem nova, seguem exatamente o comportamento de antes desta missão.
  const vehicleConflictSubjectKeys = vehicleConflictItems.map((item) => item.subjectKey);
  const existingVehicleConflictRows =
    vehicleConflictSubjectKeys.length > 0 ? await db.select().from(identityReviewItems).where(inArray(identityReviewItems.subjectKey, vehicleConflictSubjectKeys)) : [];
  const existingVehicleConflictBySubjectKey = new Map(existingVehicleConflictRows.map((row) => [row.subjectKey, row]));

  for (const item of vehicleConflictItems) {
    seenSubjectKeys.add(item.subjectKey);
    const existing = existingVehicleConflictBySubjectKey.get(item.subjectKey);
    const reopenDecision = existing ? decidePlateConflictReopen(existing.status, existing.evidence, item.evidence.incomingOrderIds) : { shouldReopen: false, reason: null };

    const values = {
      subjectKey: item.subjectKey,
      plateMasked: item.plateMasked,
      confidence: "ambiguo" as const,
      rule: item.rule,
      evidence: item.evidence,
      active: true,
      source: "jumppark" as const,
    };

    if (reopenDecision.shouldReopen && existing) {
      await db.transaction(async (tx) => {
        await tx.insert(auditLogs).values({
          actorUserId: null,
          action: "plate_conflict_review_reopened",
          entityType: "identity_review_items",
          entityId: existing.id,
          beforeState: { status: existing.status, decidedAt: existing.decidedAt ? existing.decidedAt.toISOString() : null, decidedNotes: existing.decidedNotes, evidence: existing.evidence },
          afterState: { status: "pending", decidedAt: null, decidedNotes: null, evidence: item.evidence },
          source: "jumppark",
          notes: reopenDecision.reason,
        });
        await tx
          .insert(identityReviewItems)
          .values(values)
          .onConflictDoUpdate({
            target: identityReviewItems.subjectKey,
            set: { ...values, updatedAt: new Date(), status: "pending", decidedAt: null, decidedNotes: null },
          });
      });
      continue;
    }

    await db
      .insert(identityReviewItems)
      .values(values)
      .onConflictDoUpdate({
        target: identityReviewItems.subjectKey,
        set: { plateMasked: item.plateMasked, rule: item.rule, evidence: item.evidence, active: true, updatedAt: new Date() },
      });
  }
  const vehicleConflictsQueued = vehicleConflictItems.length;

  // Itens que existiam mas cuja ambiguidade não foi detectada nesta passagem: marcar inativos
  // (nunca apagar — preserva histórico e permite reverter se a ambiguidade reaparecer).
  const staleRows = await db.select({ subjectKey: identityReviewItems.subjectKey }).from(identityReviewItems).where(eq(identityReviewItems.active, true));
  const staleKeys = staleRows.map((r) => r.subjectKey).filter((key) => !seenSubjectKeys.has(key));
  let reviewItemsDeactivated = 0;
  if (staleKeys.length > 0) {
    await db
      .update(identityReviewItems)
      .set({ active: false, updatedAt: new Date() })
      .where(inArray(identityReviewItems.subjectKey, staleKeys));
    reviewItemsDeactivated = staleKeys.length;
  }

  jumpParkLogger.info("Recálculo de Clientes/Veículos concluído.", {
    ordersProcessed: orders.length,
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
    ordersUnlinked,
    reviewItemsUpserted,
    reviewItemsDeactivated,
    vehicleConflictsQueued,
  });

  return {
    status: "success",
    customersUpserted: aggregation.customers.length,
    vehiclesUpserted: vehicleIdByExternalId.size,
    ordersLinked,
    ordersUnlinked,
    reviewItemsUpserted,
    reviewItemsDeactivated,
    vehicleConflictsQueued,
  };
}
