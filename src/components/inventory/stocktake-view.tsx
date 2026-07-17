"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { inventoryCategories } from "@/lib/inventory/types";
import { confirmStocktakeAction, type StocktakeActionState } from "@/app/estoque/actions";
import type { InventoryCategory, InventoryItemView } from "@/lib/inventory/types";
import type { StocktakeLineInput } from "@/lib/inventory/stocktake";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface LineState {
  physicalQuantity: string;
  notFound: boolean;
  measurementPending: boolean;
  observation: string;
}

const emptyLine: LineState = { physicalQuantity: "", notFound: false, measurementPending: false, observation: "" };

const initialActionState: StocktakeActionState = { error: null, success: null, movementsCreated: 0 };

export function StocktakeView({ items, reference }: { items: InventoryItemView[]; reference: string }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | InventoryCategory>("all");
  const [responsible, setResponsible] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>({});

  const [state, formAction, isPending] = useActionState(confirmStocktakeAction, initialActionState);
  const confirmed = Boolean(state.success);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (query && !`${item.name} ${item.brand}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, search, categoryFilter]);

  const touchedEntries = useMemo(() => Object.entries(lines).filter(([, line]) => line.physicalQuantity !== "" || line.notFound || line.measurementPending), [lines]);

  const divergences = useMemo(
    () =>
      touchedEntries
        .filter(([, line]) => !line.notFound && !line.measurementPending && line.physicalQuantity !== "")
        .map(([itemId, line]) => {
          const item = items.find((i) => i.id === itemId);
          const physical = Number(line.physicalQuantity.replace(",", "."));
          return { item, physical, delta: item ? physical - item.currentQuantity : 0 };
        })
        .filter((d) => d.item && Math.abs(d.delta) >= 0.001),
    [touchedEntries, items],
  );

  function updateLine(itemId: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? emptyLine), ...patch } }));
  }

  const linesPayload: StocktakeLineInput[] = touchedEntries.map(([itemId, line]) => ({
    itemId,
    physicalQuantity: !line.notFound && !line.measurementPending && line.physicalQuantity !== "" ? Number(line.physicalQuantity.replace(",", ".")) : null,
    notFound: line.notFound,
    measurementPending: line.measurementPending,
    observation: line.observation || null,
  }));

  if (confirmed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contagem confirmada</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-positive">{state.success}</p>
          <p className="mt-2 text-xs text-foreground-subtle">
            Referência: {reference} — consulte os ajustes gerados em{" "}
            <a href={`/estoque/movimentacoes?type=correcao_inventario`} className="text-accent hover:underline">
              Movimentações
            </a>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Identificação da contagem</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <span className="text-xs text-foreground-subtle">Referência: {reference || "gerando..."}</span>
          <input
            type="text"
            required
            value={responsible}
            onChange={(e) => setResponsible(e.target.value)}
            placeholder="Responsável pela contagem"
            className={cn(fieldClasses, "min-w-[220px]")}
            aria-label="Responsável pela contagem"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Registrar quantidades físicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto"
              className={cn(fieldClasses, "min-w-[220px] flex-1")}
              aria-label="Buscar produto"
            />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | InventoryCategory)} className={fieldClasses} aria-label="Contar por categoria">
              <option value="all">Todas as categorias</option>
              {inventoryCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 font-medium">Saldo teórico</th>
                  <th className="pb-2 pr-3 font-medium">Quantidade física</th>
                  <th className="pb-2 pr-3 font-medium">Não encontrado</th>
                  <th className="pb-2 pr-3 font-medium">Medição pendente</th>
                  <th className="pb-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const line = lines[item.id] ?? emptyLine;
                  return (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-foreground">{item.name}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {item.currentQuantity} {item.unit}
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={line.notFound || line.measurementPending}
                          value={line.physicalQuantity}
                          onChange={(e) => updateLine(item.id, { physicalQuantity: e.target.value })}
                          placeholder={item.unit}
                          className={cn(fieldClasses, "w-24 disabled:opacity-50")}
                          aria-label={`Quantidade física de ${item.name}`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={line.notFound}
                          onChange={(e) => updateLine(item.id, { notFound: e.target.checked, measurementPending: false })}
                          aria-label={`${item.name} não encontrado`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={line.measurementPending}
                          onChange={(e) => updateLine(item.id, { measurementPending: e.target.checked, notFound: false })}
                          aria-label={`${item.name} com medição pendente`}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="text"
                          value={line.observation}
                          onChange={(e) => updateLine(item.id, { observation: e.target.value })}
                          placeholder="Observação"
                          className={cn(fieldClasses, "w-full")}
                          aria-label={`Observação de ${item.name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Revisar divergências — {divergences.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {touchedEntries.length === 0 ? (
            <EmptyState title="Nenhum item contado ainda." description="Registre a quantidade física de ao menos um produto para revisar." />
          ) : divergences.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhuma divergência entre o saldo teórico e a contagem física registrada até agora.</p>
          ) : (
            <ul className="space-y-2">
              {divergences.map((d) => (
                <li key={d.item!.id} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm">
                  <span className="text-foreground-muted">{d.item!.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-foreground-subtle">
                      {d.item!.currentQuantity} → {d.physical} {d.item!.unit}
                    </span>
                    <Badge variant={d.delta > 0 ? "positive" : "critical"}>
                      {d.delta > 0 ? "+" : ""}
                      {Math.round(d.delta * 1000) / 1000} {d.item!.unit}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <form action={formAction}>
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="responsible" value={responsible} />
        <input type="hidden" name="lines" value={JSON.stringify(linesPayload)} />
        <Card>
          <CardHeader>
            <CardTitle>4. Confirmar contagem</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 pt-0">
            <Button type="submit" disabled={isPending || !reference || !responsible.trim() || touchedEntries.length === 0}>
              {isPending ? "Confirmando..." : "Confirmar contagem e gerar ajustes"}
            </Button>
            <p className="text-xs text-foreground-subtle">
              {touchedEntries.length} produto(s) contado(s) — só os itens com quantidade física informada geram movimentação de correção.
            </p>
            {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
