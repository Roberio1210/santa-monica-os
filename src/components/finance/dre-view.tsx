"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { computeDreVariationPercent } from "@/lib/finance/dre";
import { DreMonthlyChart } from "@/components/finance/dre-monthly-chart";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { AccountingAlert, DreCoverage, DreMonthlyPoint, DrePendencyOverview } from "@/lib/finance/service";
import type { RevenueReconciliation } from "@/lib/finance/revenueReconciliation";
import type { ClassificationSourceKind, DreCostCenterGroup, DreGroupTotal, DreRegime, DreReport } from "@/lib/finance/types";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const costCenterGroupLabels: Record<DreCostCenterGroup, string> = {
  estetica_automotiva: "Estética Automotiva",
  estacionamento: "Estacionamento",
  administrativo_geral: "Administrativo/Geral",
};

/** Missão V3.1 — coluna "Fonte" do drill-down, para o gestor distinguir receita real do JumpPark de lançamentos vindos de conciliação bancária/AR manual. */
const sourceKindLabels: Record<ClassificationSourceKind, string> = {
  accounts_payable: "Contas a Pagar",
  accounts_receivable: "Contas a Receber",
  cash_movement: "Movimentação de Caixa",
  account_transfer: "Transferência entre Contas",
  jumppark_service_order: "JumpPark",
  stone_fee: "Stone (custo real)",
  historical_spreadsheet_revenue: "Planilha histórica",
};

const regimeLabels: Record<DreRegime, string> = {
  gerencial: "usa a competência confirmada quando ela existe, e a data do movimento de caixa quando não existe — regime híbrido",
  competencia: "de competência (obrigação integral, independente da baixa)",
  caixa: "de caixa (só o que efetivamente entrou/saiu)",
};

const alertLabels: Record<AccountingAlert["level"], string> = {
  margem_negativa: "Margem negativa",
  resultado_operacional_negativo: "Resultado operacional negativo",
  centro_custo_negativo: "Centro de custo negativo",
  despesa_compartilhada_sem_rateio: "Despesa compartilhada sem rateio",
  competencia_proxima_fechamento: "Competência próxima do fechamento",
  aumento_despesa_relevante: "Aumento relevante de despesa",
  periodo_parcial: "Período parcial",
  cobertura_baixa: "Cobertura baixa (heurística)",
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
  monthlySeries: DreMonthlyPoint[];
  pendencyOverview: DrePendencyOverview;
  coverage: DreCoverage;
  revenueReconciliation: RevenueReconciliation;
}

export function DreView({ report, previous, byCostCenter, alerts, regime, from, to, costCenterGroup, monthlySeries, pendencyOverview, coverage, revenueReconciliation }: DreViewProps) {
  const router = useRouter();

  /**
   * Missão V4.2 — "Estética Automotiva TOTAL" = clientes comuns (receitaBrutaEstetica) + parcerias
   * corporativas (receitaBrutaParceriasCorporativas). Puramente derivado para exibição — nenhum
   * cálculo novo, nenhum valor alterado; segue a mesma regra "ausência de dado ≠ zero" do resto da
   * DRE (null quando `receitaBruta` não é calculável no período).
   */
  const esteticaAutomotivaTotal = report.receitaBruta === null ? null : Math.round((report.receitaBrutaEstetica.amount + report.receitaBrutaParceriasCorporativas.amount) * 100) / 100;
  const previousEsteticaAutomotivaTotal = previous
    ? previous.receitaBruta === null
      ? null
      : Math.round((previous.receitaBrutaEstetica.amount + previous.receitaBrutaParceriasCorporativas.amount) * 100) / 100
    : undefined;

  function handleFilter(formData: FormData) {
    const params = new URLSearchParams();
    params.set("regime", String(formData.get("regime") ?? "gerencial"));
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
                <option value="gerencial">Gerencial (híbrido)</option>
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
          <p className="mt-2 text-xs text-foreground-subtle">Regime {regimeLabels[regime]} — nunca misturado com os outros regimes no mesmo indicador.</p>
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

      {/* Exatamente os 5 cards pedidos pela Missão V3.0 — demais indicadores (participações, EBITDA) ficam na seção "Mais indicadores" abaixo, não aqui. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Receita Operacional" amount={report.receitaBruta} motivo={report.receitaBrutaIndisponivelMotivo} />
        <KpiCard label="Margem Bruta" amount={report.margemContribuicao} percent={report.margemContribuicaoPercentual} motivo={report.margemContribuicaoIndisponivelMotivo} />
        <KpiCard label="Resultado Operacional" amount={report.resultadoOperacional} percent={report.margemOperacionalPercentual} motivo={report.resultadoOperacionalIndisponivelMotivo} />
        <KpiCard label="Resultado Gerencial" amount={report.resultadoLiquido} percent={report.margemLiquidaPercentual} motivo={report.resultadoOperacionalIndisponivelMotivo} />
        <KpiCard label="Mão de Obra" amount={report.maoDeObraTotal} percent={report.maoDeObraPercentualReceitaLiquida} motivo={report.maoDeObraIndisponivelMotivo} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mais indicadores</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <IndicatorCard label="Participação Estética — Clientes comuns" value={report.participacaoEsteticaReceita} />
            <IndicatorCard label="Participação Estacionamento" value={report.participacaoEstacionamentoReceita} />
            <IndicatorCard label="Participação Parcerias Corporativas" value={report.participacaoParceriasReceita} />
            <PlainIndicatorCard label="Mão de obra operacional" amount={report.maoDeObraOperacional} motivo={report.maoDeObraIndisponivelMotivo} />
            <IndicatorCard label="Cobertura da DRE (por valor)" value={coverage.valuePercent} textOverride={coverage.valuePercent === null ? "Nenhum lançamento no período." : undefined} />
            <IndicatorCard label="EBITDA" value={null} textOverride={report.ebitdaIndisponivelMotivo ?? undefined} />
          </div>
        </CardContent>
      </Card>

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
          {/*
            Missão V4.2 — hierarquia gerencial explícita: "Receita da Estética Automotiva" sozinha
            representa só clientes comuns, NUNCA a atividade inteira (achado da correção do
            fechamento IESA de julho/2026, que estava fora dessa linha). "Estética Automotiva TOTAL"
            é clientes comuns + parcerias corporativas — soma pura de dois valores já existentes no
            relatório, calculada aqui só para exibição, nunca uma fonte nova de cálculo financeiro.
          */}
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Estética Automotiva</p>
          <DreRow label="Clientes comuns" group={report.receitaBrutaEstetica} indent />
          <DreRow label="Parcerias corporativas (ex.: IESA/Nissan)" group={report.receitaBrutaParceriasCorporativas} indent />
          <TotalRow label="ESTÉTICA AUTOMOTIVA TOTAL" value={esteticaAutomotivaTotal} previous={previousEsteticaAutomotivaTotal} motivo={report.receitaBrutaIndisponivelMotivo} />
          <DreRow label="Receita do Estacionamento" group={report.receitaBrutaEstacionamento} />
          <DreRow label="Outras receitas operacionais" group={report.receitaBrutaOutras} />
          <TotalRow label="RECEITA BRUTA (RECEITA OPERACIONAL TOTAL)" value={report.receitaBruta} previous={previous?.receitaBruta} motivo={report.receitaBrutaIndisponivelMotivo} emphasis />
          <DreRow label="(-) Deduções da receita" group={report.deducoes} negative />
          <TotalRow label="RECEITA LÍQUIDA" value={report.receitaLiquida} previous={previous?.receitaLiquida} motivo={report.receitaBrutaIndisponivelMotivo} emphasis />
          <DreRow label="(-) Custos diretos dos serviços" group={report.custosDiretos} negative />
          <TotalRow label="LUCRO BRUTO (Margem de contribuição)" value={report.margemContribuicao} previous={previous?.margemContribuicao} motivo={report.margemContribuicaoIndisponivelMotivo} emphasis />
          <DreRow label="(-) Despesas operacionais" group={report.despesasOperacionais} negative />
          <TotalRow label="RESULTADO OPERACIONAL" value={report.resultadoOperacional} previous={previous?.resultadoOperacional} motivo={report.resultadoOperacionalIndisponivelMotivo} emphasis />
          <DreRow label="(+/-) Resultado financeiro" group={report.resultadoFinanceiro} />
          <TotalRow label="RESULTADO ANTES DOS TRIBUTOS" value={report.resultadoAntesTributos} motivo={report.resultadoOperacionalIndisponivelMotivo} />
          <DreRow label="(-) Tributos" group={report.tributos} negative />
          <TotalRow label="RESULTADO GERENCIAL" value={report.resultadoLiquido} previous={previous?.resultadoLiquido} motivo={report.resultadoOperacionalIndisponivelMotivo} emphasis final />
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-border-subtle pt-2 text-xs text-foreground-subtle">
            <span>Mão de obra (Salários CLT + Prestadores PJ, incluída dentro das linhas acima — não é uma linha adicional)</span>
            <span className="font-medium text-foreground">
              {report.maoDeObraTotal === null ? "Não calculável" : formatCurrency(report.maoDeObraTotal)}
              {report.maoDeObraPercentualReceitaLiquida !== null ? ` (${report.maoDeObraPercentualReceitaLiquida}% da receita líquida)` : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal {monthlySeries.length > 0 ? `— ${formatMonthRangeLabel(monthlySeries)}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DreMonthlyChart points={monthlySeries} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-left text-foreground-subtle">
                  <th className="py-1 pr-2 font-normal">Mês</th>
                  <th className="py-1 pr-2 font-normal text-right">Receita bruta</th>
                  <th className="py-1 pr-2 font-normal text-right">Resultado operacional</th>
                  <th className="py-1 font-normal text-right">Resultado gerencial</th>
                </tr>
              </thead>
              <tbody>
                {monthlySeries.map((point) => (
                  <tr key={point.month} className="border-b border-border-subtle last:border-0">
                    <td className="py-1 pr-2 text-foreground-muted">{formatMonthLabelBR(point.month)}</td>
                    <MonthlyValueCell value={point.report.receitaBruta} />
                    <MonthlyValueCell value={point.report.resultadoOperacional} />
                    <MonthlyValueCell value={point.report.resultadoLiquido} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conciliação: Faturamento (JumpPark) × Recebimento (Stone)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-foreground-subtle">
            Faturamento e recebimento medem coisas diferentes por definição — datas diferentes (visita × liquidação bancária) e o dinheiro nunca passa pelo Stone. A diferença abaixo é um indicador
            gerencial e de conciliação, nunca um erro a ser zerado.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PlainIndicatorCard label="Faturamento Operacional (JumpPark)" amount={revenueReconciliation.faturamentoOperacional} motivo={revenueReconciliation.faturamentoOperacional === null ? "Sem receita calculável no período." : undefined} />
            <PlainIndicatorCard label="— dos quais em Dinheiro" amount={revenueReconciliation.faturamentoDinheiro} />
            <PlainIndicatorCard label="Recebimentos/Liquidações Stone" amount={revenueReconciliation.recebimentosStone} />
            <PendencyStat
              label="Diferença (Faturamento − Recebido)"
              percent={revenueReconciliation.diferencaPercent}
              detail={revenueReconciliation.diferenca === null ? "Não calculável" : formatCurrency(revenueReconciliation.diferenca)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pendências e cobertura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-foreground-subtle">
            Nenhum valor pendente entra nos totais da DRE acima. Cobertura por contagem e por valor — valor é o indicador gerencialmente mais relevante (uma linha pequena pendente pesa igual a uma
            grande na contagem, mas não no valor).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PendencyStat label="Cobertura por contagem" percent={coverage.countPercent} detail={`${coverage.countClassified} de ${coverage.countTotal} lançamentos`} />
            <PendencyStat label="Cobertura por valor" percent={coverage.valuePercent} detail={`${formatCurrency(coverage.valueClassified)} de ${formatCurrency(coverage.valueTotal)}`} />
            <PendencyStat
              label="Não classificados na DRE"
              percent={null}
              detail={`${pendencyOverview.dreNaoClassificados.count} lançamentos — ${formatCurrency(pendencyOverview.dreNaoClassificados.value)}`}
            />
            <PendencyStat
              label="Extrato bancário a classificar"
              percent={null}
              detail={`${pendencyOverview.extratoAClassificar.count} linhas — ${formatCurrency(pendencyOverview.extratoAClassificar.value)}`}
            />
          </div>
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
            {(Object.keys(byCostCenter) as DreCostCenterGroup[]).map((group) => {
              const resultado = byCostCenter[group].resultadoOperacional;
              return (
                <div key={group} className="rounded-lg border border-border bg-background-elevated p-3">
                  <p className="text-xs text-foreground-subtle">{costCenterGroupLabels[group]}</p>
                  {resultado === null ? (
                    <p className="mt-1 text-sm font-normal text-foreground-subtle">Não calculável — {byCostCenter[group].resultadoOperacionalIndisponivelMotivo}</p>
                  ) : (
                    <p className={`mt-1 text-lg font-semibold ${resultado < 0 ? "text-critical" : "text-foreground"}`}>{formatCurrency(resultado)}</p>
                  )}
                  <p className="text-xs text-foreground-subtle">Resultado operacional</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Um dos 5 cards mandatórios da Missão V3.0 — sempre mostra o valor em R$; o % (quando informado) é secundário. */
function KpiCard({ label, amount, percent, motivo }: { label: string; amount: number | null; percent?: number | null; motivo?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      {amount === null ? (
        <p className="mt-1 text-sm font-normal text-foreground-subtle">Não calculável{motivo ? ` — ${motivo}` : ""}</p>
      ) : (
        <>
          <p className={`mt-1 text-lg font-semibold ${amount < 0 ? "text-critical" : "text-foreground"}`}>{formatCurrency(amount)}</p>
          {percent !== undefined && percent !== null ? <p className="text-xs text-foreground-subtle">{percent}% da receita</p> : null}
        </>
      )}
    </div>
  );
}

function PlainIndicatorCard({ label, amount, motivo }: { label: string; amount: number | null; motivo?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">
        {amount === null ? <span className="text-sm font-normal text-foreground-subtle">Não calculável{motivo ? ` — ${motivo}` : ""}</span> : formatCurrency(amount)}
      </p>
    </div>
  );
}

const MONTH_NAMES_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonthLabelBR(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTH_NAMES_BR[Number(m) - 1]}/${year.slice(2)}`;
}

function formatMonthRangeLabel(points: { month: string }[]): string {
  if (points.length === 0) return "";
  return `${formatMonthLabelBR(points[0].month)} a ${formatMonthLabelBR(points[points.length - 1].month)}`;
}

function MonthlyValueCell({ value }: { value: number | null }) {
  return (
    <td className={`py-1 text-right ${value === null ? "text-foreground-subtle" : value < 0 ? "text-critical" : "text-foreground"}`}>
      {value === null ? "não calculável" : formatCurrency(value)}
    </td>
  );
}

function PendencyStat({ label, percent, detail }: { label: string; percent: number | null; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{percent !== null ? `${percent}%` : "—"}</p>
      <p className="text-xs text-foreground-subtle">{detail}</p>
    </div>
  );
}

function IndicatorCard({ label, value, textOverride }: { label: string; value: number | null; textOverride?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">
        {textOverride ? <span className="text-sm font-normal text-foreground-subtle">Não calculável — {textOverride}</span> : value !== null ? `${value}%` : "—"}
      </p>
    </div>
  );
}

/**
 * Sempre mostra a contagem real de lançamentos, mesmo quando é 0 — "Despesas operacionais (0)"
 * deixa explícito que é uma CONTAGEM real de zero lançamentos, nunca escondida atrás de um valor
 * em R$ que pareceria uma confirmação de "gasto zero".
 */
function DreRow({ label, group, negative, indent }: { label: string; group: DreGroupTotal; negative?: boolean; indent?: boolean }) {
  const [open, setOpen] = useState(false);
  if (group.items.length === 0) {
    return (
      <div className={`flex items-center justify-between py-1 text-sm text-foreground-subtle ${indent ? "pl-4" : ""}`}>
        <span>
          {label} <span className="text-xs">(0 lançamentos)</span>
        </span>
        <span>{formatCurrency(0)}</span>
      </div>
    );
  }
  return (
    <div className={indent ? "pl-4" : undefined}>
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
                    <td className="py-1 pr-2 text-foreground-subtle">{sourceKindLabels[item.sourceKind]}</td>
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

/**
 * `value`/`previous` nulos = "não calculável" (ausência de dado, nunca R$ 0,00 fabricado) — mostra
 * o motivo real em vez de moeda, e nunca calcula variação percentual quando qualquer um dos dois
 * lados não é calculável (via `computeDreVariationPercent`, mesma regra testada em dre.test.ts).
 */
function TotalRow({ label, value, previous, motivo, emphasis, final }: { label: string; value: number | null; previous?: number | null; motivo?: string | null; emphasis?: boolean; final?: boolean }) {
  const variation = previous !== undefined ? computeDreVariationPercent(value, previous) : null;
  if (value === null) {
    return (
      <div className={`flex items-center justify-between border-t border-border-subtle py-2 ${emphasis ? "font-semibold" : ""}`}>
        <span className={final ? "text-base text-foreground" : "text-sm text-foreground"}>{label}</span>
        <span className="max-w-[60%] text-right text-xs font-normal text-foreground-subtle">Não calculável{motivo ? ` — ${motivo}` : ""}</span>
      </div>
    );
  }
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
