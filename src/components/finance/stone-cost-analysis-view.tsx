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
import { computeCostPerHundredReais, groupDetailRowsBySale, type StoneAdvanceDataStatus, type StoneCostMethod } from "@/lib/integrations/stone/costAnalysis";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusLabels: Record<StoneAdvanceDataStatus, string> = {
  completo: "confirmado em 100% das parcelas",
  parcial: "confirmado em parte das parcelas",
  indisponivel: "ainda sem dado real disponível",
};
const statusVariants: Record<StoneAdvanceDataStatus, "positive" | "warning" | "outline"> = {
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

  const groupedSales = useMemo(() => groupDetailRowsBySale(filteredDetailRows), [filteredDetailRows]);

  const { summary } = data;
  const costPerHundred = computeCostPerHundredReais(summary);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Custo real Stone por venda</CardTitle>
          <p className="mt-1 text-xs text-foreground-subtle">
            Bruto, MDR, antecipação D+1, outras taxas e líquido — sempre a partir de dados reais já importados, nunca uma taxa estimada. Base: {summary.installmentRowsCount} parcela(s) de venda
            entre {formatDateBR(data.periodFrom)} e {formatDateBR(data.periodTo)}.
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
              <StatCard label="Bruto vendido" value={formatCurrency(summary.grossAmountTotal)} hint={`${summary.salesCount} venda(s) — ${summary.installmentRowsCount} parcela(s)`} />
              <StatCard
                label="MDR"
                value={summary.mdrRowsCount > 0 ? formatCurrency(summary.mdrFeeTotal) : "—"}
                hint={summary.effectiveMdrRatePercent !== null ? `${formatPercent(summary.effectiveMdrRatePercent, 2)} do bruto — ${summary.mdrRowsCount}/${summary.installmentRowsCount} parcela(s)` : "não separável (taxa combinada)"}
              />
              <StatCard
                label="Antecipação"
                value={summary.advanceRowsCount > 0 ? formatCurrency(summary.advanceFeeConfirmedTotal) : "—"}
                hint={`${statusLabels[summary.advanceDataStatus]} (${summary.advanceRowsCount}/${summary.installmentRowsCount})`}
              />
              <StatCard
                label="Outras taxas"
                value={summary.otherFeesTotal !== null ? formatCurrency(summary.otherFeesTotal) : "não decomponível"}
                hint={summary.otherFeesTotal !== null ? `identificável em ${summary.otherFeesRowsCount}/${summary.installmentRowsCount} parcela(s)` : "sem dado real que permita isolar esse valor"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Custo total" value={formatCurrency(summary.totalConfirmedCost)} hint={`${statusLabels[summary.totalCostDataStatus]}`} />
              <StatCard label="Líquido recebido" value={formatCurrency(summary.netReceivedTotal)} hint={`${statusLabels[summary.netReceivedDataStatus]}`} />
              <StatCard label="Taxa efetiva total" value={summary.effectiveTotalRatePercent !== null ? formatPercent(summary.effectiveTotalRatePercent, 2) : "indisponível"} hint="custo total / bruto — só com 100% confirmado" />
            </div>

            <div className="rounded-lg border border-border bg-background-elevated px-4 py-3 text-sm">
              {costPerHundred !== null ? (
                <p>
                  Para cada <span className="font-semibold">R$ 100</span> vendidos, a Santa Mônica paga <span className="font-semibold text-foreground">R$ {costPerHundred.toFixed(2)}</span> à
                  Stone neste período.
                </p>
              ) : (
                <p className="text-foreground-subtle">
                  Ainda não é possível afirmar quanto a Santa Mônica paga por R$ 100 vendidos de forma 100% confirmada — custo total {statusLabels[summary.totalCostDataStatus]} neste período.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariants[summary.totalCostDataStatus]}>Custo total {statusLabels[summary.totalCostDataStatus]}</Badge>
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
                      <th className="pb-2 pr-3 font-medium">Outras taxas</th>
                      <th className="pb-2 pr-3 font-medium">Custo total</th>
                      <th className="pb-2 pr-3 font-medium">Líquido</th>
                      <th className="pb-2 font-medium">Taxa efetiva</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyRows.map((row) => (
                      <tr key={row.date} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                        <td className="py-2 pr-3 font-medium text-foreground">{formatDateBR(row.date)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.salesCount}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.grossAmountTotal)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.mdrRowsCount > 0 ? formatCurrency(row.mdrFeeTotal) : "—"}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.advanceRowsCount > 0 ? formatCurrency(row.advanceFeeConfirmedTotal) : "—"}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.otherFeesTotal !== null ? formatCurrency(row.otherFeesTotal) : "—"}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(row.totalConfirmedCost)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(row.netReceivedTotal)}</td>
                        <td className="py-2">
                          {row.effectiveTotalRatePercent !== null ? (
                            formatPercent(row.effectiveTotalRatePercent, 2)
                          ) : (
                            <Badge variant={statusVariants[row.totalCostDataStatus]}>{row.effectiveMdrRatePercent !== null ? `${formatPercent(row.effectiveMdrRatePercent, 2)} (só MDR)` : "—"}</Badge>
                          )}
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
                      <th className="pb-2 pr-3 font-medium">Antecipação</th>
                      <th className="pb-2 font-medium">Custo total</th>
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
                        <td className="py-2 pr-3 text-foreground-muted">{row.mdrRowsCount > 0 ? formatCurrency(row.mdrFeeTotal) : "—"}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{row.effectiveMdrRatePercent !== null ? formatPercent(row.effectiveMdrRatePercent, 2) : "—"}</td>
                        <td className="py-2 pr-3">
                          {row.advanceRowsCount > 0 ? (
                            <span className="text-foreground-muted">
                              {formatCurrency(row.advanceFeeConfirmedTotal)} ({row.advanceRowsCount}/{row.installmentRowsCount})
                            </span>
                          ) : (
                            <span className="text-foreground-subtle">sem dado</span>
                          )}
                        </td>
                        <td className="py-2 font-medium text-foreground">{formatCurrency(row.totalConfirmedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Detalhe por venda</h3>
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

              {groupedSales.size === 0 ? (
                <EmptyState title="Nenhuma parcela para os filtros atuais." />
              ) : (
                <div className="max-h-[36rem] space-y-3 overflow-auto">
                  {[...groupedSales.entries()].map(([saleKey, rows]) => {
                    const first = rows[0];
                    const saleGross = rows.reduce((sum, r) => sum + r.grossAmount, 0);
                    const saleCost = rows.reduce((sum, r) => sum + r.breakdown.totalCostAmount, 0);
                    const saleNet = rows.reduce((sum, r) => sum + r.breakdown.netReceivedAmount, 0);
                    return (
                      <div key={saleKey} className="rounded-lg border border-border-subtle p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <span className="font-medium text-foreground">{formatCurrency(saleGross)}</span>{" "}
                            <span className="text-foreground-muted">
                              — {methodLabels[first.modality.method]} {first.modality.installments}x — {formatDateBR(first.capturedAt.slice(0, 10))}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={eventTypeVariants[first.eventType]}>{eventTypeLabels[first.eventType]}</Badge>
                            <span className="text-xs text-foreground-subtle">
                              custo total {formatCurrency(saleCost)} — líquido {formatCurrency(saleNet)}
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border-subtle text-left text-foreground-subtle">
                                <th className="pb-1 pr-3 font-medium">Parcela</th>
                                <th className="pb-1 pr-3 font-medium">Bruto</th>
                                <th className="pb-1 pr-3 font-medium">MDR</th>
                                <th className="pb-1 pr-3 font-medium">Antecipação</th>
                                <th className="pb-1 pr-3 font-medium">Outras taxas</th>
                                <th className="pb-1 pr-3 font-medium">Custo total</th>
                                <th className="pb-1 font-medium">Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={row.externalKey} className="border-b border-border-subtle last:border-0">
                                  <td className="py-1 pr-3 text-foreground-muted">{row.installmentNumber}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">{formatCurrency(row.breakdown.grossAmount)}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">{row.breakdown.mdrAmount !== null ? formatCurrency(row.breakdown.mdrAmount) : "—"}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">{row.breakdown.advanceFeeAmount !== null ? formatCurrency(row.breakdown.advanceFeeAmount) : "sem dado"}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">{row.breakdown.otherFeesAmount !== null ? formatCurrency(row.breakdown.otherFeesAmount) : "—"}</td>
                                  <td className="py-1 pr-3 font-medium text-foreground">
                                    {formatCurrency(row.breakdown.totalCostAmount)}
                                    {!row.breakdown.totalCostComplete ? <span className="ml-1 text-foreground-subtle">(só MDR)</span> : null}
                                  </td>
                                  <td className="py-1 text-foreground-muted">{formatCurrency(row.breakdown.netReceivedAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-foreground-subtle">
                {filteredDetailRows.length} parcela(s) em {groupedSales.size} venda(s)
              </p>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
