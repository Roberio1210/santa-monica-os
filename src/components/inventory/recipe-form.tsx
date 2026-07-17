"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { processSteps, vehicleCategories } from "@/lib/recipes/types";
import { createRecipeAction, type FormActionState } from "@/app/estoque/receitas/actions";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { ServiceCatalogEntry } from "@/lib/inventory/services-catalog";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: FormActionState = { error: null, success: null };

export function RecipeForm({ services, items }: { services: ServiceCatalogEntry[]; items: InventoryItemView[] }) {
  const [state, formAction, isPending] = useActionState(createRecipeAction, initialState);

  return (
    <Card>
      <CardContent className="pt-4">
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select name="serviceId" required className={fieldClasses} aria-label="Serviço">
            <option value="">Selecione o serviço</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select name="itemId" required className={fieldClasses} aria-label="Produto">
            <option value="">Selecione o produto</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.brand})
              </option>
            ))}
          </select>

          <select name="vehicleCategory" required className={fieldClasses} aria-label="Categoria de veículo">
            <option value="">Selecione a categoria de veículo</option>
            {vehicleCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select name="processStep" required className={fieldClasses} aria-label="Etapa do processo">
            <option value="">Selecione a etapa</option>
            {processSteps.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input name="dilutionRatio" type="text" inputMode="decimal" placeholder="Diluição (partes de água por parte de produto — vazio = puro)" className={cn(fieldClasses, "sm:col-span-2")} aria-label="Diluição" />
          <textarea name="notes" placeholder="Observações (opcional)" className={cn(fieldClasses, "h-20 sm:col-span-2")} aria-label="Observações" />

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Criando..." : "Criar receita em rascunho"}
            </Button>
            {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
