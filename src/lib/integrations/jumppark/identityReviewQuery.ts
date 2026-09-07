import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { identityReviewItems } from "@/db/schema/crm";
import { parsePlateConflictReviewItem } from "@/lib/integrations/jumppark/plateConflictEvidence";

/**
 * Missão 28 (revisão segura de identidade) — leitura da fila "Identidades para revisar"
 * (`identity_review_items`). Um item por placa mascarada associada a mais de um nome de cliente
 * distinto nas ordens da JumpPark — nunca fundido automaticamente, sempre reversível (ver
 * `customersRefresh.ts` para como o item é gerado/atualizado a cada sincronização, e
 * `identity-review/actions.ts` para as ações manuais).
 */

export interface IdentityReviewCandidateRow {
  customerId: string | null;
  customerExternalId: string;
  name: string;
  visitCount: number;
  totalSpent: number;
  orderIds: string[];
}

export interface IdentityReviewUnresolvedOrderRow {
  orderId: string;
  orderDate: string;
  vehicleModel: string | null;
  totalAmount: number;
}

export interface IdentityReviewItemRow {
  id: string;
  subjectKey: string;
  plateMasked: string;
  confidence: string;
  rule: string;
  status: "pending" | "kept_separate" | "deferred";
  candidates: IdentityReviewCandidateRow[];
  unresolvedOrders: IdentityReviewUnresolvedOrderRow[];
  decidedAt: Date | null;
  decidedNotes: string | null;
  updatedAt: Date;
}

function toItemRow(row: typeof identityReviewItems.$inferSelect): IdentityReviewItemRow {
  const evidence = (row.evidence ?? {}) as { candidates?: IdentityReviewCandidateRow[]; unresolvedOrders?: IdentityReviewUnresolvedOrderRow[] };
  return {
    id: row.id,
    subjectKey: row.subjectKey,
    plateMasked: row.plateMasked,
    confidence: row.confidence,
    rule: row.rule,
    status: row.status,
    candidates: evidence.candidates ?? [],
    unresolvedOrders: evidence.unresolvedOrders ?? [],
    decidedAt: row.decidedAt,
    decidedNotes: row.decidedNotes,
    updatedAt: row.updatedAt,
  };
}

export interface IdentityReviewQueueResult {
  pending: IdentityReviewItemRow[];
  decided: IdentityReviewItemRow[];
  databaseConfigured: boolean;
}

/** Só itens ativos (evidência ainda detectada no recálculo mais recente) — itens resolvidos (evidência desapareceu) ficam `active = false`, preservados, mas fora desta listagem. */
export async function fetchIdentityReviewQueue(): Promise<IdentityReviewQueueResult> {
  if (!isDatabaseConfigured()) return { pending: [], decided: [], databaseConfigured: false };
  const db = getDb();
  if (!db) return { pending: [], decided: [], databaseConfigured: false };

  const rows = await db.select().from(identityReviewItems).where(eq(identityReviewItems.active, true)).orderBy(desc(identityReviewItems.updatedAt));
  /**
   * Missão 20 — linhas reconhecidas pelo parser da Missão 18 como conflito de placa têm sua
   * própria tela dedicada (`plateConflictReviewQueue.ts` + `PlateConflictReviewCard`), que já
   * mostra a evidência completa e enriquecida. Excluídas aqui para nunca duplicar o mesmo item
   * (antes desta missão, essas linhas passavam por `toItemRow` e apareciam quase vazias — achado
   * da Missão 15 — porque o formato de evidência é outro; nada no comportamento das linhas
   * antigas muda).
   */
  const legacyRows = rows.filter((row) => parsePlateConflictReviewItem(row).kind !== "plateConflict");
  const items = legacyRows.map(toItemRow);

  return {
    pending: items.filter((i) => i.status === "pending"),
    decided: items.filter((i) => i.status !== "pending"),
    databaseConfigured: true,
  };
}
