"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { registerPhysicalCountAction, fetchProductManagerialSummaryAction } from "@/app/estoque/actions";
import type { QuickCountActionState } from "@/app/estoque/actions";
import {
  computeCountDifference,
  convertToBaseUnit,
  estimateQuantityFromPackages,
  friendlyUnitOptionsFor,
  requiresLargeDifferenceConfirmation,
  OPEN_PACKAGE_FRACTIONS,
  type OpenPackageFraction,
} from "@/lib/inventory/count-input-helpers";
import type { ReliableCountStatus } from "@/lib/inventory/managerial-physical-count";
import type { ProductManagerialInventorySummary } from "@/lib/inventory/managerial-count-reconciliation";
import type { InventoryUnit, ItemClassification, QuantityStatus } from "@/lib/inventory/types";

export interface QuickCountItem {
  id: string;
  name: string;
  brand: string;
  currentQuantity: number;
  unit: InventoryUnit;
  packageCapacity: number | null;
  classification: ItemClassification | null;
  quantityStatus: QuantityStatus;
  category: string;
  isPriority: boolean;
  countStatus: ReliableCountStatus;
}

export type FilterKey = "todos" | "prioritarios" | "sem_contagem" | "precisam_recontagem" | "quimicos" | "polimento" | "outros";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "prioritarios", label: "Prioritários" },
  { key: "sem_contagem", label: "Sem contagem" },
  { key: "precisam_recontagem", label: "Precisam de recontagem" },
  { key: "quimicos", label: "Produtos químicos" },
  { key: "polimento", label: "Polimento" },
  { key: "outros", label: "Outros/consumíveis" },
];

const CHEMICAL_CLASSIFICATIONS: ItemClassification[] = ["quimico_volume", "solido_peso"];

/**
 * Núcleo puro do filtro — extraído do componente para ser testável sem renderizar React (o
 * projeto não usa Testing Library; toda lógica de UI que precisa de teste automatizado vive como
 * função pura separada da árvore de componentes, mesmo padrão do resto da sessão).
 */
export function matchesFilter(item: QuickCountItem, filter: FilterKey): boolean {
  switch (filter) {
    case "todos":
      return true;
    case "prioritarios":
      return item.isPriority;
    case "sem_contagem":
      return item.countStatus === "sem_contagem";
    case "precisam_recontagem":
      return item.countStatus === "uma_contagem";
    case "quimicos":
      return item.classification !== null && CHEMICAL_CLASSIFICATIONS.includes(item.classification);
    case "polimento":
      return item.category === "Polimento";
    case "outros":
      return !(item.classification !== null && CHEMICAL_CLASSIFICATIONS.includes(item.classification)) && item.category !== "Polimento";
  }
}

const COUNT_STATUS_LABEL: Record<ReliableCountStatus, { label: string; variant: "outline" | "warning" | "positive" }> = {
  sem_contagem: { label: "Sem contagem", variant: "outline" },
  uma_contagem: { label: "1 contagem — aguardando recontagem", variant: "warning" },
  pronto_para_analise: { label: "Pronto para análise", variant: "positive" },
};

const initialActionState: QuickCountActionState = {
  error: null,
  success: false,
  itemId: null,
  previousBalance: null,
  countedQuantity: null,
  difference: null,
  unit: null,
  resolvedMeasurementPending: false,
};

function formatQty(value: number, unit: string): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

export function QuickCountView({ items, today }: { items: QuickCountItem[]; today: string }) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => matchesFilter(item, filter))
      .filter((item) => !query || `${item.name} ${item.brand}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [items, filter, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contagem rápida por produto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-foreground-muted">
          Conte um produto de cada vez, na hora — sem precisar preencher a lista inteira. Cada contagem salva vira uma posição física confiável imediatamente.
        </p>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-muted hover:border-accent/50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto"
          className="h-9 w-full max-w-sm rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
          aria-label="Buscar produto"
        />

        {filteredItems.length === 0 ? (
          <EmptyState title="Nenhum produto neste filtro." description="Tente outro filtro ou limpe a busca." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filteredItems.map((item) => (
              <QuickCountRow
                key={item.id}
                item={item}
                today={today}
                expanded={expandedItemId === item.id}
                onToggle={() => setExpandedItemId((current) => (current === item.id ? null : item.id))}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuickCountRow({ item, today, expanded, onToggle }: { item: QuickCountItem; today: string; expanded: boolean; onToggle: () => void }) {
  const [state, formAction, isPending] = useActionState(registerPhysicalCountAction, initialActionState);
  const [method, setMethod] = useState<"direto" | "embalagem">("direto");
  const [inputUnit, setInputUnit] = useState<InventoryUnit>(item.unit);
  const [directValue, setDirectValue] = useState("");
  const [closedPackages, setClosedPackages] = useState("");
  const [openFraction, setOpenFraction] = useState<OpenPackageFraction>("vazia");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmedLargeDifference, setConfirmedLargeDifference] = useState(false);
  const [summary, setSummary] = useState<ProductManagerialInventorySummary | { error: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const unitOptions = friendlyUnitOptionsFor(item.unit);

  const baseQuantity = useMemo(() => {
    if (method === "direto") {
      const raw = Number(directValue.replace(",", "."));
      if (!Number.isFinite(raw)) return null;
      return convertToBaseUnit(raw, inputUnit, item.unit);
    }
    const packages = Number(closedPackages.replace(",", "."));
    if (!Number.isFinite(packages)) return null;
    return estimateQuantityFromPackages(packages, openFraction, item.packageCapacity);
  }, [method, directValue, inputUnit, closedPackages, openFraction, item.unit, item.packageCapacity]);

  const diff = baseQuantity !== null ? computeCountDifference(item.currentQuantity, baseQuantity) : null;
  const needsConfirmation = baseQuantity !== null && requiresLargeDifferenceConfirmation(item.currentQuantity, baseQuantity);
  const canSave = baseQuantity !== null && source.trim().length > 0 && (!needsConfirmation || confirmedLargeDifference);

  async function loadSummary() {
    if (summary || loadingSummary) return;
    setLoadingSummary(true);
    const result = await fetchProductManagerialSummaryAction(item.id);
    setSummary(result);
    setLoadingSummary(false);
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex flex-1 flex-wrap items-center gap-3 text-left">
          <span className="min-w-[180px] font-medium text-foreground">
            {item.name} <span className="text-xs text-foreground-subtle">({item.brand})</span>
          </span>
          <span className="text-sm text-foreground-muted">
            Sistema: {formatQty(item.currentQuantity, item.unit)}
          </span>
          {item.isPriority ? <Badge variant="info">Prioritário</Badge> : null}
          <Badge variant={COUNT_STATUS_LABEL[item.countStatus].variant}>{COUNT_STATUS_LABEL[item.countStatus].label}</Badge>
          {item.quantityStatus === "measurement_pending" ? <Badge variant="critical">Primeira contagem necessária</Badge> : null}
          {item.countStatus === "sem_contagem" ? <Badge variant="critical">Contagem inicial necessária</Badge> : null}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onToggle();
            if (!expanded) void loadSummary();
          }}
        >
          {expanded ? "Fechar" : "Contar"}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-4 rounded-lg border border-border-subtle p-4">
          {state.success && state.itemId === item.id ? (
            <div className="rounded-lg border border-positive/30 bg-positive-bg/20 p-3 text-sm">
              <p className="font-medium text-positive">Contagem registrada.</p>
              <p className="mt-1 text-foreground-muted">
                Saldo anterior: {formatQty(state.previousBalance ?? 0, state.unit ?? item.unit)} · Contagem física: {formatQty(state.countedQuantity ?? 0, state.unit ?? item.unit)} · Ajuste:{" "}
                {(state.difference ?? 0) > 0 ? "+" : ""}
                {formatQty(state.difference ?? 0, state.unit ?? item.unit)} · Novo saldo: {formatQty(state.countedQuantity ?? 0, state.unit ?? item.unit)}
              </p>
              {state.resolvedMeasurementPending ? <p className="mt-1 text-xs text-foreground-subtle">Esta foi a primeira contagem real do produto — a posição confiável começa hoje.</p> : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => setMethod("direto")} className={cn("rounded-full border px-3 py-1", method === "direto" ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-muted")}>
                  Informar quantidade diretamente
                </button>
                {item.packageCapacity !== null ? (
                  <button type="button" onClick={() => setMethod("embalagem")} className={cn("rounded-full border px-3 py-1", method === "embalagem" ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-muted")}>
                    Embalagens fechadas + fração aberta
                  </button>
                ) : null}
              </div>

              {method === "direto" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
                    Quantidade física
                    <input
                      type="text"
                      inputMode="decimal"
                      value={directValue}
                      onChange={(e) => setDirectValue(e.target.value)}
                      className="h-9 w-32 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                      aria-label={`Quantidade física de ${item.name}`}
                    />
                  </label>
                  {unitOptions.length > 1 ? (
                    <select value={inputUnit} onChange={(e) => setInputUnit(e.target.value as InventoryUnit)} className="h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground" aria-label="Unidade informada">
                      {unitOptions.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="pb-2 text-sm text-foreground-muted">{item.unit}</span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
                      Embalagens fechadas ({item.packageCapacity} {item.unit} cada)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={closedPackages}
                        onChange={(e) => setClosedPackages(e.target.value)}
                        className="h-9 w-24 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                        aria-label={`Embalagens fechadas de ${item.name}`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
                      Embalagem aberta
                      <select value={openFraction} onChange={(e) => setOpenFraction(e.target.value as OpenPackageFraction)} className="h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground" aria-label="Fração da embalagem aberta">
                        {OPEN_PACKAGE_FRACTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f === "vazia" ? "Vazia" : f === "cheia" ? "Cheia" : `${f}%`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-foreground-subtle">Quantidade aproximada — estimativa de inventário, não uma medição exata.</p>
                </div>
              )}

              {baseQuantity !== null ? (
                <p className="text-sm text-foreground-muted">
                  {method === "embalagem" ? "Quantidade aproximada: " : "Quantidade a registrar: "}
                  <span className="font-medium text-foreground">{formatQty(baseQuantity, item.unit)}</span>
                  {diff ? (
                    <span className={cn("ml-2", diff.absolute < 0 ? "text-critical" : diff.absolute > 0 ? "text-positive" : "text-foreground-subtle")}>
                      (ajuste {diff.absolute > 0 ? "+" : ""}
                      {formatQty(diff.absolute, item.unit)}
                      {diff.percentage !== null ? `, ${diff.percentage > 0 ? "+" : ""}${diff.percentage}%` : ""})
                    </span>
                  ) : null}
                </p>
              ) : null}

              {needsConfirmation ? (
                <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg/20 p-3 text-sm">
                  <input type="checkbox" checked={confirmedLargeDifference} onChange={(e) => setConfirmedLargeDifference(e.target.checked)} className="mt-0.5" />
                  <span>
                    A contagem informada altera o saldo em {diff?.percentage !== null ? `${Math.abs(diff?.percentage ?? 0)}%` : "uma proporção grande"}. Confira se não foi um erro de digitação antes de confirmar.
                  </span>
                </label>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
                  Responsável pela contagem
                  <input type="text" value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-48 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" aria-label="Responsável pela contagem" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
                  Observação (opcional)
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 w-48 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" aria-label="Observação" />
                </label>
              </div>

              <form action={formAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="countedQuantity" value={baseQuantity ?? ""} />
                <input type="hidden" name="countedAt" value={today} />
                <input type="hidden" name="source" value={source} />
                <input type="hidden" name="notes" value={notes} />
                <Button type="submit" disabled={!canSave || isPending}>
                  {isPending ? "Salvando..." : "Salvar contagem"}
                </Button>
                {state.error ? <p className="mt-2 text-sm text-critical">{state.error}</p> : null}
              </form>
            </>
          )}

          <ProductHistorySummary summary={summary} loading={loadingSummary} unit={item.unit} />
        </div>
      ) : null}
    </li>
  );
}

const STATUS_LABEL_PT: Record<string, string> = {
  NORMAL: "Normal",
  ATTENTION: "Atenção",
  HIGH_CONSUMPTION: "Consumo acima do esperado",
  LOW_CONSUMPTION: "Consumo abaixo do esperado",
  INSUFFICIENT_DATA: "Dados insuficientes",
};

function ProductHistorySummary({ summary, loading, unit }: { summary: ProductManagerialInventorySummary | { error: string } | null; loading: boolean; unit: string }) {
  if (loading) return <p className="text-xs text-foreground-subtle">Carregando histórico...</p>;
  if (!summary) return null;
  if ("error" in summary) return <p className="text-xs text-critical">{summary.error}</p>;

  return (
    <div className="border-t border-border-subtle pt-3 text-xs text-foreground-muted">
      <p className="mb-2 font-medium text-foreground">Histórico do produto</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-foreground-subtle">Última contagem</dt>
          <dd>{summary.lastCount ? `${summary.lastCount.date} — ${formatQty(summary.lastCount.quantity, unit)}` : "Nenhuma"}</dd>
        </div>
        <div>
          <dt className="text-foreground-subtle">Contagem anterior</dt>
          <dd>{summary.previousCount ? `${summary.previousCount.date} — ${formatQty(summary.previousCount.quantity, unit)}` : "Nenhuma"}</dd>
        </div>
        <div>
          <dt className="text-foreground-subtle">Entradas desde a última</dt>
          <dd>{summary.entriesSinceLastCount !== null ? formatQty(summary.entriesSinceLastCount, unit) : "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground-subtle">Rendimento gerencial estimado</dt>
          <dd>{summary.expectedServicesPerPackage !== null ? `${summary.expectedServicesPerPackage} serviços/embalagem` : "—"}</dd>
        </div>
      </dl>

      {summary.previousCount && summary.lastCount ? (
        <div className="mt-3 rounded-lg border border-border-subtle p-3">
          <p className="mb-1 font-medium text-foreground">
            Período analisado: {summary.previousCount.date} a {summary.lastCount.date}
          </p>
          <p>Consumo médio de referência (esperado): {summary.expectedConsumption !== null ? formatQty(summary.expectedConsumption, unit) : "não calculável"}</p>
          <p>Consumo aparente: {summary.apparentConsumption !== null ? formatQty(summary.apparentConsumption, unit) : "não calculável"}</p>
          <p>
            Desvio: {summary.varianceAbsolute !== null ? `${summary.varianceAbsolute > 0 ? "+" : ""}${formatQty(summary.varianceAbsolute, unit)}` : "—"}
            {summary.variancePercentage !== null ? ` (${summary.variancePercentage > 0 ? "+" : ""}${summary.variancePercentage}%)` : ""}
          </p>
          <Badge variant={summary.status === "NORMAL" ? "positive" : summary.status === "INSUFFICIENT_DATA" ? "outline" : "warning"} className="mt-1">
            {STATUS_LABEL_PT[summary.status] ?? summary.status}
          </Badge>
        </div>
      ) : (
        <p className="mt-2 text-foreground-subtle">Ainda não há duas contagens confiáveis para calcular consumo esperado × aparente deste produto.</p>
      )}
    </div>
  );
}
