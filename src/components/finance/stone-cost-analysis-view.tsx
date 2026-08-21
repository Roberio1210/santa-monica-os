"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PeriodSelector } from "@/components/operations/period-selector";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { StoneCostAnalysisPageData } from "@/lib/integrations/stone/costAnalysisPageData";
import type { StoneAdvanceDataStatus, StoneCostMethod } from "@/lib/integrations/stone/costAnalysis";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const advanceStatusLabels: Record<StoneAdvanceDataStatus, string> = {
  completo: "Antecipação confirmada em 100% das parcelas",
  parcial: "Antecipação confirmada só em parte das parcelas",
  indisponivel: "Antecipação ainda sem dado (liquidação não importada)",
};
const advanceStatusVariants: Record<StoneAdvanceDataStatus, "positive" | "warning" | "outline"> = {
  completo: "positive",
  parcial: "warning",
  indisponivel: "outline",
};

const methodLabels: Record<StoneCostMethod, string> = { debito: "Débito", credito: "Crédito", outro: "Outro" };
const brandLabels: Record<string, string> = { visa_mastercard: "Visa/Master", elo: "Elo", amex: "Amex" };

const eventTypeLabels: Record<StoneNormalizedTransactionRecord["eventType"], string> = {
  sale: "Venda",
  cancellation: "Cancelamento",
  chargeback: "Chargeback",
  chargeback_refund: "Estorno de chargeback",
};
const eventTypeVariants: Record<StoneNormalizedTransactionRecord["eventType"], "positive" | "warning" | "critical" | "outline"> = {
  sale: "positive",
  cancellation: "warning",
  chargeback: "critical",
  chargeback_refund: "outline",
};

export function StoneCostAnalysisView({ data, period }: { data: StoneCostAnalysisPageData; period: PeriodRange }) {
  const [detailSearch, setDetailSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<"todos" | StoneNormalizedTransactionRecord["eventType"]>("sale");

  const filteredDetailRows = useMemo(() => {
    const query = detailSearch.trim().toLowerCase();
    return data.detailRows.filter((r) => {
      if (eventFilter !== "todos" && r.eventType !== eventFilter) return false;
      if (!query) return true;
      return r.acquirerTransactionKey.toLowerCase().includes(query) || r.externalKey.toLowerCase().includes(query);
    });
  }, [data.detailRows, detailSearch, eventFilter]);

  const { summary } = data;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Custo real Stone por venda</CardTitle>
          <p className="mt-1 text-xs text-foreground-subtle">
            MDR e antecipação D+1 calculados só a partir de dados reais já importados — nunca uma taxa estimada. Base: {summary.installmentRowsCount} parcela(s) de venda entre{" "}
            {formatDateBR(data.periodFrom)} e {formatDateBR(data.periodTo)}.
          </p>
        </div>
        <PeriodSelector period={period} />
      </CardHeader>
      <CardContent className="space-y-6">
        {summary.installmentRowsCount === 0 ? (
          <EmptyState title="Nenhuma venda Stone capturada neste período." description="Verifique se o período selecionado está dentro da janela sincronizada em Sincronização Stone." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Vendas brutas" value={formatCurrency(summary.grossAmountTotal)} hint={`${summary.salesCount} venda(s) — ${summary.installmentRowsCount} parcela(s)`} />
              <StatCard label="MDR (sempre real)" value={formatCurrency(summary.mdrFeeTotal)} hint={summary.effectiveMdrRatePercent !== null ? `${formatPercent(summary.effectiveMdrRatePercent, 2)} do bruto` : "—"} />
              <StatCard
                label="Antecipação confirmada"
                value={formatCurrency(summary.advanceFeeConfirmedTotal)}
                hint={`${summary.settledRowsCount} de ${summary.installmentRowsCount} parcela(s) liquidadas`}
              />
              <StatCard
                label="Custo total confirmado"
                value={formatCurrency(summary.totalConfirmedCost)}
                hint={summary.effectiveTotalRatePercent !== null ? `${formatPercent(summary.effectiveTotalRatePercent, 2)} do bruto` : "taxa efetiva total indisponível — cobertura parcial"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={advanceStatusVariants[summary.advanceDataStatus]}>{advanceStatusLabels[summary.advanceDataStatus]}</Badge>
              {summary.cancellations.count > 0 ? (
                <Badge variant="warning">
                  {summary.cancellations.count} cancelamento(s) — {formatCurrency(summary.cancellations.grossAmountTotal)} (fora dos totais acima)
                </Badge>
              ) : null}
              {summary.chargebacks.count > 0 ? (
                <Badge variant="critical">
                  {summary.chargebacks.count} chargeback(s) — {formatCurrency(summary.chargebacks.grossAmountTotal)} (fora dos totais acima)
                </Badge>
              ) : null}
              {summary.pixSalesCount > 0 ? <Badge variant="outline">{summary.pixSalesCount} venda(s) Pix</Badge> : null}
            </div>
            <p className="text-xs text-foreground-subtle">{summary.totalConfirmedCostLabel}</p>
            <p className="text-xs text-foreground-subtle">
              &quot;Outras taxas&quot; (além de MDR e antecipação): sem campo próprio nos dados persistidos da Stone hoje — indisponível, não estimado.
            </p>

            {data.worstDay ? (
              <p className="text-xs text-foreground-muted">
                Dia de maior custo confirmado no período: <span className="font-medium text-foreground">{formatDateBR(data.worstDay.date)}</span> —{" "}
                {formatCurrency(data.worstDay.totalConfirmedCost)}
              </p>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Custo por dia</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                      <th className="pb-2 pr-3 font-medium">Data</th>
                      <th className="pb-2 pr-3 font-medium">Vendas</th>
                      <th className="pb-2 pr-3 font-medium">Bruto</th>
                      <th className="pb-2 pr-3 font-medium">MDR</th>
                      <th className="pb-2 pr-3 font-medium">Antecipação</th>
                      <th className="pb-2 pr-3 font-medium">Custo total</th>
                      <th className="pb-2 font-medium">Cobertura antecipação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyRows.map((row) => (
                      <tr key={row.date} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                        <td className="py-2 pr-3 font-medium text-foreground">{formatDateBR(row.date)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.salesCount}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.grossAmountTotal)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.mdrFeeTotal)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.advanceFeeConfirmedTotal)}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(row.totalConfirmedCost)}</td>
                        <td className="py-2">
                          <Badge variant={advanceStatusVariants[row.advanceDataStatus]}>{row.settledRowsCount}/{row.installmentRowsCount}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Custo por modalidade (forma de pagamento × bandeira × parcelas)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                      <th className="pb-2 pr-3 font-medium">Modalidade</th>
                      <th className="pb-2 pr-3 font-medium">Parcelas</th>
                      <th className="pb-2 pr-3 font-medium">Qtd.</th>
                      <th className="pb-2 pr-3 font-medium">Bruto</th>
                      <th className="pb-2 pr-3 font-medium">MDR</th>
                      <th className="pb-2 pr-3 font-medium">Taxa MDR</th>
                      <th className="pb-2 font-medium">Antecipação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modalityRows.map((row) => (
                      <tr key={`${row.modality.method}-${row.modality.brand}-${row.modality.installments}`} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {methodLabels[row.modality.method]} {row.modality.brand ? `— ${brandLabels[row.modality.brand] ?? row.modality.brand}` : ""}
                        </td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.modality.installments}x</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.installmentRowsCount}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.grossAmountTotal)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.mdrFeeTotal)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.effectiveMdrRatePercent !== null ? formatPercent(row.effectiveMdrRatePercent, 2) : "—"}</td>
                        <td className="py-2">
                          {row.settledRowsCount > 0 ? (
                            <span className="text-foreground-muted">
                              {formatCurrency(row.advanceFeeConfirmedTotal)} ({row.settledRowsCount}/{row.installmentRowsCount})
                            </span>
                          ) : (
                            <span className="text-foreground-subtle">sem dado</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Detalhe por parcela</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Buscar por chave da transação"
                  className={cn(fieldClasses, "w-full max-w-sm")}
                  aria-label="Buscar parcela"
                />
                <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)} className={fieldClasses} aria-label="Filtrar por tipo de evento">
                  <option value="todos">Todos os eventos</option>
                  <option value="sale">Só vendas</option>
                  <option value="cancellation">Só cancelamentos</option>
                  <option value="chargeback">Só chargebacks</option>
                  <option value="chargeback_refund">Só estornos de chargeback</option>
                </select>
              </div>

              {filteredDetailRows.length === 0 ? (
                <EmptyState title="Nenhuma parcela para os filtros atuais." />
              ) : (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                        <th className="pb-2 pr-3 font-medium">Data venda</th>
                        <th className="pb-2 pr-3 font-medium">Chave</th>
                        <th className="pb-2 pr-3 font-medium">Evento</th>
                        <th className="pb-2 pr-3 font-medium">Modalidade</th>
                        <th className="pb-2 pr-3 font-medium">Bruto</th>
                        <th className="pb-2 pr-3 font-medium">MDR</th>
                        <th className="pb-2 pr-3 font-medium">Líquido esperado</th>
                        <th className="pb-2 pr-3 font-medium">Liquidado</th>
                        <th className="pb-2 font-medium">Antecipação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDetailRows.map((row) => (
                        <tr key={row.externalKey} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                          <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(row.capturedAt.slice(0, 10))}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{row.acquirerTransactionKey}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={eventTypeVariants[row.eventType]}>{eventTypeLabels[row.eventType]}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-foreground-muted">
                            {methodLabels[row.modality.method]} {row.modality.installments}x
                          </td>
                          <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.grossAmount)}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.mdrFeeAmount)}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.netExpectedAmount)}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{row.settledAmount !== null ? formatCurrency(row.settledAmount) : "—"}</td>
                          <td className="py-2 text-foreground-muted">{row.advanceFeeAmount !== null ? formatCurrency(row.advanceFeeAmount) : "sem dado"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-foreground-subtle">
                {filteredDetailRows.length} de {data.detailRows.length} parcela(s)
              </p>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
