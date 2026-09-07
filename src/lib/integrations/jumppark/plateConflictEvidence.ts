import "server-only";
import type { identityReviewItems } from "@/db/schema/crm";

/**
 * Missão 18 (Etapa B do design da Missão 16) — camada única e tipada de leitura dos itens de
 * `identity_review_items` que representam conflito de placa (Missão 14/17). Vive ao lado de
 * `identityReviewQuery.ts` (mesmo diretório, mesma responsabilidade de leitura da fila de
 * revisão) e deliberadamente NÃO importa nada de `customersRefresh.ts` — a validação abaixo é
 * estrutural, contra o `evidence` (jsonb, sem garantia de tipo em tempo de compilação) tal como
 * ele está persistido, e não contra os tipos TypeScript do módulo que o produz. Isso evita
 * dependência circular com o sync e mantém o lado de leitura resiliente mesmo que o produtor
 * evolua sem essa camada sendo atualizada no mesmo commit.
 *
 * Esta camada só interpreta `review-item + evidence`. Nenhum enriquecimento com dados atuais de
 * customer/vehicle/appointment/service acontece aqui — isso é a Etapa C (não autorizada ainda).
 */

/** Só os dois valores estruturados pela Missão 17 — nunca inferido por texto humano. */
export type PlateConflictType = "manual_jumppark" | "jumppark_jumppark";

const PLATE_CONFLICT_TYPES: readonly PlateConflictType[] = ["manual_jumppark", "jumppark_jumppark"];

/** Identificadores estruturais apenas — nunca nome/telefone/CPF/e-mail/modelo/marca/cor (Missão 16/17). */
export interface PlateConflictExistingVehicle {
  vehicleId: string;
  /** `null` apenas por robustez a formatos futuros — o contrato atual (Missão 17) sempre preenche. */
  customerId: string | null;
  source: string;
}

/**
 * Menor ViewModel necessário para a próxima etapa (leitura read-only do review-item). Não inclui
 * customerName, vehicle model, appointment, serviceName nem nada de ação/resolução — isso entra
 * nas Etapas C/D/E.
 */
export interface PlateConflictReviewViewModel {
  reviewItemId: string;
  /** Guardado apenas como informação auxiliar — nunca reparseado para decidir o tipo do conflito. */
  subjectKey: string;
  /** `linked` (Missão 27/28, Etapa E2/E3) — operador confirmou "é o mesmo veículo". */
  status: "pending" | "kept_separate" | "deferred" | "linked";
  conflictType: PlateConflictType;
  /** Uso lógico/dedup — nunca exibir diretamente sem passar por `displayPlate`. */
  normalizedPlate: string;
  /** Valor de apresentação — hoje espelha a coluna `plate_masked` tal como persistida pela Missão 17. */
  displayPlate: string;
  /** Sempre array — nunca reduzido a "o candidato escolhido". Vazio é um estado válido (ver `parsePlateConflictReviewItem`). */
  existingVehicles: PlateConflictExistingVehicle[];
  /** `[]` quando ausente no evidence (itens antigos da Missão 14, anteriores à Missão 17). */
  incomingOrderIds: string[];
  decidedAt: Date | null;
  decidedNotes: string | null;
  updatedAt: Date;
}

/**
 * A) `plateConflict` — evidence nova (Missão 17), estruturalmente válida.
 * B) `legacyAmbiguity` — evidence antiga de ambiguidade de cliente (Missão 28/14), formato
 *    `{candidates, unresolvedOrders}`, sem `conflictType` — NUNCA classificado como conflito de placa.
 * C) `unrecognized` — nem um nem outro formato conhecido (evidence ausente/vazia/formato futuro
 *    desconhecido) — estado seguro, sem crash.
 * D) `invalidPlateConflictEvidence` — evidence que se declara conflito de placa (`conflictType`
 *    presente) mas falha na validação estrutural — estado seguro e explícito, distinto de
 *    "unrecognized" porque sinaliza um problema real de dados, não apenas um formato diferente.
 */
export type PlateConflictReviewParseResult =
  | { kind: "plateConflict"; viewModel: PlateConflictReviewViewModel }
  | { kind: "legacyAmbiguity" }
  | { kind: "unrecognized" }
  | { kind: "invalidPlateConflictEvidence"; reason: string };

/** Subconjunto de `identity_review_items` necessário para o parser — desacoplado da forma de consulta usada. */
export type PlateConflictReviewRawRow = Pick<
  typeof identityReviewItems.$inferSelect,
  "id" | "subjectKey" | "plateMasked" | "status" | "evidence" | "decidedAt" | "decidedNotes" | "updatedAt"
>;

function isPlateConflictType(value: unknown): value is PlateConflictType {
  return typeof value === "string" && (PLATE_CONFLICT_TYPES as readonly string[]).includes(value);
}

function looksLikeLegacyAmbiguityEvidence(evidence: Record<string, unknown>): boolean {
  return Array.isArray(evidence.candidates) || Array.isArray(evidence.unresolvedOrders);
}

function parseExistingVehicles(value: unknown): PlateConflictExistingVehicle[] | null {
  if (!Array.isArray(value)) return null;
  const result: PlateConflictExistingVehicle[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.vehicleId !== "string" || e.vehicleId.length === 0) return null;
    if (typeof e.source !== "string" || e.source.length === 0) return null;
    const customerId = typeof e.customerId === "string" && e.customerId.length > 0 ? e.customerId : null;
    result.push({ vehicleId: e.vehicleId, customerId, source: e.source });
  }
  return result;
}

function parseIncomingOrderIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Interpreta um review-item e sua `evidence` (jsonb cru) de forma segura, sem nunca lançar.
 * Não acessa banco, não busca customer/vehicle atual, não altera nada.
 */
export function parsePlateConflictReviewItem(row: PlateConflictReviewRawRow): PlateConflictReviewParseResult {
  const evidence = row.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { kind: "unrecognized" };
  }
  const e = evidence as Record<string, unknown>;

  if (!("conflictType" in e)) {
    return looksLikeLegacyAmbiguityEvidence(e) ? { kind: "legacyAmbiguity" } : { kind: "unrecognized" };
  }

  if (!isPlateConflictType(e.conflictType)) {
    return { kind: "invalidPlateConflictEvidence", reason: "conflictType desconhecido" };
  }

  if (typeof e.normalizedPlate !== "string" || e.normalizedPlate.length === 0) {
    return { kind: "invalidPlateConflictEvidence", reason: "normalizedPlate ausente ou inválido" };
  }

  const existingVehicles = parseExistingVehicles(e.existingVehicles);
  if (existingVehicles === null) {
    return { kind: "invalidPlateConflictEvidence", reason: "existingVehicles ausente ou malformado" };
  }

  return {
    kind: "plateConflict",
    viewModel: {
      reviewItemId: row.id,
      subjectKey: row.subjectKey,
      status: row.status,
      conflictType: e.conflictType,
      normalizedPlate: e.normalizedPlate,
      displayPlate: row.plateMasked,
      existingVehicles,
      incomingOrderIds: parseIncomingOrderIds(e.incomingOrderIds),
      decidedAt: row.decidedAt,
      decidedNotes: row.decidedNotes,
      updatedAt: row.updatedAt,
    },
  };
}
