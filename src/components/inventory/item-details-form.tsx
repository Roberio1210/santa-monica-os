"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { updateItemDetailsAction, type FormActionState } from "@/app/estoque/actions";
import type { InventoryItem } from "@/lib/inventory/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialFormState: FormActionState = { error: null, success: null };

export function ItemDetailsForm({ item }: { item: InventoryItem }) {
  const [formState, formAction, isPending] = useActionState(updateItemDetailsAction, initialFormState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Editar fornecedor, localização e estoque
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editar dados do produto</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="itemId" value={item.id} />
          <div>
            <label className={labelClasses} htmlFor="idf-supplier">
              Fornecedor
            </label>
            <input id="idf-supplier" name="supplier" type="text" defaultValue={item.supplier ?? ""} placeholder="Ex.: Vonixx Distribuidora" className={cn(fieldClasses, "w-full")} />
          </div>
          <div>
            <label className={labelClasses} htmlFor="idf-location">
              Localização
            </label>
            <input id="idf-location" name="location" type="text" defaultValue={item.location ?? ""} placeholder="Ex.: Prateleira A" className={cn(fieldClasses, "w-full")} />
          </div>
          <div>
            <label className={labelClasses} htmlFor="idf-min">
              Estoque mínimo ({item.unit})
            </label>
            <input id="idf-min" name="minimumStock" type="text" inputMode="decimal" defaultValue={item.minimumStock ?? ""} className={cn(fieldClasses, "w-full")} />
          </div>
          <div>
            <label className={labelClasses} htmlFor="idf-ideal">
              Estoque ideal ({item.unit})
            </label>
            <input id="idf-ideal" name="idealStock" type="text" inputMode="decimal" defaultValue={item.idealStock ?? ""} className={cn(fieldClasses, "w-full")} />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {formState.error ? <p className="text-sm text-critical">{formState.error}</p> : null}
            {formState.success ? <p className="text-sm text-positive">{formState.success}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
