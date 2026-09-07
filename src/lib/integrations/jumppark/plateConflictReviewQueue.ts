import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { identityReviewItems } from "@/db/schema/crm";
import { enrichPlateConflictReviewItems, type EnrichedPlateConflictReviewViewModel } from "@/lib/integrations/jumppark/plateConflictEnrichment";
import { parsePlateConflictReviewItem, type PlateConflictReviewViewModel } from "@/lib/integrations/jumppark/plateConflictEvidence";

/**
 * Missão 20 (Etapa D — UI read-only) — orquestra a leitura da fila de conflitos de placa para a
 * tela "Identidades para revisar": lê `identity_review_items` (mesma tabela de
 * `identityReviewQuery.ts`, mesmo filtro `active = true`), classifica cada linha com o parser
 * puro da Missão 18 e mantém só as reconhecidas como conflito de placa, então enriquece TODAS de
 * uma vez com `enrichPlateConflictReviewItems` (Missão 19 — batch, nunca N+1 por item).
 *
 * `identityReviewQuery.ts` (Missão 28/15) exclui essas mesmas linhas do seu próprio resultado
 * (ver `fetchIdentityReviewQueue`) para nunca duplicar o item na tela — cada linha aparece em
 * exatamente uma das duas listas.
 */
export interface PlateConflictReviewQueueResult {
  pending: EnrichedPlateConflictReviewViewModel[];
  decided: EnrichedPlateConflictReviewViewModel[];
  databaseConfigured: boolean;
}

export async function fetchPlateConflictReviewQueue(): Promise<PlateConflictReviewQueueResult> {
  if (!isDatabaseConfigured()) return { pending: [], decided: [], databaseConfigured: false };
  const db = getDb();
  if (!db) return { pending: [], decided: [], databaseConfigured: false };

  const rows = await db.select().from(identityReviewItems).where(eq(identityReviewItems.active, true)).orderBy(desc(identityReviewItems.updatedAt));

  const viewModels: PlateConflictReviewViewModel[] = [];
  for (const row of rows) {
    const parsed = parsePlateConflictReviewItem(row);
    if (parsed.kind === "plateConflict") viewModels.push(parsed.viewModel);
  }

  const enriched = await enrichPlateConflictReviewItems(viewModels);

  return {
    pending: enriched.filter((item) => item.status === "pending"),
    decided: enriched.filter((item) => item.status !== "pending"),
    databaseConfigured: true,
  };
}
