"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { recordManualExitAction, type FormActionState } from "@/app/estoque/actions";
import { EXIT_REASON_LABELS, EXIT_REASONS } from "@/lib/inventory/manual-exit-reasons";
import type { InventoryItemView } from "@/lib/inventory/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialFormState: FormActionState = { error: null, success: null };

export function ExitForm({ items }: { items: InventoryItemView[] }) {
  const [formState, formAction, isPending] = useActionState(recordManualExitAction, initialFormState);
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = items.find((i) => i.id === selectedItemId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar baixa</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select name="itemId" required value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className={fieldClasses} aria-label="Produto">
            <option value="">Selecione o produto</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.brand})
              </option>
            ))}
          </select>

          <select name="reason" required className={fieldClasses} aria-label="Motivo">
            <option value="">Selecione o motivo</option>
            {EXIT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {EXIT_REASON_LABELS[reason]}
              </option>
            ))}
          </select>

          <input name="quantity" type="text" inputMode="decimal" required placeholder="Quantidade" className={fieldClasses} aria-label="Quantidade" />
          <input type="hidden" name="unit" value={selectedItem?.unit ?? ""} />
          <input disabled value={selectedItem ? `Unidade: ${selectedItem.unit}` : "Selecione um produto"} className={cn(fieldClasses, "text-foreground-subtle")} aria-label="Unidade (definida pelo produto selecionado)" />

          <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} aria-label="Data" />
          <input name="responsible" type="text" required placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
          <input name="notes" type="text" placeholder="Observação (opcional)" className={cn(fieldClasses, "sm:col-span-2 lg:col-span-3")} aria-label="Observação" />

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando..." : "Registrar baixa"}
            </Button>
            {formState.error ? <p className="text-sm text-critical">{formState.error}</p> : null}
            {formState.success ? <p className="text-sm text-positive">{formState.success}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
