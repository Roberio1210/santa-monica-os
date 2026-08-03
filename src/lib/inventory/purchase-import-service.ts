import "server-only";
import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryAuditEvents, inventoryItems, inventoryMovements, purchaseImportLines, purchaseImports } from "@/db/schema";
import { applyMovementDelta } from "@/lib/inventory/movement-math";
import { parseCsv, parseJson, parsePurchaseImportRow } from "@/lib/inventory/purchase-import-format";
import { buildPurchaseImportPreview, type PurchaseImportLinePreview } from "@/lib/inventory/purchase-import-preview";
import { convertPackageToBaseUnit } from "@/lib/inventory/unit-conversion";
import { STOCK_CONSUMABLE_CLASSIFICATIONS, type InventoryCategory, type ItemClassification, type PurchaseLineDecision } from "@/lib/inventory/types";

/**
 * Importação de Compras Históricas (Missão 23, seções 7–9) — orquestrador de I/O sobre as
 * funções puras de `purchase-import-format.ts` e `purchase-import-preview.ts`. Nunca escreve
 * estoque direto: toda linha nasce "pendente" na Etapa 1 (prévia) e só vira movimentação real na
 * Etapa 2, depois de uma decisão explícita e individual do usuário para cada linha. Linhas
 * marcadas como duplicata na prévia nunca recebem `dedupeKey` real (ficam com `null`), então a
 * constraint UNIQUE do banco nunca é violada por uma duplicata já identificada aqui — só protege
 * contra a corrida rara entre duas importações concorrentes com a mesma nota.
 */

export interface CreatePurchaseImportInput {
  fileFormat: "csv" | "json";
  filename: string | null;
  content: string;
  importedBy: string;
}

export interface CreatePurchaseImportResult {
  importId: string;
  lines: PurchaseImportLinePreview[];
  summary: { totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; foundProducts: number; possibleProducts: number; notFoundProducts: number };
}

/**
 * Etapa 1 — Prévia. Faz o parsing, calcula tudo (validação, match, deduplicação, conversão,
 * impacto de custo) e grava as linhas já com esse retrato — mas nada disso mexe em
 * `inventory_items`/`inventory_movements`. `dedupeKey` só é persistido nas linhas que NÃO são
 * duplicatas (as duplicatas ficam com `dedupeKey: null`, então a constraint UNIQUE do banco nunca
 * é violada por uma duplicata já identificada aqui).
 */
export async function createPurchaseImportPreview(input: CreatePurchaseImportInput): Promise<CreatePurchaseImportResult> {
  if (!input.importedBy.trim()) throw new Error("Responsável pela importação é obrigatório.");
  if (!input.content.trim()) throw new Error("Arquivo vazio.");

  const rawRows = input.fileFormat === "csv" ? parseCsv(input.content) : parseJsonOrThrow(input.content);
  if (rawRows.length === 0) throw new Error("Nenhuma linha encontrada no arquivo.");

  const parsedRows = rawRows.map((raw, index) => parsePurchaseImportRow(index, raw));

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const items = await db.select().from(inventoryItems);
  const existingKeyRows = await db.select({ dedupeKey: purchaseImportLines.dedupeKey }).from(purchaseImportLines).where(isNotNull(purchaseImportLines.dedupeKey));
  const existingDedupeKeys = new Set(existingKeyRows.map((r) => r.dedupeKey).filter((k): k is string => k !== null));

  const { lines, summary } = buildPurchaseImportPreview({
    rows: parsedRows,
    items: items.map(toDomainItemShape),
    existingDedupeKeys,
  });

  const importId = await db.transaction(async (tx) => {
    const [importRow] = await tx
      .insert(purchaseImports)
      .values({
        fileFormat: input.fileFormat,
        filename: input.filename,
        importedBy: input.importedBy.trim(),
        status: "previa",
        rowCount: summary.totalRows,
        validRowCount: summary.validRows,
        invalidRowCount: summary.invalidRows,
      })
      .returning();

    for (const line of lines) {
      await tx.insert(purchaseImportLines).values({
        importId: importRow.id,
        externalId: line.fields.externalId,
        rowIndex: line.rowIndex,
        rawData: line.fields as unknown as Record<string, unknown>,
        valid: line.valid,
        validationErrors: line.errors.length > 0 ? line.errors : null,
        date: line.fields.date,
        invoiceNumber: line.fields.invoiceNumber,
        supplierName: line.fields.supplierName,
        supplierCnpj: line.fields.supplierCnpj,
        nfeKey: line.fields.nfeKey,
        productDescription: line.fields.productDescription,
        brand: line.fields.brand,
        packageCount: line.fields.packageCount !== null ? String(line.fields.packageCount) : null,
        packageQuantity: line.fields.packageQuantity !== null ? String(line.fields.packageQuantity) : null,
        packageUnit: line.fields.packageUnit,
        totalConvertedQuantity: line.conversion !== null ? String(line.conversion.totalQuantity) : null,
        baseUnit: line.conversion?.baseUnit ?? null,
        unitPricePerPackage: line.fields.unitPricePerPackage !== null ? String(line.fields.unitPricePerPackage) : null,
        totalItemValue: line.fields.totalItemValue !== null ? String(line.fields.totalItemValue) : null,
        freightAllocated: line.fields.freightAllocated !== null ? String(line.fields.freightAllocated) : null,
        discountAllocated: line.fields.discountAllocated !== null ? String(line.fields.discountAllocated) : null,
        observation: line.fields.observation,
        dedupeKey: line.isDuplicate ? null : line.dedupeKey,
        matchedItemId: line.matchStatus === "encontrado" ? line.matchedItemId : null,
        matchStatus: line.matchStatus,
        matchCandidates: line.matchCandidates.length > 0 ? line.matchCandidates : null,
        status: !line.valid ? "pendente" : line.isDuplicate ? "duplicado" : "pendente",
      });
    }

    return importRow.id;
  });

  return { importId, lines, summary };
}

function parseJsonOrThrow(content: string): Record<string, string>[] {
  const result = parseJson(content);
  if ("error" in result) throw new Error(result.error);
  return result.rows;
}

/** Repositório retorna linhas com `numeric` como string — mesmo shape que o resto do módulo já usa via `postgres-repository.ts`. */
function toDomainItemShape(row: typeof inventoryItems.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    originalName: row.originalName,
    brand: row.brand,
    category: row.category,
    currentQuantity: Number(row.currentQuantity),
    unit: row.unit,
    packageCapacity: row.packageCapacity !== null ? Number(row.packageCapacity) : null,
    packageCount: row.packageCount,
    condition: row.condition,
    minimumStock: row.minimumStock !== null ? Number(row.minimumStock) : null,
    idealStock: row.idealStock !== null ? Number(row.idealStock) : null,
    supplier: row.supplier,
    location: row.location,
    classification: row.classification,
    canonicalItemId: row.canonicalItemId,
    consolidatedAt: row.consolidatedAt !== null ? row.consolidatedAt.toISOString() : null,
    notes: row.notes,
    lastCountDate: row.lastCountDate,
    unitCost: row.unitCost !== null ? Number(row.unitCost) : null,
    quantityStatus: row.quantityStatus,
  } as Parameters<typeof buildPurchaseImportPreview>[0]["items"][number];
}

export interface FetchPurchaseImportResult {
  importId: string;
  fileFormat: string;
  filename: string | null;
  importedBy: string;
  status: string;
  lines: (typeof purchaseImportLines.$inferSelect)[];
}

export async function fetchPurchaseImportPreview(importId: string): Promise<FetchPurchaseImportResult> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const [importRow] = await db.select().from(purchaseImports).where(eq(purchaseImports.id, importId)).limit(1);
  if (!importRow) throw new Error("Importação não encontrada.");

  const lines = await db.select().from(purchaseImportLines).where(eq(purchaseImportLines.importId, importId));

  return { importId: importRow.id, fileFormat: importRow.fileFormat, filename: importRow.filename, importedBy: importRow.importedBy, status: importRow.status, lines };
}

export async function listPurchaseImports(): Promise<(typeof purchaseImports.$inferSelect)[]> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  return db.select().from(purchaseImports);
}

export interface ConfirmPurchaseLineInput {
  lineId: string;
  decision: PurchaseLineDecision;
  performedBy: string;
  /** Obrigatório quando `decision === "vincular_existente"`. */
  linkItemId?: string;
  /** Obrigatórios quando `decision === "criar_produto"`. */
  newProduct?: { category: InventoryCategory; brand: string; classification: ItemClassification };
}

export interface ConfirmPurchaseLineResult {
  lineId: string;
  status: string;
  itemId: string | null;
  movementId: string | null;
  alreadyProcessed: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Etapa 2 — Confirmação. Uma linha por vez, sempre transacional. Nunca cria movimentação de
 * estoque para patrimônio/manutenção/ignorada (seção 9 — nunca misturar patrimônio com consumo
 * químico). Idempotente: uma linha já processada (`status !== "pendente"`) apenas retorna o
 * resultado anterior, nunca reprocessa.
 */
export async function confirmPurchaseImportLine(input: ConfirmPurchaseLineInput): Promise<ConfirmPurchaseLineResult> {
  if (!input.performedBy.trim()) throw new Error("Responsável é obrigatório.");
  if (input.decision === "vincular_existente" && !input.linkItemId) throw new Error("Selecione o produto existente para vincular esta linha.");
  if (input.decision === "criar_produto") {
    if (!input.newProduct) throw new Error("Informe categoria, marca e classificação para criar um novo produto.");
    if (!STOCK_CONSUMABLE_CLASSIFICATIONS.includes(input.newProduct.classification)) {
      throw new Error("Só é possível criar produto de estoque para classificações de consumo (químico, sólido ou consumível). Use 'patrimônio' ou 'despesa/manutenção' para os demais casos.");
    }
  }

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const today = new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(purchaseImportLines).where(eq(purchaseImportLines.id, input.lineId)).for("update").limit(1);
    if (!line) throw new Error("Linha de importação não encontrada.");

    if (line.status !== "pendente") {
      return { lineId: line.id, status: line.status, itemId: line.matchedItemId, movementId: line.resultingMovementId, alreadyProcessed: true };
    }
    if (!line.valid) throw new Error("Esta linha é inválida e não pode ser confirmada — corrija o arquivo e reimporte.");

    if (input.decision === "revisar_depois") {
      return { lineId: line.id, status: line.status, itemId: null, movementId: null, alreadyProcessed: false };
    }

    if (input.decision === "ignorar") {
      await tx.update(purchaseImportLines).set({ status: "ignorado", decision: "ignorar", updatedAt: new Date() }).where(eq(purchaseImportLines.id, line.id));
      return { lineId: line.id, status: "ignorado", itemId: null, movementId: null, alreadyProcessed: false };
    }

    if (input.decision === "patrimonio" || input.decision === "despesa_manutencao") {
      const classification: ItemClassification = input.decision === "patrimonio" ? "patrimonio" : "manutencao";
      await tx
        .update(purchaseImportLines)
        .set({ status: "confirmado", decision: input.decision, classification, updatedAt: new Date() })
        .where(eq(purchaseImportLines.id, line.id));
      return { lineId: line.id, status: "confirmado", itemId: null, movementId: null, alreadyProcessed: false };
    }

    if (line.packageUnit === null || line.packageQuantity === null || line.packageCount === null) {
      throw new Error("Linha sem embalagem/quantidade válida — não é possível calcular a conversão para gerar entrada de estoque.");
    }
    const conversion = convertPackageToBaseUnit(line.packageUnit, Number(line.packageQuantity), Number(line.packageCount));
    if (!conversion) throw new Error(`Unidade de embalagem "${line.packageUnit}" não reconhecida — não é possível converter para a unidade-base.`);

    const pricePerBaseUnit = line.unitPricePerPackage !== null && Number(line.packageQuantity) > 0 ? round2(Number(line.unitPricePerPackage) / Number(line.packageQuantity)) : null;

    let targetItemId: string;

    if (input.decision === "vincular_existente") {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.linkItemId!)).for("update").limit(1);
      if (!item) throw new Error("Produto selecionado não encontrado.");
      if (item.canonicalItemId !== null) throw new Error("Este produto já foi incorporado a outro (consolidado) — vincule ao produto mestre.");
      if (item.unit !== conversion.baseUnit) {
        throw new Error(`Unidade da linha (${conversion.baseUnit}) não bate com a unidade do produto selecionado (${item.unit}).`);
      }
      targetItemId = item.id;
    } else {
      const [newItem] = await tx
        .insert(inventoryItems)
        .values({
          name: line.productDescription ?? "Produto sem descrição",
          brand: input.newProduct!.brand,
          category: input.newProduct!.category,
          currentQuantity: "0",
          unit: conversion.baseUnit,
          condition: "lacrado",
          classification: input.newProduct!.classification,
          supplier: line.supplierName,
          lastCountDate: today,
          quantityStatus: "confirmed",
        })
        .returning();
      targetItemId = newItem.id;
    }

    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, targetItemId)).for("update").limit(1);
    if (!item) throw new Error("Produto não encontrado após a criação/seleção.");

    const previousBalance = Number(item.currentQuantity);
    const newBalance = applyMovementDelta(previousBalance, "compra", conversion.totalQuantity);
    const previousUnitCost = item.unitCost !== null ? Number(item.unitCost) : null;

    let newUnitCost = previousUnitCost;
    if (pricePerBaseUnit !== null) {
      const totalCostValue = (previousUnitCost !== null ? previousBalance * previousUnitCost : 0) + conversion.totalQuantity * pricePerBaseUnit;
      const totalCostWeight = (previousUnitCost !== null ? previousBalance : 0) + conversion.totalQuantity;
      newUnitCost = totalCostWeight > 0 ? round2(totalCostValue / totalCostWeight) : pricePerBaseUnit;
    }

    await tx
      .update(inventoryItems)
      .set({
        currentQuantity: String(newBalance),
        unitCost: newUnitCost !== null ? String(newUnitCost) : null,
        supplier: line.supplierName ?? item.supplier,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, targetItemId));

    const [movement] = await tx
      .insert(inventoryMovements)
      .values({
        itemId: targetItemId,
        type: "compra",
        quantity: String(conversion.totalQuantity),
        unit: conversion.baseUnit,
        date: line.date ?? today,
        responsible: input.performedBy.trim(),
        reference: line.invoiceNumber,
        supplier: line.supplierName,
        unitPricePaid: pricePerBaseUnit !== null ? String(pricePerBaseUnit) : null,
        previousBalance: String(previousBalance),
        newBalance: String(newBalance),
        source: "auditoria",
        notes: `Importação de compra histórica${line.nfeKey ? ` — NF-e ${line.nfeKey}` : ""}.`,
      })
      .returning();

    await tx
      .update(purchaseImportLines)
      .set({
        status: "confirmado",
        decision: input.decision,
        matchedItemId: targetItemId,
        resultingMovementId: movement.id,
        classification: input.decision === "criar_produto" ? input.newProduct!.classification : line.classification,
        updatedAt: new Date(),
      })
      .where(eq(purchaseImportLines.id, line.id));

    await tx.insert(inventoryAuditEvents).values({
      entityType: "inventory_item",
      entityId: targetItemId,
      action: "compra_importada",
      beforeState: { currentQuantity: previousBalance, unitCost: previousUnitCost },
      afterState: { currentQuantity: newBalance, unitCost: newUnitCost },
      reason: `Confirmação de importação de compra (linha ${line.rowIndex}, decisão: ${input.decision}).`,
      actor: input.performedBy.trim(),
      source: "auditoria_importacao_compras",
    });

    return { lineId: line.id, status: "confirmado", itemId: targetItemId, movementId: movement.id, alreadyProcessed: false };
  });
}
