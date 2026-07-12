"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { AccountingAlert } from "@/lib/finance/service";
import type { DreCostCenterGroup, DreGroupTotal, DreRegime, DreReport } from "@/lib/finance/types";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const costCenterGroupLabels: Record<DreCostCenterGroup, string> = {
  estetica_automotiva: "Estética Automotiva",
  estacionamento: "Estacionamento",
  administrativo_geral: "Administrativo/Geral",
};

const alertLabels: Record<AccountingAlert["level"], string> = {
  margem_negativa: "Margem negativa",
  resultado_operacional_negativo: "Resultado operacional negativo",
  centro_custo_negativo: "Centro de custo negativo",
  despesa_compartilhada_sem_rateio: "Despesa compartilhada sem rateio",
  competencia_proxima_fechamento: "Competência próxima do fechamento",
  aumento_despesa_relevante: "Aumento relevante de despesa",
};

interface DreViewProps {
  report: DreReport;
  previous: DreReport | null;
  byCostCenter: Record<DreCostCenterGroup, DreReport>;
  alerts: AccountingAlert[];
  regime: DreRegime;
  from: string;
  to: string;
  costCenterGroup: DreCostCenterGroup | "consolidado";
}

export function DreView({ report, previous, byCostCenter, alerts, regime, from, to, costCenterGroup }: DreViewProps) {
  const router = useRouter();

  function handleFilter(formData: FormData) {
    const params = new URLSearchParams();
    params.set("regime", String(formData.get("regime") ?? "competencia"));
    params.set("from", String(formData.get("from") ?? from));
    params.set("to", String(formData.get("to") ?? to));
    params.set("costCenterGroup", String(formData.get("costCenterGroup") ?? "consolidado"));
    router.push(`/financeiro/dre?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={handleFilter} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="regime" className="block text-xs text-foreground-subtle">
                Regime
              </label>
              <select id="regime" name="regime" defaultValue={regime} className={fieldClasses}>
                <option value="competencia">Competência</option>
                <option value="caixa">Caixa</option>
              </select>
            </div>
            <div>
              <label htmlFor="from" className="block text-xs text-foreground-subtle">
                Competência inicial
              </label>
              <input id="from" name="from" type="date" defaultValue={from} className={fieldClasses} />
            </div>
            <div>
              <label htmlFor="to" className="block text-xs text-foreground-subtle">
                Competência final
              </label>
              <input id="to" name="to" type="date" defaultValue={to} className={fieldClasses} />
            </div>
            <div>
              <label htmlFor="costCenterGroup" className="block text-xs text-foreground-subtle">
                Centro de custo
              </label>
              <select id="costCenterGroup" name="costCenterGroup" defaultValue={costCenterGroup} className={fieldClasses}>
                <option value="consolidado">Consolidado</option>
                <option value="estetica_automotiva">Estética Automotiva</option>
                <option value="estacionamento">Estacionamento</option>
                <option value="administrativo_geral">Administrativo/Geral</option>
              </select>
            </div>
            <Button type="submit">Aplicar</Button>
          </form>
          <p className="mt-2 text-xs text-foreground-subtle">
            Regime {regime === "competencia" ? "de competência (obrigação integral, independente da baixa)" : "de caixa (só o que efetivamente entrou/saiu)"} — nunca misturado no mesmo indicador.
          </p>
        </CardContent>
      </Card>

      {alerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2 text-sm">
              {alerts.map((alert, index) => (
                <li key={index} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                  <span className="text-foreground-muted">
                    <Badge variant="critical" className="mr-2">
                      {alertLabels[alert.level]}
                    </Badge>
                    {alert.message}
                  </span>
                  {alert.amount !== null ? <span className="font-medium text-foreground">{formatCurrency(alert.amount)}</span> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <IndicatorCard label="Margem de contribuição" value={report.margemContribuicaoPercentual} />
        <IndicatorCard label="Margem operacional" value={report.margemOperacionalPercentual} />
        <IndicatorCard label="Margem líquida" value={report.margemLiquidaPercentual} />
        <IndicatorCard label="Participação Estética" value={report.participacaoEsteticaReceita} />
        <IndicatorCard label="Participação Estacionamento" value={report.participacaoEstacionamentoReceita} />
        <IndicatorCard label="EBITDA" value={null} textOverride={report.ebitdaIndisponivelMotivo ?? undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            DRE — {formatDateBR(from)} a {formatDateBR(to)}
            {previous ? (
              <span className="ml-2 text-xs font-normal text-foreground-subtle">
                vs. {formatDateBR(previous.competenceFrom)} a {formatDateBR(previous.competenceTo)}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          <DreRow label="Receita da Estética Automotiva" group={report.receitaBrutaEstetica} />
          <DreRow label="Receita do Estacionamento" group={report.receitaBrutaEstacionamento} />
          <DreRow label="Outras receitas operacionais" group={report.receitaBrutaOutras} />
          <TotalRow label="RECEITA BRUTA" value={report.receitaBruta} previous={previous?.receitaBruta} emphasis />
          <DreRow label="(-) Deduções da receita" group={report.deducoes} negative />
          <TotalRow label="RECEITA LÍQUIDA" value={report.receitaLiquida} previous={previous?.receitaLiquida} emphasis />
          <DreRow label="(-) Custos diretos dos serviços" group={report.custosDiretos} negative />
          <TotalRow label="MARGEM DE CONTRIBUIÇÃO" value={report.margemContribuicao} previous={previous?.margemContribuicao} emphasis />
          <DreRow label="(-) Despesas operacionais" group={report.despesasOperacionais} negative />
          <TotalRow label="RESULTADO OPERACIONAL" value={report.resultadoOperacional} previous={previous?.resultadoOperacional} emphasis />
          <DreRow label="(+/-) Resultado financeiro" group={report.resultadoFinanceiro} />
          <TotalRow label="RESULTADO ANTES DOS TRIBUTOS" value={report.resultadoAntesTributos} />
          <DreRow label="(-) Tributos" group={report.tributos} negative />
          <TotalRow label="RESULTADO LÍQUIDO GERENCIAL" value={report.resultadoLiquido} previous={previous?.resultadoLiquido} emphasis final />
        </CardContent>
      </Card>

      {report.naoClassificados.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Não classificados neste período ({report.naoClassificados.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="mb-2 text-xs text-foreground-subtle">Não entram nos totais acima — classifique em /financeiro/classificacao.</p>
            <ul className="space-y-1 text-sm">
              {report.naoClassificados.slice(0, 10).map((item, i) => (
                <li key={i} className="flex items-center justify-between border-b border-border-subtle py-1">
                  <span className="text-foreground-muted">
                    {formatDateBR(item.date)} — {item.description} {item.partyName ? `(${item.partyName})` : ""}
                  </span>
                  <span className="text-foreground">{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Resultado por centro de custo</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(byCostCenter) as DreCostCenterGroup[]).map((group) => (
              <div key={group} className="rounded-lg border border-border bg-background-elevated p-3">
                <p className="text-xs text-foreground-subtle">{costCenterGroupLabels[group]}</p>
                <p className={`mt-1 text-lg font-semibold ${byCostCenter[group].resultadoOperacional < 0 ? "text-critical" : "text-foreground"}`}>
                  {formatCurrency(byCostCenter[group].resultadoOperacional)}
                </p>
                <p className="text-xs text-foreground-subtle">Resultado operacional</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicatorCard({ label, value, textOverride }: { label: string; value: number | null; textOverride?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">
        {textOverride ? <span className="text-sm font-normal text-foreground-subtle">Informação indisponível — classificação insuficiente.</span> : value !== null ? `${value}%` : "—"}
      </p>
    </div>
  );
}

function DreRow({ label, group, negative }: { label: string; group: DreGroupTotal; negative?: boolean }) {
  const [open, setOpen] = useState(false);
  if (group.items.length === 0 && group.amount === 0) {
    return (
      <div className="flex items-center justify-between py-1 text-sm text-foreground-subtle">
        <span>{label}</span>
        <span>{formatCurrency(0)}</span>
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-1 text-left text-sm hover:bg-background-elevated/50">
        <span className="flex items-center gap-1 text-foreground-muted">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {label} <span className="text-xs text-foreground-subtle">({group.items.length})</span>
        </span>
        <span className={negative ? "text-critical" : "text-foreground"}>{formatCurrency(negative ? -Math.abs(group.amount) : group.amount)}</span>
      </button>
      {open ? (
        <div className="ml-4 border-l border-border-subtle pl-3">
          {group.items.length === 0 ? (
            <EmptyState title="Sem lançamentos" />
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {group.items.map((item, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0">
                    <td className="py-1 pr-2 text-foreground-subtle">{formatDateBR(item.date)}</td>
                    <td className="py-1 pr-2 text-foreground-muted">{item.description}</td>
                    <td className="py-1 pr-2 text-foreground-subtle">{item.partyName ?? "—"}</td>
                    <td className="py-1 pr-2 text-foreground-subtle">{item.categoryName ?? "—"}</td>
                    <td className="py-1 pr-2 text-foreground-subtle">{item.costCenterName ?? "—"}</td>
                    <td className="py-1 text-right text-foreground">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TotalRow({ label, value, previous, emphasis, final }: { label: string; value: number; previous?: number; emphasis?: boolean; final?: boolean }) {
  const variation = previous !== undefined && previous !== 0 ? Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10 : null;
  return (
    <div className={`flex items-center justify-between border-t border-border-subtle py-2 ${emphasis ? "font-semibold" : ""}`}>
      <span className={final ? "text-base text-foreground" : "text-sm text-foreground"}>{label}</span>
      <div className="flex items-center gap-2">
        {variation !== null ? (
          <span className={variation >= 0 ? "text-xs text-positive" : "text-xs text-critical"}>
            {variation >= 0 ? "+" : ""}
            {variation}%
          </span>
        ) : null}
        <span className={value < 0 ? "text-critical" : "text-foreground"}>{formatCurrency(value)}</span>
      </div>
    </div>
  );
}
