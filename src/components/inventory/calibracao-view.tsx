"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { calculateConcentrateConsumed } from "@/lib/recipes/dilution";
import { processSteps, vehicleCategories } from "@/lib/recipes/types";
import type { ProcessStep, Recipe, VehicleCategory } from "@/lib/recipes/types";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { ServiceCatalogEntry } from "@/lib/inventory/services-catalog";
import { calibrarAction, initialCalibracaoState } from "@/app/estoque/calibracao/actions";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

function toNumber(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

interface CalibracaoViewProps {
  services: ServiceCatalogEntry[];
  items: InventoryItemView[];
  recipes: Recipe[];
}

export function CalibracaoView({ services, items, recipes }: CalibracaoViewProps) {
  const [state, formAction, isPending] = useActionState(calibrarAction, initialCalibracaoState);

  const [serviceId, setServiceId] = useState("");
  const [itemId, setItemId] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory | "">("");
  const [processStep, setProcessStep] = useState<ProcessStep | "">("");

  const [quantityBefore, setQuantityBefore] = useState("");
  const [quantityAfter, setQuantityAfter] = useState("");
  const [preparedQuantity, setPreparedQuantity] = useState("");
  const [dilutionRatio, setDilutionRatio] = useState("");
  const [leftoverReused, setLeftoverReused] = useState("");
  const [discarded, setDiscarded] = useState("");

  const selectedItem = items.find((i) => i.id === itemId);
  const selectedService = services.find((s) => s.id === serviceId);

  const existingRecipe = recipes.find((r) => r.serviceId === serviceId && r.vehicleCategory === vehicleCategory && r.processStep === processStep && r.itemId === itemId);

  const preview = useMemo(() => {
    const before = toNumber(quantityBefore);
    const after = toNumber(quantityAfter);
    if (before === null || after === null) return null;
    return calculateConcentrateConsumed({
      quantityBefore: before,
      quantityAfter: after,
      preparedQuantity: toNumber(preparedQuantity),
      dilutionRatio: toNumber(dilutionRatio),
      leftoverReused: toNumber(leftoverReused),
      discarded: toNumber(discarded),
    });
  }, [quantityBefore, quantityAfter, preparedQuantity, dilutionRatio, leftoverReused, discarded]);

  const canSubmit = Boolean(serviceId && itemId && vehicleCategory && processStep && quantityBefore && quantityAfter);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Selecionar combinação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={fieldClasses} aria-label="Serviço">
              <option value="">Selecione o serviço</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={fieldClasses} aria-label="Produto">
              <option value="">Selecione o produto</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.brand})
                </option>
              ))}
            </select>
            <select value={vehicleCategory} onChange={(e) => setVehicleCategory(e.target.value as VehicleCategory)} className={fieldClasses} aria-label="Categoria de veículo">
              <option value="">Selecione a categoria de veículo</option>
              {vehicleCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={processStep} onChange={(e) => setProcessStep(e.target.value as ProcessStep)} className={fieldClasses} aria-label="Etapa">
              <option value="">Selecione a etapa</option>
              {processSteps.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>2. Medição</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="vehicleCategory" value={vehicleCategory} />
              <input type="hidden" name="processStep" value={processStep} />

              <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} aria-label="Data" />
              <input
                name="quantityBefore"
                type="text"
                inputMode="decimal"
                required
                value={quantityBefore}
                onChange={(e) => setQuantityBefore(e.target.value)}
                placeholder={`Quantidade antes${selectedItem ? ` (${selectedItem.unit})` : ""}`}
                className={fieldClasses}
                aria-label="Quantidade antes"
              />
              <input
                name="quantityAfter"
                type="text"
                inputMode="decimal"
                required
                value={quantityAfter}
                onChange={(e) => setQuantityAfter(e.target.value)}
                placeholder={`Quantidade depois${selectedItem ? ` (${selectedItem.unit})` : ""}`}
                className={fieldClasses}
                aria-label="Quantidade depois"
              />
              <input
                name="preparedQuantity"
                type="text"
                inputMode="decimal"
                value={preparedQuantity}
                onChange={(e) => setPreparedQuantity(e.target.value)}
                placeholder="Quantidade preparada (opcional)"
                className={fieldClasses}
                aria-label="Quantidade preparada"
              />
              <input
                name="dilutionRatio"
                type="text"
                inputMode="decimal"
                value={dilutionRatio}
                onChange={(e) => setDilutionRatio(e.target.value)}
                placeholder="Diluição (partes de água — vazio = puro)"
                className={fieldClasses}
                aria-label="Diluição"
              />
              <input
                name="leftoverReused"
                type="text"
                inputMode="decimal"
                value={leftoverReused}
                onChange={(e) => setLeftoverReused(e.target.value)}
                placeholder="Sobra reaproveitada (opcional)"
                className={fieldClasses}
                aria-label="Sobra reaproveitada"
              />
              <input
                name="discarded"
                type="text"
                inputMode="decimal"
                value={discarded}
                onChange={(e) => setDiscarded(e.target.value)}
                placeholder="Descarte (opcional)"
                className={fieldClasses}
                aria-label="Descarte"
              />
              <input name="responsibleName" type="text" placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
              <input name="serviceOrderExternalId" type="text" placeholder="Ordem JumpPark (opcional)" className={fieldClasses} aria-label="Ordem JumpPark" />
              <textarea name="notes" placeholder="Observações" className={cn(fieldClasses, "h-9 sm:col-span-3")} aria-label="Observações" />

              <div className="flex items-center gap-2 sm:col-span-3">
                <Button type="submit" disabled={isPending || !canSubmit}>
                  {isPending ? "Salvando..." : "Salvar amostra"}
                </Button>
                {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cálculo em tempo real</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Solução preparada" value={preparedQuantity ? `${preparedQuantity} ${selectedItem?.unit ?? ""}` : "Não informada"} />
            <Row label="Sobra reaproveitada" value={leftoverReused ? `${leftoverReused} ${selectedItem?.unit ?? ""}` : "Nenhuma"} />
            <Row label="Descarte" value={discarded ? `${discarded} ${selectedItem?.unit ?? ""}` : "Nenhum"} />
            <Row label="Concentrado consumido (válido)" value={preview !== null ? `${preview} ${selectedItem?.unit ?? ""}` : "Informe antes/depois"} strong />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo antes de salvar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Produto" value={selectedItem?.name ?? "—"} />
            <Row label="Serviço" value={selectedService?.name ?? "—"} />
            <Row label="Veículo" value={vehicleCategory || "—"} />
            <Row label="Etapa" value={processStep || "—"} />
            <Row label="Receita" value={existingRecipe ? `Existente (v${existingRecipe.version}, ${existingRecipe.status})` : "Nova (criada em rascunho)"} />
            <Row label="Amostras após salvar" value={`${(existingRecipe?.sampleCount ?? 0) + 1}`} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-foreground-subtle">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground-muted"}>{value}</span>
    </div>
  );
}
