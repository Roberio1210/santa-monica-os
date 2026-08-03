"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startConsolidationAction, type ConsolidationFormState } from "@/app/estoque/auditoria/actions";
import { inventoryCategories, type InventoryItem } from "@/lib/inventory/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: ConsolidationFormState = { error: null, success: null, resultMasterId: null };

export function ConsolidationWizard({ items, initialMasterId, initialMergedIds }: { items: InventoryItem[]; initialMasterId: string | null; initialMergedIds: string[] }) {
  const [state, formAction, isPending] = useActionState(startConsolidationAction, initialState);
  const [masterItemId, setMasterItemId] = useState(initialMasterId ?? "");
  const [mergedItemIds, setMergedItemIds] = useState<Set<string>>(new Set(initialMergedIds));

  const masterItem = items.find((i) => i.id === masterItemId) ?? null;
  const candidateItems = useMemo(() => items.filter((i) => i.id !== masterItemId && (masterItem === null || i.unit === masterItem.unit)), [items, masterItemId, masterItem]);
  const selectedMerged = items.filter((i) => mergedItemIds.has(i.id));
  const previousBalanceTotal = (masterItem?.currentQuantity ?? 0) + selectedMerged.reduce((sum, i) => sum + i.currentQuantity, 0);

  function toggleMerged(id: string) {
    setMergedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escolher produto mestre e cadastros a incorporar</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="unitBase" value={masterItem?.unit ?? ""} />
          {Array.from(mergedItemIds).map((id) => (
            <input key={id} type="hidden" name="mergedItemIds" value={id} />
          ))}

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Produto mestre (o que vai continuar existindo)</label>
            <select name="masterItemId" required value={masterItemId} onChange={(e) => setMasterItemId(e.target.value)} className={`${fieldClasses} w-full`}>
              <option value="">Selecione o produto mestre</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.brand}) — {item.currentQuantity} {item.unit}
                </option>
              ))}
            </select>
          </div>

          {masterItem ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-muted">Cadastros a incorporar (mesma unidade-base: {masterItem.unit})</label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-2">
                {candidateItems.length === 0 ? (
                  <p className="p-2 text-sm text-foreground-subtle">Nenhum outro produto com a mesma unidade-base.</p>
                ) : (
                  candidateItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-background-elevated">
                      <input type="checkbox" checked={mergedItemIds.has(item.id)} onChange={() => toggleMerged(item.id)} />
                      <span className="text-foreground-muted">
                        {item.name} ({item.brand}) — {item.currentQuantity} {item.unit}, custo {item.unitCost !== null ? `R$ ${item.unitCost.toFixed(2)}` : "não cadastrado"}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {selectedMerged.length > 0 && masterItem ? (
            <div className="rounded-lg border border-border-subtle bg-background-elevated p-3 text-xs text-foreground-muted">
              <p className="font-medium text-foreground-subtle">Prévia antes de confirmar</p>
              <p>
                Saldo do mestre: {masterItem.currentQuantity} {masterItem.unit}
              </p>
              {selectedMerged.map((item) => (
                <p key={item.id}>
                  + {item.currentQuantity} {item.unit} de &quot;{item.name}&quot;
                </p>
              ))}
              <p className="mt-1 font-medium text-foreground">
                Saldo resultante: {previousBalanceTotal} {masterItem.unit}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="performedBy" type="text" required placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
            <input name="reason" type="text" placeholder="Motivo da consolidação (opcional)" className={fieldClasses} aria-label="Motivo" />
          </div>

          <details className="rounded-lg border border-border-subtle p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground-muted">Ajustar dados do produto mestre (opcional)</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="overrideName" type="text" placeholder="Nome oficial (opcional)" className={fieldClasses} />
              <input name="overrideBrand" type="text" placeholder="Marca oficial (opcional)" className={fieldClasses} />
              <select name="overrideCategory" defaultValue="" className={fieldClasses}>
                <option value="">Categoria (manter atual)</option>
                {inventoryCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input name="overrideSupplier" type="text" placeholder="Fornecedor preferido (opcional)" className={fieldClasses} />
              <input name="overrideLocation" type="text" placeholder="Localização (opcional)" className={fieldClasses} />
              <input name="overrideMinimumStock" type="text" inputMode="decimal" placeholder="Estoque mínimo (opcional)" className={fieldClasses} />
              <input name="overrideIdealStock" type="text" inputMode="decimal" placeholder="Estoque ideal (opcional)" className={fieldClasses} />
            </div>
          </details>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending || !masterItemId || mergedItemIds.size === 0}>
              {isPending ? "Consolidando..." : "Confirmar consolidação"}
            </Button>
            {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
            {state.success ? (
              <p className="text-sm text-positive">
                {state.success} <Link href="/estoque/auditoria" className="underline">Voltar à auditoria</Link>
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
