"use client";

import { Fragment, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import type { ServiceCostSummary } from "@/lib/recipes/catalog";

/**
 * Missão de Instrumentação Gerencial — "quanto custa executar um serviço" (Lavação Gold, Silver,
 * Bronze, polimento, vitrificação etc.). Reaproveita as mesmas receitas aprovadas já cadastradas
 * em `/estoque/receitas` — nenhuma fonte nova. Sempre mostra as 19 linhas reais do catálogo, cada
 * uma marcada "Custo parcial" quando algum componente do custo ainda não é conhecido — nunca
 * apresenta um número fechado sem evidência completa.
 */
export function ServiceCostSection({ summaries }: { summaries: ServiceCostSummary[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const closed = summaries.filter((s) => !s.estimate.isPartial).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custo de serviço — {closed} de {summaries.length} com custo fechado</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-xs text-foreground-subtle">
          Soma o custo médio dos produtos usados em cada serviço, só a partir de receitas aprovadas — nunca uma margem inventada. Quando faltar receita aprovada ou custo de algum produto, o
          serviço aparece como &quot;Custo parcial&quot;.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                <th className="pb-2 pr-3 font-medium">Serviço</th>
                <th className="pb-2 pr-3 font-medium">Custo de produto conhecido</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <Fragment key={s.serviceId}>
                  <tr
                    className="cursor-pointer border-b border-border-subtle last:border-0 hover:bg-background-elevated/50"
                    onClick={() => setExpandedId(expandedId === s.serviceId ? null : s.serviceId)}
                  >
                    <td className="py-2 pr-3 font-medium text-foreground">{s.serviceName}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.estimate.lines.length > 0 ? formatCurrency(s.estimate.knownCost) : "Sem dado"}</td>
                    <td className="py-2">
                      <Badge variant={s.estimate.isPartial ? "outline" : "positive"}>{s.estimate.isPartial ? "Custo parcial" : "Custo fechado"}</Badge>
                    </td>
                  </tr>
                  {expandedId === s.serviceId ? (
                    <tr className="border-b border-border-subtle bg-background-elevated/30 last:border-0">
                      <td colSpan={3} className="px-3 py-3">
                        {s.estimate.partialReason ? <p className="mb-2 text-xs text-warning">{s.estimate.partialReason}</p> : null}
                        {s.estimate.lines.length === 0 ? (
                          <p className="text-xs text-foreground-subtle">Nenhuma receita aprovada com quantidade calibrada ainda.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-foreground-subtle">
                                <th className="pb-1 pr-3 text-left font-medium">Produto</th>
                                <th className="pb-1 pr-3 text-left font-medium">Etapa</th>
                                <th className="pb-1 pr-3 text-left font-medium">Quantidade</th>
                                <th className="pb-1 text-left font-medium">Custo da linha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.estimate.lines.map((l) => (
                                <tr key={`${s.serviceId}-${l.itemId}-${l.processStep}`}>
                                  <td className="py-1 pr-3 text-foreground-muted">{l.itemName}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">{l.processStep}</td>
                                  <td className="py-1 pr-3 text-foreground-muted">
                                    {l.quantityPerService} {l.unit}
                                  </td>
                                  <td className="py-1 text-foreground-muted">{l.lineCost !== null ? formatCurrency(l.lineCost) : "Sem custo cadastrado"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-foreground-subtle">
          Limitação: quando existir receita aprovada para mais de uma categoria de veículo do mesmo serviço, o custo somado aqui combina todas — pode não refletir um único atendimento real.
          Refinar por categoria quando houver volume de dados suficiente.
        </p>
      </CardContent>
    </Card>
  );
}
