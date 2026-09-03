import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, Car, CreditCard, DollarSign, FileClock, Handshake, Receipt, Scale, TrendingDown, Wallet } from "lucide-react";
import { Unavailable } from "@/components/shared/unavailable";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import { saoPauloDateISO, type PeriodRange } from "@/lib/utils/timezone";
import {
  fetchAccountsPayableOverview,
  fetchAccountsReceivableOverview,
  fetchCashFlowOverview,
  fetchCashMovements,
  fetchContracts,
  fetchDreByCostCenterGroups,
  fetchDreSourceData,
} from "@/lib/finance/service";
import { fetchFinancialPeriodOverview } from "@/lib/finance/dreSnapshot";
import { periodDisplayLabel } from "@/lib/finance/financePeriod";
import { resolveContractValue } from "@/lib/finance/status";
import { fetchIesaMonthlyClosings } from "@/lib/finance/iesaClosing";
import { IesaClosingCard } from "@/components/finance/iesa-closing-card";
import type { DreLineItem } from "@/lib/finance/types";

function sumBySourceKind(items: DreLineItem[], sourceKind: DreLineItem["sourceKind"]): number {
  return Math.round(items.filter((i) => i.sourceKind === sourceKind).reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
}

/**
 * Missão Financeiro 5C, item 3 — a Visão Geral passa a ter duas seções claramente separadas:
 * "Agora" (sempre hoje, nunca respondem ao período selecionado — caixa disponível, contas
 * vencidas, contas em aberto) e "Período: {label}" (respondem ao filtro global, via o motor
 * histórico já existente `fetchFinancialPeriodOverview`, sem nenhuma lógica de cálculo nova).
 * Nenhum indicador mostra "hoje" quando o período selecionado não é hoje — e nenhuma
 * indisponibilidade vira R$ 0,00 (ver `report.receitaBrutaIndisponivelMotivo`/`status`).
 */
export async function VisaoGeralPanel({ period }: { period: PeriodRange }) {
  const today = saoPauloDateISO();

  /**
   * Missão Financeiro 5D.7 (profiling) — `fetchDreByCostCenterGroups` não tem atalho de snapshot
   * (só a DRE consolidada tem snapshot oficial por mês; a quebra por centro de custo é sempre
   * recalculada ao vivo, mesmo padrão já usado em `/financeiro/dre`) — então ela SEMPRE precisa de
   * `fetchDreSourceData()`. Buscar aqui uma vez e reaproveitar em `fetchFinancialPeriodOverview`
   * elimina uma segunda rodada completa e idêntica de consultas ao banco (antes: até 2x; agora: no
   * máximo 1x) — nenhuma mudança de regra, só reuso do mesmo dado dentro da mesma requisição.
   */
  const sourceData = await fetchDreSourceData();

  const [{ summary: receivableSummary }, { summary: payableSummary }, cashFlowNow, cashFlowPeriod, periodOverview, contracts, iesaClosings, cashMovements, byCostCenter] = await Promise.all([
    fetchAccountsReceivableOverview(today),
    fetchAccountsPayableOverview(today),
    fetchCashFlowOverview(today),
    fetchCashFlowOverview(today, period.from, period.to),
    fetchFinancialPeriodOverview(period.from, period.to, sourceData),
    fetchContracts(),
    fetchIesaMonthlyClosings(),
    fetchCashMovements(),
    fetchDreByCostCenterGroups("gerencial", period.from, period.to, sourceData),
  ]);

  const { report, status } = periodOverview;
  const periodLabel = periodDisplayLabel(period);

  const iesaReceivableOpen = iesaClosings
    .filter((c) => c.outstandingAmount !== null && c.billingStatus !== "paid" && c.billingStatus !== "cancelled")
    .reduce((sum, c) => sum + (c.outstandingAmount ?? 0), 0);

  const recentEntries = cashMovements
    .filter((m) => m.type === "entrada")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const allLineItems: DreLineItem[] = [
    ...report.receitaBrutaEstetica.items,
    ...report.receitaBrutaEstacionamento.items,
    ...report.receitaBrutaParceriasCorporativas.items,
    ...report.receitaBrutaOutras.items,
    ...report.custosDiretos.items,
    ...report.despesasOperacionais.items,
    ...report.resultadoFinanceiro.items,
    ...report.tributos.items,
  ];
  const receitaHistorica = sumBySourceKind(allLineItems, "historical_spreadsheet_revenue");
  const receitaJumpPark = sumBySourceKind(allLineItems, "jumppark_service_order");
  const taxasStone = sumBySourceKind(allLineItems, "stone_fee");
  const hasStoneFeeData = allLineItems.some((i) => i.sourceKind === "stone_fee");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground-muted">
          Agora
          <Badge variant="outline">sempre hoje — não muda com o período selecionado</Badge>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Caixa disponível (agora)" value={formatCurrency(cashFlowNow.dashboard.saldoGeral)} icon={Wallet} hint="Stone + Ailos + Caixa físico, saldo neste instante" />
          <StatCard
            label="Contas a receber em aberto (agora)"
            value={formatCurrency(receivableSummary.totalOpen)}
            icon={FileClock}
            hint={`${receivableSummary.count} conta(s)`}
          />
          <StatCard label="Contas a pagar pendentes (agora)" value={formatCurrency(payableSummary.totalPending)} icon={FileClock} hint={`${payableSummary.count} conta(s)`} />
          <StatCard label="Valores vencidos (agora)" value={formatCurrency(receivableSummary.totalOverdue)} icon={AlertTriangle} />
          <StatCard
            label="IESA a receber (agora)"
            value={formatCurrency(iesaReceivableOpen)}
            icon={Handshake}
            hint={`${iesaClosings.filter((c) => c.billingStatus !== "paid" && c.billingStatus !== "cancelled").length} competência(s) em aberto`}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Período: {periodLabel}</h2>

        {status.status === "fechado_oficial" ? (
          <Badge variant="positive" className="mb-3">
            Fechado oficialmente — versão {status.officialSnapshotVersion}, nunca recalculado
          </Badge>
        ) : status.status === "fonte_historica" ? (
          <Badge variant="outline" className="mb-3">
            Histórico disponível (planilha) — anterior ao JumpPark
          </Badge>
        ) : status.status === "parcial" ? (
          <Badge variant="warning" className="mb-3">
            Dados parciais — sem receita reconhecível em nenhuma fonte para este período
          </Badge>
        ) : (
          <Badge variant="outline" className="mb-3">
            Calculado a partir dos registros
          </Badge>
        )}
        {status.crossesHistoricalCutoff ? (
          <p className="mb-3 text-xs text-foreground-subtle">
            Este período cruza 01/05/2026: a parte anterior usa a planilha histórica, a parte posterior usa o JumpPark — nunca as duas fontes na mesma data.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Receita bruta"
            value={report.receitaBruta !== null ? formatCurrency(report.receitaBruta) : "Informação indisponível"}
            icon={DollarSign}
            hint={report.receitaBrutaIndisponivelMotivo ?? undefined}
          />
          <StatCard
            label="Despesas operacionais"
            value={report.despesasOperacionais.items.length > 0 ? formatCurrency(report.despesasOperacionais.amount) : "Informação indisponível"}
            icon={TrendingDown}
          />
          <StatCard
            label="Resultado líquido"
            value={report.resultadoLiquido !== null ? formatCurrency(report.resultadoLiquido) : "Informação indisponível"}
            icon={Scale}
          />
          <StatCard
            label="Taxas Stone"
            value={hasStoneFeeData ? formatCurrency(taxasStone) : "Informação indisponível"}
            icon={CreditCard}
            hint={hasStoneFeeData ? undefined : "Sem transação Stone normalizada cobrindo este período"}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Entradas de caixa no período" value={formatCurrency(cashFlowPeriod.dashboard.entradasPeriodo)} icon={Receipt} />
          <StatCard label="Saídas de caixa no período" value={formatCurrency(cashFlowPeriod.dashboard.saidasPeriodo)} icon={Banknote} />
          <StatCard label="Variação líquida no período" value={formatCurrency(cashFlowPeriod.dashboard.variacaoLiquidaPeriodo)} icon={Scale} />
          <StatCard label="Quantidade de serviços/veículos" value="Informação indisponível" icon={Car} hint="Sem contagem unificada entre planilha histórica e JumpPark" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Origem da receita — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {report.receitaBruta === null ? (
            <Unavailable label={report.receitaBrutaIndisponivelMotivo ?? "Nenhuma receita reconhecida neste período."} />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border-subtle py-2">
                <p className="text-sm text-foreground-muted">Planilha histórica (antes de 01/05/2026)</p>
                <p className="text-sm font-medium text-foreground">{receitaHistorica > 0 ? formatCurrency(receitaHistorica) : "—"}</p>
              </div>
              <div className="flex items-center justify-between border-b border-border-subtle py-2">
                <p className="text-sm text-foreground-muted">JumpPark (a partir de 01/05/2026)</p>
                <p className="text-sm font-medium text-foreground">{receitaJumpPark > 0 ? formatCurrency(receitaJumpPark) : "—"}</p>
              </div>
              <div className="flex items-center justify-between py-2">
                <p className="text-sm text-foreground-muted">Contas a receber / contratos</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(sumBySourceKind(allLineItems, "accounts_receivable"))}</p>
              </div>
              <p className="pt-1 text-xs text-foreground-subtle">
                Cada data só é reconhecida em UMA fonte (nunca as duas) — a precedência já auditada em <Link href="/financeiro?tab=dre" className="text-accent hover:underline">DRE</Link> decide qual, por data.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lavação vs. Estacionamento — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Faturamento total</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
                <p className="text-sm text-foreground-muted">Lavação</p>
                <p className="text-sm font-medium text-foreground">
                  {formatCurrency(report.receitaBrutaEstetica.amount)}
                  {report.participacaoEsteticaReceita !== null ? <span className="ml-2 text-xs text-foreground-subtle">{report.participacaoEsteticaReceita.toFixed(1)}%</span> : null}
                </p>
              </div>
              <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
                <p className="text-sm text-foreground-muted">Estacionamento</p>
                <p className="text-sm font-medium text-foreground">
                  {formatCurrency(report.receitaBrutaEstacionamento.amount)}
                  {report.participacaoEstacionamentoReceita !== null ? (
                    <span className="ml-2 text-xs text-foreground-subtle">{report.participacaoEstacionamentoReceita.toFixed(1)}%</span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <p className="text-sm text-foreground-muted">Outras receitas (parcerias corporativas + demais)</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(report.receitaBrutaParceriasCorporativas.amount + report.receitaBrutaOutras.amount)}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Resultado direto (sem rateio de despesas compartilhadas)</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
                <p className="text-sm text-foreground-muted">Resultado direto Lavação</p>
                <p className="text-sm font-medium text-foreground">
                  {byCostCenter.estetica_automotiva.resultadoOperacional !== null ? (
                    formatCurrency(byCostCenter.estetica_automotiva.resultadoOperacional)
                  ) : (
                    <Unavailable label="Indisponível — sem custo/despesa direto lançado" />
                  )}
                </p>
              </div>
              <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
                <p className="text-sm text-foreground-muted">Resultado direto Estacionamento</p>
                <p className="text-sm font-medium text-foreground">
                  {byCostCenter.estacionamento.resultadoOperacional !== null ? (
                    formatCurrency(byCostCenter.estacionamento.resultadoOperacional)
                  ) : (
                    <Unavailable label="Indisponível — sem custo/despesa direto lançado" />
                  )}
                </p>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <p className="text-sm text-foreground-muted">Compartilhado/Administrativo (não alocado por operação)</p>
                <p className="text-sm font-medium text-foreground">
                  {byCostCenter.administrativo_geral.resultadoOperacional !== null ? (
                    formatCurrency(byCostCenter.administrativo_geral.resultadoOperacional)
                  ) : (
                    <Unavailable label="Indisponível" />
                  )}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-foreground-subtle">
            Detalhamento completo de cada operação (quantidade, ticket médio, margem, participação, evolução) em{" "}
            <Link href="/financeiro?tab=lavacao" className="text-accent hover:underline">
              Lavação
            </Link>{" "}
            e{" "}
            <Link href="/financeiro?tab=estacionamento" className="text-accent hover:underline">
              Estacionamento
            </Link>
            .
          </p>
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

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Outras informações (agora)</h2>
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Contratos recorrentes</CardTitle>
              <Link href="/financeiro/contratos/novo" className="flex items-center gap-1 text-xs text-accent hover:underline">
                Novo contrato <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                      <th className="pb-2 pr-3 font-medium">Parceiro</th>
                      <th className="pb-2 pr-3 font-medium">Contrato</th>
                      <th className="pb-2 pr-3 font-medium">Vencimento</th>
                      <th className="pb-2 pr-3 font-medium">Valor vigente hoje</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => {
                      const currentValue =
                        contract.baseValue ?? (contract.valuePeriods.length > 0 ? resolveContractValue(contract.valuePeriods, today) : null);
                      return (
                        <tr key={contract.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-2 pr-3 font-medium text-foreground">{contract.partnerName}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{contract.title}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{contract.dueDay ? `dia ${contract.dueDay}` : "Não informado"}</td>
                          <td className="py-2 pr-3 text-foreground">
                            {currentValue !== null ? formatCurrency(currentValue) : <Unavailable label="Variável / sem vigência aplicável hoje" />}
                          </td>
                          <td className="py-2">
                            <Badge variant={contract.status === "ativo" ? "positive" : "outline"}>{contract.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <IesaClosingCard closings={iesaClosings} />

          <Card>
            <CardHeader>
              <CardTitle>Recebimentos recentes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {recentEntries.length === 0 ? (
                <Unavailable label="Nenhum recebimento registrado." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                        <th className="pb-2 pr-3 font-medium">Data</th>
                        <th className="pb-2 pr-3 font-medium">Descrição</th>
                        <th className="pb-2 pr-3 font-medium">Valor</th>
                        <th className="pb-2 font-medium">Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-2 pr-3 text-foreground-muted">{entry.date}</td>
                          <td className="py-2 pr-3 text-foreground-muted">{entry.description}</td>
                          <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(entry.amount)}</td>
                          <td className="py-2 text-foreground-subtle">{entry.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
