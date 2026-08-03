import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { DuplicatesList } from "@/components/inventory/audit/duplicates-list";
import { DataQualityList } from "@/components/inventory/audit/data-quality-list";
import { HealthIndexPanel } from "@/components/inventory/audit/health-index-panel";
import { fetchAuditSummary } from "@/lib/inventory/audit-service";
import { formatCurrency } from "@/lib/utils/format";
import type { InventoryItem } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

interface IndicatorCardProps {
  label: string;
  value: number;
  filterKey: string;
  active: boolean;
}

function IndicatorCard({ label, value, filterKey, active }: IndicatorCardProps) {
  return (
    <Link href={`/estoque/auditoria?ver=${filterKey}`} className="block rounded-xl" aria-label={`${label}: ${value}. Ver lista.`}>
      <Card className={`cursor-pointer p-4 transition-colors hover:border-accent/50 hover:bg-background-elevated ${active ? "border-accent" : ""}`}>
        <p className="text-xs font-medium text-foreground-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      </Card>
    </Link>
  );
}

const INDICATOR_LABELS: Record<string, string> = {
  total: "Total de produtos",
  completos: "Produtos completos",
  incompletos: "Produtos incompletos",
  custo_zerado: "Com custo zerado",
  sem_fornecedor: "Sem fornecedor",
  sem_localizacao: "Sem localização",
  sem_minimo: "Sem estoque mínimo",
  sem_ideal: "Sem estoque ideal",
  sem_movimentacao: "Sem movimentação",
  saldo_negativo: "Com saldo negativo",
  unidade_inconsistente: "Com unidade inconsistente",
  duplicidades: "Possíveis duplicidades",
  sem_entrada: "Sem histórico de entrada",
  consumido_sem_entrada: "Consumido sem entrada registrada",
};

function filterItems(ver: string, items: InventoryItem[], issueItemIdsByRule: Map<string, Set<string>>, entryItemIds: Set<string>): InventoryItem[] {
  const liveItems = items.filter((i) => i.canonicalItemId === null);
  switch (ver) {
    case "total":
      return liveItems;
    case "completos":
      return liveItems.filter((i) => i.supplier !== null && i.location !== null && i.minimumStock !== null && i.idealStock !== null && i.unitCost !== null && i.classification !== null);
    case "incompletos":
      return liveItems.filter((i) => !(i.supplier !== null && i.location !== null && i.minimumStock !== null && i.idealStock !== null && i.unitCost !== null && i.classification !== null));
    case "custo_zerado":
      return liveItems.filter((i) => i.unitCost === null);
    case "sem_fornecedor":
      return liveItems.filter((i) => i.supplier === null);
    case "sem_localizacao":
      return liveItems.filter((i) => i.location === null);
    case "sem_minimo":
      return liveItems.filter((i) => i.minimumStock === null);
    case "sem_ideal":
      return liveItems.filter((i) => i.idealStock === null);
    case "sem_movimentacao":
      return liveItems.filter((i) => (issueItemIdsByRule.get("sem_movimentacao") ?? new Set()).has(i.id));
    case "saldo_negativo":
      return liveItems.filter((i) => i.currentQuantity < 0);
    case "unidade_inconsistente":
      return liveItems.filter((i) => (issueItemIdsByRule.get("unidade_inconsistente_com_nome") ?? new Set()).has(i.id));
    case "sem_entrada":
      return liveItems.filter((i) => !entryItemIds.has(i.id));
    case "consumido_sem_entrada":
      return liveItems.filter((i) => (issueItemIdsByRule.get("consumido_sem_entrada") ?? new Set()).has(i.id));
    default:
      return [];
  }
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const summary = await fetchAuditSummary();
  const { items, dataQuality, duplicates, unresolvedDuplicateCount, healthIndex, itemById } = summary;

  const issueItemIdsByRule = new Map<string, Set<string>>();
  for (const issue of dataQuality.issues) {
    const set = issueItemIdsByRule.get(issue.ruleId) ?? new Set<string>();
    set.add(issue.itemId);
    issueItemIdsByRule.set(issue.ruleId, set);
  }
  const entryItemIds = new Set(summary.movements.filter((m) => m.type === "entrada" || m.type === "compra").map((m) => m.itemId));

  const itemByIdRecord = Object.fromEntries(itemById) as Record<string, InventoryItem>;
  const s = dataQuality.summary;

  const filteredItems = ver ? filterItems(ver, items, issueItemIdsByRule, entryItemIds) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria do Estoque"
        description="Consolidação do estoque real (Missão 23) — nunca altera dados automaticamente; toda ação exige confirmação humana."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/estoque/auditoria/importar-compras">Importar compras históricas</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/estoque/auditoria/exportar">Exportar relatório (CSV)</a>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <IndicatorCard label={INDICATOR_LABELS.total} value={s.totalProducts} filterKey="total" active={ver === "total"} />
        <IndicatorCard label={INDICATOR_LABELS.completos} value={s.completeProducts} filterKey="completos" active={ver === "completos"} />
        <IndicatorCard label={INDICATOR_LABELS.incompletos} value={s.incompleteProducts} filterKey="incompletos" active={ver === "incompletos"} />
        <IndicatorCard label={INDICATOR_LABELS.custo_zerado} value={s.withoutCost} filterKey="custo_zerado" active={ver === "custo_zerado"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_fornecedor} value={s.withoutSupplier} filterKey="sem_fornecedor" active={ver === "sem_fornecedor"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_localizacao} value={s.withoutLocation} filterKey="sem_localizacao" active={ver === "sem_localizacao"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_minimo} value={s.withoutMinimumStock} filterKey="sem_minimo" active={ver === "sem_minimo"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_ideal} value={s.withoutIdealStock} filterKey="sem_ideal" active={ver === "sem_ideal"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_movimentacao} value={s.withoutMovement} filterKey="sem_movimentacao" active={ver === "sem_movimentacao"} />
        <IndicatorCard label={INDICATOR_LABELS.saldo_negativo} value={s.negativeBalance} filterKey="saldo_negativo" active={ver === "saldo_negativo"} />
        <IndicatorCard label={INDICATOR_LABELS.unidade_inconsistente} value={s.inconsistentUnit} filterKey="unidade_inconsistente" active={ver === "unidade_inconsistente"} />
        <IndicatorCard label={INDICATOR_LABELS.duplicidades} value={unresolvedDuplicateCount} filterKey="duplicidades" active={ver === "duplicidades"} />
        <IndicatorCard label={INDICATOR_LABELS.sem_entrada} value={s.withoutEntryHistory} filterKey="sem_entrada" active={ver === "sem_entrada"} />
        <IndicatorCard label={INDICATOR_LABELS.consumido_sem_entrada} value={s.consumedWithoutEntry} filterKey="consumido_sem_entrada" active={ver === "consumido_sem_entrada"} />
      </div>

      {ver && ver !== "duplicidades" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{INDICATOR_LABELS[ver] ?? "Indicador"}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/estoque/auditoria">Fechar</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {!filteredItems || filteredItems.length === 0 ? (
              <EmptyState title="Nenhum produto neste indicador" />
            ) : (
              <ul className="space-y-2">
                {filteredItems.map((item) => (
                  <li key={item.id}>
                    <Link href={`/estoque/produtos/${item.id}`} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm hover:border-accent/50 hover:bg-background-elevated">
                      <span className="text-foreground-muted">
                        {item.name} <span className="text-foreground-subtle">({item.brand})</span>
                      </span>
                      <span className="text-foreground">
                        {item.currentQuantity} {item.unit}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DuplicatesList duplicates={duplicates} itemById={itemByIdRecord} />
        </div>
        <HealthIndexPanel healthIndex={healthIndex} />
      </div>

      <DataQualityList issues={dataQuality.issues} itemById={itemByIdRecord} />

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0 text-xs text-foreground-subtle">
          <Badge variant="outline">{s.totalProducts} produtos preservados</Badge>
          <Badge variant="outline">{duplicates.length} par(es) suspeito(s) detectado(s)</Badge>
          <Badge variant="outline">Custo total conhecido: {formatCurrency(items.filter((i) => i.canonicalItemId === null && i.unitCost !== null).reduce((sum, i) => sum + i.unitCost! * i.currentQuantity, 0))}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
