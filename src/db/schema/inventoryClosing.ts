import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, notes, timestamps } from "./common";

/**
 * Missão Estoque E4 (31/08/2026) — snapshot imutável de uma posição de estoque num corte de
 * competência, inspirado deliberadamente no mecanismo de `dre_snapshots` (Missão Financeiro V7/
 * Fase C7), mas SEM nenhum acoplamento de código com o módulo financeiro (nenhum import cruzado —
 * ver `src/lib/inventory/inventorySnapshot.ts`/`inventorySnapshotHash.ts`, sempre auto-contidos).
 *
 * Motivação real: a auditoria de agosto/2026 (Missões E1-E3) encontrou zero movimentação de
 * saída/consumo real registrada no mês inteiro, e a última contagem física comprovada foi em
 * 18/08/2026 — não em 31/08. Fechar "estoque de agosto" sem distinguir isso seria fingir uma
 * precisão que os dados não têm. Este snapshot preserva a distinção explicitamente: cada produto
 * do payload carrega sua própria origem (`PHYSICAL_CONFIRMED` vs `SYSTEM_THEORETICAL`), nunca uma
 * única bandeira global que esconderia a diferença produto a produto.
 */
export const inventoryPositionOriginEnum = ["PHYSICAL_CONFIRMED", "SYSTEM_THEORETICAL"] as const;

export const inventorySnapshots = pgTable(
  "inventory_snapshots",
  {
    id: id(),
    /** Formato "YYYY-MM" — não único sozinho: várias versões históricas podem existir por competência (mesmo padrão de `dre_snapshots`). */
    competenceMonth: text("competence_month").notNull(),
    /** 1, 2, 3... por competência — nunca reaproveitado, nunca decrementado. */
    version: integer("version").notNull(),
    /** true = fechamento vigente desta competência. No máximo UMA linha true por competenceMonth (índice único parcial abaixo, não só na aplicação). */
    isOfficial: boolean("is_official").notNull().default(true),
    /** Data de corte da posição congelada (ex.: "2026-08-31") — pode ser diferente da data da última contagem física real. */
    cutoffAt: date("cutoff_at").notNull(),
    /**
     * Resumo informativo: a data de contagem física mais recente entre os produtos considerados
     * (MAX por item). NUNCA a fonte de verdade — cada produto no `payload` carrega sua própria
     * data real, que pode divergir deste resumo. Nullable só por robustez (nunca deve ocorrer na
     * prática, já que todo item tem pelo menos uma contagem inicial).
     */
    lastPhysicalCountAt: date("last_physical_count_at"),
    /**
     * Metodologia predominante deste fechamento: "PHYSICAL_CONFIRMED" só quando TODOS os produtos
     * do payload têm posição confirmada por contagem física na própria data de corte;
     * "SYSTEM_THEORETICAL" em qualquer outro caso (a normalidade, hoje) — nunca inferida a partir
     * de um resumo, sempre derivada da granularidade real por produto.
     */
    methodology: text("methodology").notNull(),
    /** Texto legível explicando a metodologia/ressalva deste fechamento — nunca escondido em comentário de código, sempre visível a quem consulta o snapshot. */
    caveat: text("caveat").notNull(),
    /** Posição completa, produto a produto — ver `InventorySnapshotPayload` em inventorySnapshot.ts. Nunca duplicado em outra tabela. */
    payload: jsonb("payload").notNull(),
    /** sha256 do payload canonicalizado — prova que o JSON lido agora é bit-a-bit o que foi fechado. */
    payloadHash: text("payload_hash").notNull(),
    hashAlgorithm: text("hash_algorithm").notNull().default("sha256"),
    totalProducts: integer("total_products").notNull(),
    productsWithCost: integer("products_with_cost").notNull(),
    /** true quando `productsWithCost < totalProducts` — qualquer valor monetário do payload é necessariamente parcial. Redundante com o payload só por conveniência de query. */
    isPartialValue: boolean("is_partial_value").notNull(),
    /** Preenchido quando esta versão deixa de ser oficial — nunca quando é criada, nunca apaga/edita `payload`. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededByVersionId: uuid("superseded_by_version_id").references((): AnyPgColumn => inventorySnapshots.id),
    createdBy: text("created_by").notNull(),
    notes: notes(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_snapshots_competence_version_idx").on(table.competenceMonth, table.version),
    uniqueIndex("inventory_snapshots_official_per_competence_idx").on(table.competenceMonth).where(sql`${table.isOfficial} = true`),
  ],
);
