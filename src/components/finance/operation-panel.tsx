import Link from "next/link";
import { Banknote, Car, DollarSign, Percent, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import { periodDisplayLabel } from "@/lib/finance/financePeriod";
import { fetchOperationOverview, type OperationKey } from "@/lib/finance/operationOverview";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { Trend } from "@/types/common";

function growthTrend(percent: number | null): Trend | undefined {
  if (percent === null) return undefined;
  return { direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat", value: percent, label: "vs. período anterior" };
}

/**
 * Missão Financeiro 5D — visão dedicada de uma operação (Lavação ou Estacionamento). Reaproveita
 * 100% do motor da DRE (`computeDreReport`, via `fetchOperationOverview`) — nenhuma lógica
 * financeira nova, só uma leitura orientada à operação. "Resultado direto" (receita da operação
 * menos custos/despesas DIRETAMENTE atribuídos a ela) é o único resultado calculado aqui — nunca
 * inclui rateio de despesas compartilhadas (aluguel, energia, contabilidade...), que ficam
 * visíveis à parte, na aba Visão Geral, como "Compartilhado/Administrativo". Ver auditoria da
 * Missão 5D: cobertura real de centro de custo em custos/despesas é hoje quase nula — por isso
 * "resultado direto" aparece como indisponível na maioria dos períodos, e isso é esperado.
 */
export async function OperationPanel({ group, period }: { group: OperationKey; period: PeriodRange }) {
  const overview = await fetchOperationOverview(group, period);
  const { report } = overview;
  const periodLabel = periodDisplayLabel(period);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border-subtle bg-background-elevated px-4 py-3 text-xs text-foreground-subtle">
        Resultado direto = receita da operação − custos/despesas diretamente atribuídos a ela (quase nunca lançados hoje com centro de custo próprio — ver auditoria da Missão Financeiro 5D).
        Despesas compartilhadas (aluguel, energia, contabilidade, marketing...) nunca são rateadas automaticamente aqui — aparecem à parte, em{" "}
        <Link href="/financeiro" className="underline">
          Visão Geral
        </Link>
        , como Compartilhado/Administrativo.
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Faturamento — {periodLabel}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Receita bruta"
            value={report.receitaBruta !== null ? formatCurrency(report.receitaBruta) : "Informação indisponível"}
            icon={DollarSign}
            hint={report.receitaBrutaIndisponivelMotivo ?? undefined}
            trend={growthTrend(overview.crescimentoReceitaPercent)}
          />
          <StatCard
            label="Receita líquida"
            value={report.receitaLiquida !== null ? formatCurrency(report.receitaLiquida) : "Informação indisponível"}
            icon={DollarSign}
          />
          <StatCard
            label={`Quantidade de ${overview.quantidade.unidade}`}
            value={overview.quantidade.value !== null ? String(overview.quantidade.value) : "Informação indisponível"}
            icon={Car}
            hint={overview.quantidade.indisponivelMotivo ?? undefined}
          />
          <StatCard
            label="Ticket médio"
            value={overview.ticketMedio !== null ? formatCurrency(overview.ticketMedio) : "Informação indisponível"}
            icon={DollarSign}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Resultado direto — {periodLabel}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Custos diretos identificados"
            value={formatCurrency(report.custosDiretos.amount)}
            icon={TrendingDown}
            hint={report.custosDiretos.items.length === 0 ? "Nenhum custo lançado com este centro de custo" : `${report.custosDiretos.items.length} lançamento(s)`}
          />
          <StatCard
            label="Despesas atribuídas"
            value={formatCurrency(report.despesasOperacionais.amount)}
            icon={TrendingDown}
            hint={report.despesasOperacionais.items.length === 0 ? "Nenhuma despesa lançada com este centro de custo" : `${report.despesasOperacionais.items.length} lançamento(s)`}
          />
          <StatCard
            label="Resultado operacional direto"
            value={report.resultadoOperacional !== null ? formatCurrency(report.resultadoOperacional) : "Informação indisponível"}
            icon={Scale}
            hint={report.resultadoOperacionalIndisponivelMotivo ?? undefined}
          />
          <StatCard
            label="Margem direta"
            value={report.margemLiquidaPercentual !== null ? `${report.margemLiquidaPercentual.toFixed(1)}%` : "Informação indisponível"}
            icon={Percent}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Participação e caixa — {periodLabel}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Participação no faturamento total"
            value={overview.participacaoFaturamento !== null ? `${overview.participacaoFaturamento.toFixed(1)}%` : "Informação indisponível"}
            icon={Percent}
          />
          <StatCard
            label="Entradas de caixa rastreáveis"
            value={overview.entradasCaixaRastreaveis !== null ? formatCurrency(overview.entradasCaixaRastreaveis) : "Informação indisponível"}
            icon={Banknote}
            hint="Regime caixa — data efetiva de recebimento, pode diferir da receita por competência acima"
          />
          <StatCard
            label="Crescimento vs. período anterior"
            value={overview.crescimentoReceitaPercent !== null ? `${overview.crescimentoReceitaPercent > 0 ? "+" : ""}${overview.crescimentoReceitaPercent.toFixed(1)}%` : "Informação indisponível"}
            icon={TrendingUp}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Composição da receita por tipo de serviço/categoria</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Unavailable label="Não disponível de forma confiável hoje — a era JumpPark (a partir de 01/05/2026) só registra o valor total por pedido, sem quebra por tipo de serviço. O período histórico (antes disso) tem o dado em texto livre na planilha, mas sem uma regra de agrupamento confiável o suficiente para exibir aqui sem risco de erro. Ver checkpoint da Missão Financeiro 5D." />
        </CardContent>
      </Card>

      {report.naoClassificados.length > 0 ? (
        <Card>
          <CardContent className="pt-4 text-xs text-warning">
            {report.naoClassificados.length} lançamento(s) deste período ainda sem classificação financeira —{" "}
            <Link href="/financeiro/classificacao" className="underline">
              revisar na fila de classificação
            </Link>
            .
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
