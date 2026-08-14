import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CalculationNote } from "@/components/shared/calculation-note";
import { StocktakeView } from "@/components/inventory/stocktake-view";
import { QuickCountView, type QuickCountItem } from "@/components/inventory/quick-count-view";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { generateStocktakeReference } from "@/lib/inventory/stocktake";
import { toItemView } from "@/lib/inventory/status";
import { deriveStocktakeSessions } from "@/lib/inventory/stockAnalytics";
import { fetchPeriodComparison, detectPersistentDeviation, type PeriodComparison } from "@/lib/inventory/calibration-comparison";
import { groupReliableCountsByItem, classifyReliableCountStatus } from "@/lib/inventory/managerial-physical-count";
import { fetchManagerialRecipesByItem } from "@/lib/inventory/managerial-consumption-analysis";
import { countPendingPurchaseLines } from "@/lib/inventory/purchase-import-service";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

/** Bound de consultas — só as contagens mais recentes recebem comparação teórico x físico ao vivo (seção 10). */
const SESSIONS_WITH_COMPARISON = 5;

export default async function ContagemPage() {
  const [rawItems, allMovements, { recipesByItem }, pendingPurchaseLines] = await Promise.all([
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
    fetchManagerialRecipesByItem(),
    countPendingPurchaseLines(),
  ]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Missão de UI Operacional de Contagem V1 — "prioritário" é resolvido pelos produtos reais que
  // já têm baseline gerencial (Bronze/Silver/Gold), nunca por uma lista de nomes hardcoded.
  const priorityItemIds = new Set(recipesByItem.keys());
  const reliableCountsByItem = groupReliableCountsByItem(allMovements);
  const today = saoPauloDateISO();

  const quickCountItems: QuickCountItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    currentQuantity: item.currentQuantity,
    unit: item.unit,
    packageCapacity: item.packageCapacity,
    classification: item.classification,
    quantityStatus: item.quantityStatus,
    category: item.category,
    isPriority: priorityItemIds.has(item.id),
    countStatus: classifyReliableCountStatus(reliableCountsByItem.get(item.id) ?? { latest: null, previous: null }),
  }));

  const reference = generateStocktakeReference();
  const sessions = deriveStocktakeSessions(allMovements, itemById).filter((s) => s.type === "correcao_inventario");

  const comparisons = new Map<string, PeriodComparison | null>();
  const recentSessions = sessions.slice(0, SESSIONS_WITH_COMPARISON);
  for (const session of recentSessions) {
    for (const line of session.lines) {
      const key = `${session.date}:${line.itemId}`;
      if (comparisons.has(key)) continue;
      comparisons.set(key, await fetchPeriodComparison(line.itemId, session.date));
    }
  }

  // Alerta de desperdício (seção 11) — agrupa as comparações já calculadas por produto, em ordem
  // cronológica, e só sinaliza quando as últimas contagens consecutivas mostram desvio
  // persistente (nunca por uma única ocorrência). Limitado às mesmas contagens recentes acima.
  const comparisonsByItem = new Map<string, PeriodComparison[]>();
  for (const session of [...recentSessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const line of session.lines) {
      const comparison = comparisons.get(`${session.date}:${line.itemId}`);
      if (!comparison) continue;
      const list = comparisonsByItem.get(line.itemId) ?? [];
      list.push(comparison);
      comparisonsByItem.set(line.itemId, list);
    }
  }
  const persistentDeviationAlerts = Array.from(comparisonsByItem.entries())
    .filter(([, list]) => detectPersistentDeviation(list))
    .map(([itemId, list]) => ({ itemId, itemName: itemById.get(itemId)?.name ?? "Produto não encontrado", latest: list[list.length - 1] }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contagem física"
        description="Compare o saldo teórico com a contagem física real. Cada divergência confirmada vira uma movimentação de correção — o saldo nunca é sobrescrito diretamente."
      />

      {pendingPurchaseLines > 0 ? (
        <Card className="border-warning/30 bg-warning-bg/10">
          <CardContent className="pt-6 text-sm text-foreground-muted">
            Existem compras pendentes de classificação que podem afetar o estoque. Quantidade: <span className="font-medium text-foreground">{pendingPurchaseLines}</span>.
          </CardContent>
        </Card>
      ) : null}

      <QuickCountView items={quickCountItems} today={today} />

      <StocktakeView items={items} reference={reference} />

      <Card>
        <CardHeader>
          <CardTitle>Alertas de desvio persistente — {persistentDeviationAlerts.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {persistentDeviationAlerts.length === 0 ? (
            <EmptyState
              title="Nenhum desvio persistente detectado."
              description={`Um alerta só aparece aqui quando o consumo real supera o consumo teórico em mais de ${20}% em pelo menos 2 contagens consecutivas — uma única ocorrência nunca é tratada como desperdício.`}
            />
          ) : (
            <ul className="space-y-2">
              {persistentDeviationAlerts.map((alert) => (
                <li key={alert.itemId} className="flex items-center justify-between rounded-lg border border-critical/30 bg-critical-bg/20 p-3 text-sm">
                  <span className="font-medium text-foreground">{alert.itemName}</span>
                  <Badge variant="critical">
                    Consumo real {alert.latest.differencePercent !== null && alert.latest.differencePercent > 0 ? "+" : ""}
                    {alert.latest.differencePercent}% acima do teórico
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contagens anteriores ({sessions.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {sessions.length === 0 ? (
            <EmptyState title="Nenhuma recontagem confirmada ainda." description="Contagens confirmadas por aqui aparecem nesta lista, com a diferença real por produto." />
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.reference} className="rounded-lg border border-border-subtle p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {formatDateBR(session.date)} — {session.reference}
                    </span>
                    <span className="text-foreground-muted">{session.responsible ?? "Responsável não informado"}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {session.lines.length} linha(s) — diferença positiva total: {session.totalPositiveDifference} · diferença negativa total: {session.totalNegativeDifference}
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                          <th className="pb-2 pr-3 font-medium">Produto</th>
                          <th className="pb-2 pr-3 font-medium">Saldo anterior</th>
                          <th className="pb-2 pr-3 font-medium">Contado</th>
                          <th className="pb-2 pr-3 font-medium">Diferença</th>
                          <th className="pb-2 pr-3 font-medium">Consumo teórico (30d)</th>
                          <th className="pb-2 pr-3 font-medium">Desvio</th>
                          <th className="pb-2 font-medium">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.lines.map((line) => {
                          const comparison = comparisons.get(`${session.date}:${line.itemId}`) ?? null;
                          return (
                            <tr key={`${session.reference}-${line.itemId}`} className="border-b border-border-subtle last:border-0">
                              <td className="py-2 pr-3 text-foreground-muted">{line.itemName}</td>
                              <td className="py-2 pr-3 text-foreground-muted">{line.previousBalance ?? "—"}</td>
                              <td className="py-2 pr-3 text-foreground-muted">{line.countedQuantity}</td>
                              <td className={`py-2 pr-3 font-medium ${line.difference !== null && line.difference < 0 ? "text-critical" : line.difference !== null && line.difference > 0 ? "text-positive" : "text-foreground-muted"}`}>
                                {line.difference !== null ? (line.difference > 0 ? `+${line.difference}` : line.difference) : "—"}
                              </td>
                              <td className="py-2 pr-3 text-foreground-muted">{comparison?.theoreticalConsumption ?? "Sem receita aplicada"}</td>
                              <td className="py-2 pr-3 text-foreground-muted">{comparison?.differencePercent !== null && comparison?.differencePercent !== undefined ? `${comparison.differencePercent > 0 ? "+" : ""}${comparison.differencePercent}%` : "Não calculável"}</td>
                              <td className="py-2 text-foreground-muted">{line.notes ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque, tipo correção de inventário, agrupadas pela referência compartilhada da contagem"
              formula="Diferença = saldo depois da correção − saldo antes dela (nunca a quantidade contada isolada, que é o valor absoluto recontado)"
              period="Histórico completo"
              recordsUsed={`${sessions.length} contagem(ns) confirmada(s)`}
              limitations={`A carga inicial (contagem_fisica_inicial) não aparece aqui — é o ponto de partida do sistema, não uma recontagem com divergência a comparar. Consumo teórico calculado numa janela fixa de 30 dias antes da contagem (não "desde a contagem anterior"), só para as ${SESSIONS_WITH_COMPARISON} contagens mais recentes.`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
