import Link from "next/link";
import { AlertTriangle, Boxes, ClipboardList, PackageMinus, PackagePlus, ShieldCheck, Split, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { APP_MODULES } from "@/components/navigation/app-modules";
import { ModuleShortcuts } from "@/components/navigation/module-shortcuts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { MovementRowsDrilldown } from "@/components/inventory/movement-rows-drilldown";
import { PositionRowsDrilldown } from "@/components/inventory/position-rows-drilldown";
import { fetchConsumoServicosStatus, fetchStockGerencial } from "@/lib/inventory/stockGerencial";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const STALE_BUCKET_LABEL: Record<string, string> = { "30_dias": "30+ dias", "60_dias": "60+ dias", "90_dias": "90+ dias", "180_dias": "180+ dias" };

function ShareBar({ share, tone = "critical" }: { share: number; tone?: "critical" | "warning" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-elevated">
      <div className={`h-full rounded-full ${tone === "critical" ? "bg-critical/60" : "bg-warning/60"}`} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
    </div>
  );
}

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const [result, consumoServicos] = await Promise.all([fetchStockGerencial(period), fetchConsumoServicosStatus()]);
  const { overview, comparison, position, movements, turnoverTop, turnoverBottom, noTurnover, staleGroups, consumptionByCategory, lossesByCategory, purchaseSuggestions, stocktakeSessions, dataQuality } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(result.previousPeriod.from)} a ${formatDateBR(result.previousPeriod.to)}`;
  const zeroedRows = position.filter((r) => r.status === "ZERADO");
  const currentPeriodMovements = movements.filter((m) => m.date >= period.from && m.date <= period.to);
  const suggestedPurchases = purchaseSuggestions.filter((s) => s.status === "sugerida");
  const lastStocktake = stocktakeSessions[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Gestão gerencial de materiais e produtos — entradas, saídas, consumo, custo e giro, tudo derivado de Movimentações de Estoque (inventory_movements), sem duplicar com Produtos/Compras."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/compras">Produtos/Compras</Link>
            </Button>
          </>
        }
      />

      <ModuleShortcuts shortcuts={APP_MODULES.find((m) => m.id === "estoque")!.shortcuts} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">
          Comparado com <span className="font-medium text-foreground-muted">{previousPeriodCaption}</span>
        </p>
      </div>

      {!result.hasAnyMovement ? (
        <Card className="border-warning/40">
          <CardContent className="pt-6 text-sm text-foreground-muted">
            <p className="font-medium text-foreground">Nenhuma movimentação de estoque registrada.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* 1. Visão geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Produtos cadastrados" value={String(overview.productCount)} icon={Boxes} />
        <StatCard label="Produtos com saldo" value={String(overview.productsWithBalance)} icon={Boxes} />
        <StatCard
          label="Produtos zerados"
          value={String(overview.productsZeroed)}
          icon={AlertTriangle}
          detail={
            <div className="space-y-4">
              <CalculationNote source="Movimentações de Estoque (inventory_movements)" formula="Produtos com saldo atual igual a zero" period="Situação atual (não depende do período selecionado)" recordsUsed={`${overview.productsZeroed} produto(s)`} />
              <PositionRowsDrilldown rows={zeroedRows} />
            </div>
          }
        />
        <StatCard
          label="Abaixo do mínimo"
          value={String(overview.productsBelowMinimum)}
          icon={ShieldCheck}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque (inventory_movements) + estoque mínimo cadastrado por produto"
                formula="Saldo atual ≤ estoque mínimo cadastrado — só considera produtos com mínimo definido, nunca infere um mínimo"
                period="Situação atual"
                recordsUsed={`${overview.productsBelowMinimum} produto(s) com mínimo configurado e abaixo dele`}
                limitations="Produtos sem estoque mínimo cadastrado nunca entram nesta contagem, mesmo que o saldo esteja baixo."
              />
              <PositionRowsDrilldown rows={position.filter((r) => r.status === "CRITICO")} />
            </div>
          }
        />
        <StatCard
          label="Valor do estoque"
          value={formatCurrency(overview.totalStockValue.knownValue)}
          icon={Wallet}
          hint={overview.totalStockValue.itemsWithoutCost > 0 ? `${overview.totalStockValue.itemsWithoutCost} produto(s) sem custo, não incluído(s)` : undefined}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Custo médio ponderado cadastrado por produto (weighted-average-cost.ts, atualizado a cada entrada com preço) × saldo atual"
                formula="Soma de (custo médio × saldo) de cada produto com custo cadastrado — nunca estima valor para produto sem custo"
                period="Situação atual"
                recordsUsed={`${overview.productCount - overview.totalStockValue.itemsWithoutCost} de ${overview.productCount} produto(s) com custo cadastrado`}
                recordsIgnored={overview.totalStockValue.itemsWithoutCost > 0 ? `${overview.totalStockValue.itemsWithoutCost} produto(s) sem custo médio cadastrado — não contam neste total, nunca tratados como custo zero` : null}
                limitations="Custo de aquisição, nunca preço de venda — são coisas diferentes e nunca misturadas aqui."
              />
              <PositionRowsDrilldown rows={position.filter((r) => r.stockValue !== null).sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0))} />
            </div>
          }
        />
        <StatCard
          label="Entradas no período"
          value={String(overview.entriesCount)}
          icon={PackagePlus}
          trend={comparisonToTrend(comparison.entriesCount)}
          hint={`${overview.entriesQuantity} unidade(s) somadas`}
          detail={
            <div className="space-y-4">
              <CalculationNote source="Movimentações de Estoque, tipos entrada/compra" formula="Contagem de movimentações de entrada/compra com data no período" period={periodCaption} recordsUsed={`${overview.entriesCount} movimentação(ões)`} />
              <MovementRowsDrilldown rows={currentPeriodMovements.filter((m) => m.type === "entrada" || m.type === "compra")} />
            </div>
          }
        />
        <StatCard
          label="Saídas no período"
          value={String(overview.exitsCount)}
          icon={PackageMinus}
          trend={comparisonToTrend(comparison.exitsCount)}
          hint={`${overview.exitsQuantity} unidade(s) somadas`}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque, tipos saída/consumo/teste-calibração"
                formula="Contagem de movimentações de uso produtivo com data no período — perdas ficam de fora (ver card 'Perdas')"
                period={periodCaption}
                recordsUsed={`${overview.exitsCount} movimentação(ões)`}
              />
              <MovementRowsDrilldown rows={currentPeriodMovements.filter((m) => m.type === "saida" || m.type === "consumo_interno" || m.type === "consumo_teste_calibracao")} />
            </div>
          }
        />
        <StatCard
          label="Perdas no período"
          value={String(overview.lossesCount)}
          icon={Trash2}
          trend={comparisonToTrend(comparison.lossesCount)}
          hint={`${overview.lossesQuantity} unidade(s) somadas`}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque, tipos perda/avaria/vencimento/descarte"
                formula="Contagem de movimentações de saída sem uso produtivo, com data no período"
                period={periodCaption}
                recordsUsed={`${overview.lossesCount} movimentação(ões)`}
              />
              <MovementRowsDrilldown rows={currentPeriodMovements.filter((m) => m.type === "perda" || m.type === "avaria" || m.type === "vencimento" || m.type === "descarte")} />
            </div>
          }
        />
        <StatCard
          label="Ajustes no período"
          value={String(overview.adjustmentsCount)}
          icon={Split}
          detail={
            <div className="space-y-4">
              <CalculationNote
                source="Movimentações de Estoque, tipos ajuste positivo/negativo/inventário/correção"
                formula="Contagem de movimentações de ajuste ou correção de inventário com data no período"
                period={periodCaption}
                recordsUsed={`${overview.adjustmentsCount} movimentação(ões)`}
              />
              <MovementRowsDrilldown rows={currentPeriodMovements.filter((m) => m.type === "ajuste_positivo" || m.type === "ajuste_negativo" || m.type === "ajuste_inventario" || m.type === "correcao_inventario")} />
            </div>
          }
        />
        <StatCard label="Sem nenhuma movimentação" value={String(overview.productsWithoutAnyMovement)} icon={ClipboardList} hint="nunca movimentados, nem a carga inicial" />
        <StatCard label="Valor movimentado no período" value={formatCurrency(comparison.movedValue.current)} icon={TrendingDown} trend={comparisonToTrend(comparison.movedValue)} hint="entradas + saídas + perdas, ao custo médio" />
      </div>

      {/* 2. Giro de estoque */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Maior giro (vitalício)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {turnoverTop.length === 0 ? (
              <EmptyState title="Sem dados suficientes" description="Nenhum produto teve saída/consumo registrado ainda." />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {turnoverTop.map((t) => (
                  <li key={t.itemId} className="flex items-center justify-between">
                    <Link href={`/estoque/produtos/${t.itemId}`} className="text-foreground hover:text-accent">
                      {t.itemName}
                    </Link>
                    <span className="text-foreground-muted">
                      {t.reductionQuantity} {t.unit} ({t.reductionCount}x)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Menor giro (com alguma saída)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {turnoverBottom.length === 0 ? (
              <EmptyState title="Sem dados suficientes" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {turnoverBottom.map((t) => (
                  <li key={t.itemId} className="flex items-center justify-between">
                    <Link href={`/estoque/produtos/${t.itemId}`} className="text-foreground hover:text-accent">
                      {t.itemName}
                    </Link>
                    <span className="text-foreground-muted">
                      {t.reductionQuantity} {t.unit} ({t.reductionCount}x)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sem giro ({noTurnover.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground-subtle">Produtos com zero saída/consumo/perda registrada até hoje — nenhuma redução real de estoque.</p>
            <div className="mt-2">
              <DrillDownDialog trigger={`Ver os ${noTurnover.length} produtos`} title="Produtos sem giro" description="Nenhuma movimentação de redução (saída/consumo/perda) registrada">
                <PositionRowsDrilldown rows={position.filter((r) => noTurnover.some((t) => t.itemId === r.itemId))} />
              </DrillDownDialog>
            </div>
          </CardContent>
        </Card>
      </div>
      <CalculationNote
        source="Movimentações de Estoque — tipos de redução real (saída, consumo, teste/calibração, perda, avaria, vencimento, descarte)"
        formula="Ranking por quantidade total reduzida, histórico vitalício (não restrito ao período selecionado acima). 'Sem giro' = produtos com contagem zero nesse ranking."
        period="Histórico vitalício"
        recordsUsed={`${turnoverTop.length + turnoverBottom.length} produto(s) com giro, ${noTurnover.length} sem giro`}
        limitations="Não é uma métrica de 'giro contábil' (custo da mercadoria vendida ÷ estoque médio) — é uma contagem direta de redução real de saldo, mais simples e mais honesta com o volume de dados atual."
      />

      {/* 3. Produtos parados */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos parados</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {staleGroups.map((g) => (
              <div key={g.bucket} className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">{STALE_BUCKET_LABEL[g.bucket]} sem movimentação</p>
                <p className="text-lg font-semibold text-foreground">{g.items.length}</p>
                {g.items.length > 0 ? (
                  <div className="mt-1">
                    <DrillDownDialog trigger="Ver produtos" title={`Parados há ${STALE_BUCKET_LABEL[g.bucket]}`} triggerClassName="text-xs">
                      <PositionRowsDrilldown rows={g.items} />
                    </DrillDownDialog>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3">
            <CalculationNote
              source="Última movimentação real de cada produto (qualquer tipo), comparada à data de hoje"
              formula="Dias corridos desde a última movimentação — cada produto entra só no bucket mais severo aplicável (ex.: 95 dias entra em '90+ dias', não em '30+ dias' também)"
              period="Situação atual"
              recordsUsed={`${position.length} produto(s) avaliados`}
              limitations="Produto nunca movimentado (nem a carga inicial) entra direto no bucket '180+ dias'."
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Consumo por categoria */}
      <Card>
        <CardHeader>
          <CardTitle>Consumo por categoria no período ({consumptionByCategory.reduce((s, c) => s + c.count, 0)})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {consumptionByCategory.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum consumo operacional (saída/consumo/teste) registrado no período.</p>
          ) : (
            consumptionByCategory.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {c.category} ({c.count})
                  </span>
                  <span className="font-medium text-foreground">
                    {c.estimatedCost > 0 || c.itemsWithoutCost === 0 ? formatCurrency(c.estimatedCost) : "Sem dado"} <span className="text-xs text-foreground-subtle">({formatPercent(c.share, 1)})</span>
                  </span>
                </div>
                <ShareBar share={c.share} />
              </div>
            ))
          )}
          <CalculationNote
            source="Movimentações de Estoque, tipos saída/consumo/teste-calibração"
            formula="Custo estimado = quantidade consumida × custo médio do produto no momento da consulta (não o custo histórico da data da movimentação)"
            period={periodCaption}
            recordsUsed={`${consumptionByCategory.reduce((s, c) => s + c.count, 0)} movimentação(ões)`}
            limitations="Produtos sem custo médio cadastrado entram na quantidade, nunca no valor em R$."
          />
        </CardContent>
      </Card>

      {/* 5. Perdas */}
      <Card>
        <CardHeader>
          <CardTitle>Perdas por categoria no período ({lossesByCategory.reduce((s, c) => s + c.count, 0)})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {lossesByCategory.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma perda (perda/avaria/vencimento/descarte) registrada no período.</p>
          ) : (
            lossesByCategory.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {c.category} ({c.count})
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(c.estimatedCost)}</span>
                </div>
                <ShareBar share={c.share} />
              </div>
            ))
          )}
          <CalculationNote
            source="Movimentações de Estoque, tipos perda/avaria/vencimento/descarte"
            formula="Custo estimado = quantidade × custo médio atual do produto. Participação = % do custo estimado total de perdas nesta categoria."
            period={periodCaption}
            recordsUsed={`${lossesByCategory.reduce((s, c) => s + c.count, 0)} movimentação(ões)`}
          />
        </CardContent>
      </Card>

      {/* 6. Necessidade de reposição */}
      <Card>
        <CardHeader>
          <CardTitle>Necessidade de reposição ({suggestedPurchases.length} sugerida(s))</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {suggestedPurchases.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma reposição sugerida no momento, com os dados disponíveis.</p>
          ) : (
            <ul className="space-y-2">
              {suggestedPurchases.slice(0, 8).map((s) => (
                <li key={s.item.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <Link href={`/estoque/produtos/${s.item.id}`} className="font-medium text-foreground hover:text-accent">
                      {s.item.name}
                    </Link>
                    <span className="text-foreground-muted">Sugerido: {s.suggestedQuantity}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-subtle">{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/compras-sugeridas">Ver lista completa de compras sugeridas</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 7. Inventário físico */}
      <Card>
        <CardHeader>
          <CardTitle>Inventário físico</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!lastStocktake ? (
            <p className="text-sm text-foreground-subtle">Nenhuma contagem física registrada ainda.</p>
          ) : (
            <div className="text-sm">
              <p className="text-foreground">
                Última contagem: <span className="font-medium">{formatDateBR(lastStocktake.date)}</span> — {lastStocktake.lines.length} linha(s), {lastStocktake.responsible ?? "responsável não informado"}
              </p>
              <p className="mt-1 text-xs text-foreground-subtle">
                Diferença positiva total: {lastStocktake.totalPositiveDifference} · Diferença negativa total: {lastStocktake.totalNegativeDifference}
              </p>
            </div>
          )}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/contagem">Registrar/ver contagens</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 8. Consumo x Serviços */}
      <Card>
        <CardHeader>
          <CardTitle>Consumo × Serviços realizados</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2">
            <Badge variant={consumoServicos.hasReliableData ? "positive" : "outline"}>{consumoServicos.hasReliableData ? "Dados confiáveis" : "Dados insuficientes"}</Badge>
            <span className="text-sm text-foreground-muted">{consumoServicos.confirmationCount} confirmação(ões) real(is)</span>
          </div>
          <p className="mt-2 text-sm text-foreground-subtle">{consumoServicos.explanation}</p>
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/consumos">Ver confirmações de consumo</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 9. Qualidade dos dados */}
      <Card>
        <CardHeader>
          <CardTitle>Qualidade dos dados — índice {dataQuality.healthIndex.overallScore}/100</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Saldo negativo</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.dataQuality.summary.negativeBalance}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Sem custo cadastrado</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.dataQuality.summary.withoutCost}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Possíveis duplicidades não revisadas</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.unresolvedDuplicateCount}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Unidade possivelmente inconsistente</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.dataQuality.summary.inconsistentUnit}</p>
            </div>
          </div>
          {dataQuality.healthIndex.topActions.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-foreground-subtle">
              {dataQuality.healthIndex.topActions.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque/auditoria">Ver auditoria completa</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 10. Módulos */}
      <Card>
        <CardHeader>
          <CardTitle>Módulos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button asChild variant="outline">
            <Link href="/estoque/posicao">Posição atual</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/produtos">Produtos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/entradas">
              <PackagePlus className="h-4 w-4" />
              Entradas
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/saidas">
              <PackageMinus className="h-4 w-4" />
              Saídas
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/movimentacoes">Movimentações</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/contagem">Contagem física</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/receitas">Receitas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/calibracao">Calibração</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/mapeamentos">Mapeamentos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/pendencias">Pendências</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/compras-sugeridas">Compras sugeridas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/auditoria">
              <ShieldCheck className="h-4 w-4" />
              Auditoria do estoque
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/compras">
              <TrendingUp className="h-4 w-4" />
              Produtos/Compras
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
