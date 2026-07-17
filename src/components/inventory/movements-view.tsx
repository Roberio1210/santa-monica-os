"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { MANUAL_MOVEMENT_TYPES } from "@/lib/inventory/manual-movement-types";
import { recordManualMovementAction, type FormActionState } from "@/app/estoque/actions";
import type { InventoryItemView, MovementType } from "@/lib/inventory/types";
import type { MovementView } from "@/lib/inventory/movements-view";

const movementLabels: Record<MovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste_inventario: "Ajuste de inventário",
  perda: "Perda",
  consumo_interno: "Consumo interno",
  compra: "Compra",
  contagem_fisica_inicial: "Contagem física inicial",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  avaria: "Avaria",
  vencimento: "Vencimento",
  devolucao: "Devolução",
  transferencia: "Transferência",
  consumo_teste_calibracao: "Consumo de calibração",
  correcao_inventario: "Correção de inventário",
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialFormState: FormActionState = { error: null, success: null };

interface MovementsViewProps {
  movements: MovementView[];
  items: InventoryItemView[];
  initialType?: MovementType;
}

export function MovementsView({ movements, items, initialType }: MovementsViewProps) {
  const [productFilter, setProductFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MovementType>(initialType ?? "all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (productFilter !== "all" && m.itemId !== productFilter) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      if (referenceFilter && !(m.reference ?? "").toLowerCase().includes(referenceFilter.toLowerCase())) return false;
      if (responsibleFilter && !(m.responsible ?? "").toLowerCase().includes(responsibleFilter.toLowerCase())) return false;
      return true;
    });
  }, [movements, productFilter, typeFilter, dateFrom, dateTo, referenceFilter, responsibleFilter]);

  const [formState, formAction, isPending] = useActionState(recordManualMovementAction, initialFormState);
  const [selectedItemId, setSelectedItemId] = useState("");
  const selectedItem = items.find((i) => i.id === selectedItemId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por produto">
            <option value="all">Todos os produtos</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | MovementType)} className={fieldClasses} aria-label="Filtrar por tipo">
            <option value="all">Todos os tipos</option>
            {(Object.keys(movementLabels) as MovementType[]).map((type) => (
              <option key={type} value={type}>
                {movementLabels[type]}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fieldClasses} aria-label="Data inicial" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={fieldClasses} aria-label="Data final" />
          <input
            type="text"
            value={referenceFilter}
            onChange={(e) => setReferenceFilter(e.target.value)}
            placeholder="Referência"
            className={cn(fieldClasses, "min-w-[160px]")}
            aria-label="Filtrar por referência"
          />
          <input
            type="text"
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(e.target.value)}
            placeholder="Responsável"
            className={cn(fieldClasses, "min-w-[160px]")}
            aria-label="Filtrar por responsável"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Movimentações — {filtered.length} de {movements.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma movimentação encontrada" description="Não há movimentações para os filtros selecionados." />
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <ol className="space-y-2">
                {filtered.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{movementLabels[m.type]}</Badge>
                        <span className="font-medium text-foreground">{m.itemName}</span>
                        <span className="text-xs text-foreground-subtle">{m.itemBrand}</span>
                      </div>
                      <span className="text-foreground-muted">{formatDateBR(m.date)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
                      <span>
                        {m.quantity} {m.unit}
                      </span>
                      <span>
                        Saldo: {m.previousBalance ?? <Unavailable label="não registrado" />} → {m.newBalance ?? <Unavailable label="não registrado" />}
                      </span>
                      {m.reference ? <span>Ref.: {m.reference}</span> : null}
                      {m.responsible ? <span>Responsável: {m.responsible}</span> : null}
                    </div>
                    {m.notes ? <p className="mt-1 text-xs text-foreground-muted">{m.notes}</p> : null}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar movimentação manual</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="mb-3 text-xs text-foreground-subtle">
            Só os tipos abaixo podem ser registrados manualmente. Entradas de compra, consumo confirmado e contagem inicial nascem de fluxos próprios
            (recebimento, calibração aprovada, contagem física) — nunca deste formulário.
          </p>
          <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select
              name="itemId"
              required
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className={fieldClasses}
              aria-label="Produto"
            >
              <option value="">Selecione o produto</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.brand})
                </option>
              ))}
            </select>

            <select name="type" required className={fieldClasses} aria-label="Tipo de movimentação">
              <option value="">Selecione o tipo</option>
              {MANUAL_MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {movementLabels[type]}
                </option>
              ))}
            </select>

            <input name="quantity" type="text" inputMode="decimal" required placeholder="Quantidade" className={fieldClasses} aria-label="Quantidade" />
            <input type="hidden" name="unit" value={selectedItem?.unit ?? ""} />
            <input
              disabled
              value={selectedItem ? `Unidade: ${selectedItem.unit}` : "Selecione um produto"}
              className={cn(fieldClasses, "text-foreground-subtle")}
              aria-label="Unidade (definida pelo produto selecionado)"
            />

            <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} aria-label="Data" />
            <input name="responsible" type="text" required placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
            <input name="reason" type="text" required placeholder="Motivo" className={cn(fieldClasses, "sm:col-span-2 lg:col-span-1")} aria-label="Motivo" />
            <input name="notes" type="text" placeholder="Observação (opcional)" className={cn(fieldClasses, "sm:col-span-2 lg:col-span-2")} aria-label="Observação" />

            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Registrando..." : "Registrar movimentação"}
              </Button>
              {formState.error ? <p className="text-sm text-critical">{formState.error}</p> : null}
              {formState.success ? <p className="text-sm text-positive">{formState.success}</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
