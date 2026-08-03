"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmImportLineAction, type ConfirmLineState } from "@/app/estoque/auditoria/actions";
import { inventoryCategories, itemClassificationLabels, purchaseLineDecisionLabels, purchaseLineDecisions, STOCK_CONSUMABLE_CLASSIFICATIONS, type InventoryItem, type PurchaseLineDecision } from "@/lib/inventory/types";
import type { purchaseImportLines } from "@/db/schema";

type ImportLine = typeof purchaseImportLines.$inferSelect;

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: ConfirmLineState = { error: null, success: null };

const matchStatusVariant = { encontrado: "positive", possivel: "warning", nao_encontrado: "outline" } as const;
const matchStatusLabel = { encontrado: "Produto encontrado", possivel: "Produto possivelmente encontrado", nao_encontrado: "Produto não encontrado" } as const;

export function ImportLineRow({ line, importId, items }: { line: ImportLine; importId: string; items: InventoryItem[] }) {
  const [state, formAction, isPending] = useActionState(confirmImportLineAction, initialState);
  const [decision, setDecision] = useState<PurchaseLineDecision>(line.matchStatus === "encontrado" ? "vincular_existente" : "revisar_depois");

  const matchCandidates = (line.matchCandidates as { itemId: string; itemName: string; score: number }[] | null) ?? [];

  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{line.productDescription ?? "Produto sem descrição"}</p>
          <p className="text-xs text-foreground-subtle">
            {line.date} · {line.brand ?? "sem marca"} · {line.packageCount}x {line.packageQuantity}{line.packageUnit} · {line.supplierName ?? "fornecedor não informado"}
            {line.totalConvertedQuantity ? ` · total convertido: ${line.totalConvertedQuantity} ${line.baseUnit ?? ""}` : ""}
          </p>
        </div>
        {line.matchStatus ? <Badge variant={matchStatusVariant[line.matchStatus]}>{matchStatusLabel[line.matchStatus]}</Badge> : null}
      </div>

      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="lineId" value={line.id} />
        <input type="hidden" name="importId" value={importId} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select name="decision" value={decision} onChange={(e) => setDecision(e.target.value as PurchaseLineDecision)} className={fieldClasses}>
            {purchaseLineDecisions.map((d) => (
              <option key={d} value={d}>
                {purchaseLineDecisionLabels[d]}
              </option>
            ))}
          </select>
          <input name="performedBy" type="text" required placeholder="Responsável" className={fieldClasses} />
        </div>

        {decision === "vincular_existente" ? (
          <select name="linkItemId" required defaultValue={line.matchedItemId ?? matchCandidates[0]?.itemId ?? ""} className={`${fieldClasses} w-full`}>
            <option value="">Selecione o produto</option>
            {matchCandidates.map((c) => (
              <option key={c.itemId} value={c.itemId}>
                {c.itemName} ({c.score}% de semelhança)
              </option>
            ))}
            {items
              .filter((i) => !matchCandidates.some((c) => c.itemId === i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.brand})
                </option>
              ))}
          </select>
        ) : null}

        {decision === "criar_produto" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select name="newProductCategory" required defaultValue="" className={fieldClasses}>
              <option value="">Categoria</option>
              {inventoryCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input name="newProductBrand" type="text" required defaultValue={line.brand ?? ""} placeholder="Marca" className={fieldClasses} />
            <select name="newProductClassification" required defaultValue="" className={fieldClasses}>
              <option value="">Classificação (consumo)</option>
              {STOCK_CONSUMABLE_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {itemClassificationLabels[c]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Confirmando..." : "Confirmar linha"}
          </Button>
          {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
        </div>
      </form>
    </div>
  );
}
