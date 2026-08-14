import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CalculationNote } from "@/components/shared/calculation-note";
import { fetchManagerialRecipesByItem } from "@/lib/inventory/managerial-consumption-analysis";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getProductManagerialInventorySummary } from "@/lib/inventory/managerial-count-reconciliation";
import { buildManagerialAlert } from "@/lib/inventory/managerial-count-reconciliation";
import { countPendingPurchaseLines } from "@/lib/inventory/purchase-import-service";
import { formatDateBR } from "@/lib/utils/format";
import type { ConsumptionVarianceStatus } from "@/lib/inventory/managerial-consumption-variance";
import type { ManagerialDataQuality } from "@/lib/inventory/managerial-consumption-analysis";

export const dynamic = "force-dynamic";

/**
 * Missão de UI Operacional de Contagem de Estoque V1, seção 15 — consulta gerencial mínima,
 * somente leitura. Nunca recalcula matemática aqui: cada linha vem de
 * `getProductManagerialInventorySummary`, já existente. Escopo: só os produtos com baseline
 * gerencial declarado em Bronze/Silver/Gold (resolvido por dado real via
 * `fetchManagerialRecipesByItem`, nunca uma lista hardcoded) — os únicos para os quais "consumo
 * esperado" tem algum sentido.
 */

const STATUS_LABEL: Record<ConsumptionVarianceStatus, string> = {
  NORMAL: "Normal",
  ATTENTION: "Atenção",
  HIGH_CONSUMPTION: "Consumo acima",
  LOW_CONSUMPTION: "Consumo abaixo",
  INSUFFICIENT_DATA: "Dados insuficientes",
};

const STATUS_BADGE_VARIANT: Record<ConsumptionVarianceStatus, "positive" | "warning" | "critical" | "outline"> = {
  NORMAL: "positive",
  ATTENTION: "warning",
  HIGH_CONSUMPTION: "critical",
  LOW_CONSUMPTION: "warning",
  INSUFFICIENT_DATA: "outline",
};

const QUALITY_LABEL: Record<ManagerialDataQuality, string> = {
  RELIABLE: "Confiável",
  PARTIAL: "Parcial",
  INSUFFICIENT: "Insuficiente",
};

function formatQty(value: number | null, unit: string): string {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

export default async function ConsumoGerencialPage() {
  const [{ recipesByItem }, allItems, pendingPurchaseLines] = await Promise.all([fetchManagerialRecipesByItem(), getInventoryRepository().listItems(), countPendingPurchaseLines()]);

  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const priorityItemIds = Array.from(recipesByItem.keys()).filter((id) => itemById.has(id));

  const summaries = await Promise.all(priorityItemIds.map((itemId) => getProductManagerialInventorySummary(itemId)));
  summaries.sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR"));

  const readyCount = summaries.filter((s) => s.dataQuality !== "INSUFFICIENT").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumo gerencial"
        description="Consumo médio de referência × consumo aparente (contagem anterior + entradas − contagem atual), só para os produtos com referência gerencial declarada."
      />

      {pendingPurchaseLines > 0 ? (
        <Card className="border-warning/30 bg-warning-bg/10">
          <CardContent className="pt-6 text-sm text-foreground-muted">
            Existem compras pendentes de classificação que podem afetar o estoque. Quantidade: <span className="font-medium text-foreground">{pendingPurchaseLines}</span>.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Produtos com referência gerencial — {summaries.length} ({readyCount} com dado utilizável)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {summaries.length === 0 ? (
            <EmptyState title="Nenhum produto com referência gerencial ainda." description="Cadastre um consumo médio de referência para algum produto antes de consultar esta tela." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Período</th>
                    <th className="pb-2 pr-3 font-medium">Consumo esperado</th>
                    <th className="pb-2 pr-3 font-medium">Consumo aparente</th>
                    <th className="pb-2 pr-3 font-medium">Desvio</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Qualidade</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => {
                    const alert = buildManagerialAlert({
                      itemName: summary.itemName,
                      status: summary.status,
                      variancePercentage: summary.variancePercentage,
                      periodStart: summary.previousCount?.date ?? null,
                      periodEnd: summary.lastCount?.date ?? null,
                    });
                    return (
                      <tr key={summary.itemId} className="border-b border-border-subtle align-top last:border-0">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-foreground">{summary.itemName}</p>
                          <p className="text-xs text-foreground-subtle">{summary.brand}</p>
                        </td>
                        <td className="py-2 pr-3 text-foreground-muted">
                          {summary.previousCount && summary.lastCount ? `${formatDateBR(summary.previousCount.date)} a ${formatDateBR(summary.lastCount.date)}` : "Aguardando 2ª contagem"}
                        </td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatQty(summary.expectedConsumption, summary.unit)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatQty(summary.apparentConsumption, summary.unit)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">
                          {summary.varianceAbsolute !== null ? (
                            <>
                              {summary.varianceAbsolute > 0 ? "+" : ""}
                              {formatQty(summary.varianceAbsolute, summary.unit)}
                              {summary.variancePercentage !== null ? ` (${summary.variancePercentage > 0 ? "+" : ""}${summary.variancePercentage}%)` : ""}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={STATUS_BADGE_VARIANT[summary.status]}>{STATUS_LABEL[summary.status]}</Badge>
                          <p className="mt-1 max-w-xs text-xs text-foreground-subtle">{alert.message}</p>
                        </td>
                        <td className="py-2 text-foreground-muted">{QUALITY_LABEL[summary.dataQuality]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3">
            <CalculationNote
              source="getProductManagerialInventorySummary — última e penúltima posição física confiável de cada produto, mais serviços Bronze/Silver/Gold realizados no intervalo (JumpPark) e entradas reais de estoque no mesmo intervalo."
              formula="Consumo esperado = serviços realizados × consumo médio de referência × ajuste de porte quando aplicável. Consumo aparente = contagem anterior + entradas − contagem atual. Desvio = aparente − esperado."
              period="Desde a última contagem física confiável de cada produto — nunca um período de calendário fixo."
              recordsUsed={`${summaries.length} produto(s) com consumo médio de referência cadastrado`}
              limitations="Consumo esperado/aparente só ficam disponíveis depois de 2 contagens físicas confiáveis do produto. Desvio é um sinal para verificação — nunca uma conclusão sobre desperdício ou execução do serviço."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
