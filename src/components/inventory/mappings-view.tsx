"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { confirmSuggestionAction, markSuggestionPendingAction, rejectSuggestionAction, replaceSuggestionItemAction } from "@/app/estoque/mapeamentos/actions";
import type { ProductStepSuggestion } from "@/lib/inventory/suggestions";
import type { InventoryItemView } from "@/lib/inventory/types";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

function ReplaceForm({ suggestionId, items }: { suggestionId: string; items: InventoryItemView[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Substituir produto
      </Button>
    );
  }

  return (
    <form action={replaceSuggestionItemAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={suggestionId} />
      <select name="newItemId" required className={fieldClasses} aria-label="Novo produto">
        <option value="">Selecione o novo produto</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.brand})
          </option>
        ))}
      </select>
      <Button type="submit" size="sm">
        Confirmar substituição
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}

function statusBadge(suggestion: ProductStepSuggestion) {
  if (!suggestion.active) return <Badge variant="critical">Rejeitado</Badge>;
  if (suggestion.confirmed) return <Badge variant="positive">Confirmado</Badge>;
  return <Badge variant="warning">Pendente</Badge>;
}

export function MappingsView({ suggestions, items }: { suggestions: ProductStepSuggestion[]; items: InventoryItemView[] }) {
  const grouped = suggestions.reduce<Record<string, ProductStepSuggestion[]>>((acc, s) => {
    (acc[s.processStep] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([step, items_]) => (
        <Card key={step}>
          <CardHeader>
            <CardTitle className="capitalize">{step.replace(/_/g, " ")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {items_.map((s) => (
              <div key={s.id} className={cn("rounded-lg border p-3 text-sm", s.active ? "border-border-subtle" : "border-critical/30 bg-critical-bg/20 opacity-70")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-foreground">{s.itemName}</span>
                    <span className="ml-2 text-xs text-foreground-subtle">{s.itemBrand}</span>
                  </div>
                  {statusBadge(s)}
                </div>
                {s.notes ? <p className="mt-1 text-xs text-foreground-muted">{s.notes}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <form action={confirmSuggestionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <Button type="submit" size="sm" disabled={s.confirmed && s.active}>
                      Confirmar
                    </Button>
                  </form>
                  <form action={rejectSuggestionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <Button type="submit" variant="outline" size="sm" disabled={!s.active}>
                      Rejeitar
                    </Button>
                  </form>
                  {!s.active ? (
                    <form action={markSuggestionPendingAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Reabrir como pendente
                      </Button>
                    </form>
                  ) : null}
                  <ReplaceForm suggestionId={s.id} items={items} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
