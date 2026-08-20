import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { CalculationNote } from "@/components/shared/calculation-note";
import { PeriodSelector } from "@/components/operations/period-selector";
import { BalanceEvolutionChart } from "@/components/inventory/balance-evolution-chart";
import { ItemDetailsForm } from "@/components/inventory/item-details-form";
import { ClassificationBadge } from "@/components/inventory/classification-badge";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { fetchProductDetail } from "@/lib/inventory/product-detail";
import { fetchProductStockDetail } from "@/lib/inventory/stockGerencial";
import { computeItemYield, type YieldConfidence } from "@/lib/inventory/yield";
import { parsePeriodParams, saoPauloDateISO } from "@/lib/utils/timezone";
import { CLASSIFICATION_STOCK_BEHAVIOR, itemClassificationDescriptions, STOCK_CONSUMABLE_CLASSIFICATIONS } from "@/lib/inventory/types";
import type { InventoryStatus, MovementType } from "@/lib/inventory/types";
import { getCurrentUser } from "@/lib/auth/session";

const YIELD_CONFIDENCE_LABEL: Record<YieldConfidence, string> = {
  tecnico: "Técnico (referência inicial, ainda sem amostra real)",
  gerencial: "Gerencial (estimativa administrativa, não é medição física comprovada)",
  em_calibracao: "Em calibração (amostras reais, abaixo do mínimo para aprovação)",
  calibrado: "Calibrado (receita aprovada)",
};

export const dynamic = "force-dynamic";

const STALE_BUCKET_LABEL: Record<string, string> = { "30_dias": "Parado há 30+ dias", "60_dias": "Parado há 60+ dias", "90_dias": "Parado há 90+ dias", "180_dias": "Parado há 180+ dias" };

const statusMeta: Record<InventoryStatus, { label: string; variant: "positive" | "warning" | "critical" | "outline" }> = {
  ok: { label: "OK", variant: "positive" },
  atencao: { label: "Atenção", variant: "warning" },
  comprar: { label: "Comprar", variant: "critical" },
  sem_minimo: { label: "Sem mínimo definido", variant: "outline" },
};

const movementLabels: Record<MovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste_inventario: "Ajuste de inventário",
  perda: "Perda",
  consumo_interno: "Consumo interno",
  compra: "Compra",
  contagem_fisica_inicial: "Contagem física inicial",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  avaria: "Avaria",
  vencimento: "Vencimento",
  devolucao: "Devolução",
  transferencia: "Transferência",
  consumo_teste_calibracao: "Consumo de calibração",
  correcao_inventario: "Correção de inventário",
  descarte: "Descarte",
  outros: "Outros",
};

function IndicatorCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-foreground-subtle">{hint}</p> : null}
    </Card>
  );
}

export default async function ProdutoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const rawParams = await searchParams;
  const period = parsePeriodParams(rawParams);
  const [detail, stockDetail] = await Promise.all([fetchProductDetail(id), fetchProductStockDetail(id, period)]);
  if (!detail || !stockDetail.found) notFound();

  const { item, recipes, relatedItems, lastEntryDate, lastConsumptionDate, autonomy } = detail;
  let { movements, lastPurchase } = detail;
  let { priceHistory, consumptionByPeriod, lossesByPeriod } = stockDetail;
  const { balanceEvolution, turnover, staleBucket } = stockDetail;
  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const yieldEstimate = computeItemYield(item, movements, recipes.map((r) => r.recipe), saoPauloDateISO());

  // Missão de Usuários Individuais (V5.3) — operacional nunca recebe custo/valor financeiro deste
  // produto, nem mesmo no payload enviado ao navegador. Nula na origem (depois de já ter usado o
  // dado real para o cálculo de rendimento acima, que não depende de custo) em vez de só esconder
  // na JSX: os cartões/tabelas abaixo já sabem exibir "Não informado"/"Sem dado" quando o valor é
  // null, então nenhuma ramificação de UI nova é necessária.
  const hideFinancials = (await getCurrentUser())?.role === "operacional";
  let displayItem = item;
  if (hideFinancials) {
    displayItem = { ...item, unitCost: null, stockValue: null };
    lastPurchase = lastPurchase ? { ...lastPurchase, unitPricePaid: null } : null;
    priceHistory = [];
    consumptionByPeriod = consumptionByPeriod ? { ...consumptionByPeriod, estimatedCost: null } : null;
    lossesByPeriod = lossesByPeriod ? { ...lossesByPeriod, estimatedCost: null } : null;
    movements = movements.map((m) => ({ ...m, unitPricePaid: null }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayItem.name}
        description={`${displayItem.brand} — ${displayItem.category}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {displayItem.active === false ? <Badge variant="outline">Inativo</Badge> : null}
            <ClassificationBadge classification={displayItem.classification} />
            <Badge variant={statusMeta[displayItem.status].variant}>{statusMeta[displayItem.status].label}</Badge>
            {displayItem.quantityStatus === "measurement_pending" ? <Badge variant="warning">Medição pendente</Badge> : null}
            {staleBucket ? <Badge variant="outline">{STALE_BUCKET_LABEL[staleBucket]}</Badge> : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/estoque/compras/${id}`}>Ver compras deste produto</Link>
            </Button>
          </div>
        }
      />

      <PeriodSelector period={period} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <IndicatorCard label="Saldo atual" value={`${displayItem.currentQuantity} ${displayItem.unit}`} hint={displayItem.fillPercent !== null ? `${displayItem.fillPercent}% da embalagem` : undefined} />
        <IndicatorCard label="Custo médio" value={displayItem.unitCost !== null ? formatCurrency(displayItem.unitCost) : "Não informado"} />
        <IndicatorCard label="Valor em estoque" value={displayItem.stockValue !== null ? formatCurrency(displayItem.stockValue) : "Não informado"} />
        <IndicatorCard label="Última entrada" value={lastEntryDate ? formatDateBR(lastEntryDate) : "Sem registro"} />
        <IndicatorCard label="Último consumo" value={lastConsumptionDate ? formatDateBR(lastConsumptionDate) : "Sem registro"} />
        <IndicatorCard
          label="Autonomia estimada"
          value={autonomy.services !== null ? `${autonomy.services} serviço(s)` : autonomy.reason}
          hint={autonomy.consumptionPerService !== null ? `${autonomy.consumptionPerService} ${displayItem.unit}/serviço` : undefined}
        />
        <IndicatorCard label="Estoque mínimo" value={displayItem.minimumStock !== null ? `${displayItem.minimumStock} ${displayItem.unit}` : "Estoque mínimo ainda não configurado"} />
        <IndicatorCard label="Estoque ideal" value={displayItem.idealStock !== null ? `${displayItem.idealStock} ${displayItem.unit}` : "Estoque ideal ainda não configurado"} />
        <IndicatorCard label="Última contagem" value={formatDateBR(displayItem.lastCountDate)} />
        <IndicatorCard label="Preço da última compra" value={lastPurchase?.unitPricePaid != null ? formatCurrency(lastPurchase.unitPricePaid) : "Não informado"} />
        <IndicatorCard label="Data da última compra" value={lastPurchase ? formatDateBR(lastPurchase.date) : "Sem registro"} />
      </div>

      {/* Missão de Usuários Individuais (V5.3) — edição de cadastro (custo, classificação, ativo/inativo) é exclusiva de ADMIN; nem o formulário é renderizado para operacional, então o item completo (com custo real) nunca chega ao client bundle nesta página. */}
      {!hideFinancials ? <ItemDetailsForm item={item} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Rendimento do estoque</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <IndicatorCard label="Consumo técnico/lavagem" value={yieldEstimate.technicalConsumption !== null ? `${yieldEstimate.technicalConsumption} ${displayItem.unit}` : "Não configurado"} />
            <IndicatorCard
              label="Rendimento estimado"
              value={yieldEstimate.estimatedServicesRemaining !== null ? `${yieldEstimate.estimatedServicesRemaining} lavagem(ns)` : "Não calculável"}
              hint={yieldEstimate.confidence ? YIELD_CONFIDENCE_LABEL[yieldEstimate.confidence] : "Aguardando receita/calibração"}
            />
            <IndicatorCard label="Consumo 7 dias" value={`${yieldEstimate.consumption7d} ${displayItem.unit}`} />
            <IndicatorCard label="Consumo 30 dias" value={`${yieldEstimate.consumption30d} ${displayItem.unit}`} />
            <IndicatorCard label="Média diária" value={`${yieldEstimate.avgDailyConsumption} ${displayItem.unit}/dia`} />
            <IndicatorCard label="Previsão de duração" value={yieldEstimate.forecastDays !== null ? `${yieldEstimate.forecastDays} dia(s)` : "Sem consumo recente para prever"} />
          </div>
          {yieldEstimate.confidence ? (
            <div className="mt-3">
              <Badge variant={yieldEstimate.confidence === "calibrado" ? "positive" : yieldEstimate.confidence === "em_calibracao" ? "warning" : "outline"}>
                Confiança: {YIELD_CONFIDENCE_LABEL[yieldEstimate.confidence]}
              </Badge>
            </div>
          ) : null}
          <CalculationNote
            source="Movimentações reais de redução de estoque (saída/consumo/perda) dos últimos 7/30 dias + receita técnica deste produto"
            formula="Rendimento = saldo atual ÷ consumo de referência (aprovado > calibrando > técnico, nunca inventado). Previsão de duração = saldo atual ÷ média diária dos últimos 30 dias."
            period="Hoje, últimos 7 e 30 dias"
            recordsUsed={`${movements.length} movimentação(ões) no histórico completo deste produto`}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Nome canônico" value={displayItem.name} />
            <Row label="Nome original" value={displayItem.originalName ?? "Igual ao nome canônico"} />
            <Row label="Marca" value={displayItem.brand} />
            <Row label="Categoria" value={displayItem.category} />
            <Row label="Estado físico" value={{ liquido: "Líquido", massa: "Massa", peca: "Peça" }[displayItem.physicalState]} />
            <Row label="Unidade-base" value={displayItem.unit} />
            <Row label="Embalagem" value={displayItem.packageCapacity !== null ? `${displayItem.packageCapacity} ${displayItem.unit} × ${displayItem.packageCount ?? 1}` : "Não informado"} />
            <Row label="Condição" value={displayItem.condition} />
            <Row label="Localização" value={displayItem.location ?? "Não informado"} />
            <Row label="Fornecedor" value={displayItem.supplier ?? "Não informado"} />
            <Row label="Observações" value={displayItem.notes ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos relacionados</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {relatedItems.length === 0 ? (
              <EmptyState title="Nenhum lote relacionado." description="Este é o único item cadastrado com esta marca e nome." />
            ) : (
              <ul className="space-y-2">
                {relatedItems.map((related) => (
                  <li key={related.id}>
                    <Link href={`/estoque/produtos/${related.id}`} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm hover:border-accent/50 hover:bg-background-elevated">
                      <span className="text-foreground-muted">{related.name}</span>
                      <span className="flex items-center gap-2">
                        {related.quantityStatus === "measurement_pending" ? <Badge variant="warning">Medição pendente</Badge> : null}
                        <span className="text-foreground">
                          {related.currentQuantity} {related.unit}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classificação e comportamento de estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm">
          <div className="flex items-center gap-2">
            <ClassificationBadge classification={displayItem.classification} />
          </div>
          <p className="text-foreground-muted">
            {displayItem.classification !== null
              ? itemClassificationDescriptions[displayItem.classification]
              : "Este produto ainda não tem uma classificação definida — controle de quantidade e elegibilidade de compra/consumo automático ficam indeterminados até que o gestor classifique."}
          </p>
          {displayItem.classification !== null ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border-subtle pt-2 sm:grid-cols-2">
              <Row label="Controla quantidade em estoque" value={CLASSIFICATION_STOCK_BEHAVIOR[displayItem.classification].tracksQuantity ? "Sim" : "Não"} />
              <Row label="Elegível para compra/entrada" value={CLASSIFICATION_STOCK_BEHAVIOR[displayItem.classification].tracksQuantity ? "Sim" : "Não"} />
              <Row label="Baixa automática por receita de serviço" value={STOCK_CONSUMABLE_CLASSIFICATIONS.includes(displayItem.classification) ? "Sim" : "Não"} />
              <Row label="Unidade de controle" value={displayItem.unit} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Histórico de preços</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {priceHistory.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhuma compra/entrada com preço informado registrada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                      <th className="pb-2 pr-3 font-medium">Data</th>
                      <th className="pb-2 pr-3 font-medium">Preço unit.</th>
                      <th className="pb-2 font-medium">Fornecedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...priceHistory].reverse().map((p) => (
                      <tr key={`${p.date}-${p.unitPrice}`} className="border-b border-border-subtle last:border-0">
                        <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(p.date)}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(p.unitPrice)}</td>
                        <td className="py-2 text-foreground-muted">{p.supplier ?? "Não informado"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução do saldo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {balanceEvolution.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhuma movimentação registrada ainda.</p>
            ) : (
              <BalanceEvolutionChart points={balanceEvolution} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Consumo no período</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!consumptionByPeriod ? (
              <p className="text-sm text-foreground-subtle">Nenhum consumo operacional no período selecionado.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  {consumptionByPeriod.quantity} {displayItem.unit} em {consumptionByPeriod.count} movimentação(ões)
                </p>
                <p className="text-foreground-muted">Custo estimado: {consumptionByPeriod.estimatedCost !== null ? formatCurrency(consumptionByPeriod.estimatedCost) : "Sem dado"}</p>
              </div>
            )}
            <p className="mt-2 text-xs text-foreground-subtle">Período: {periodCaption}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perdas no período</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!lossesByPeriod ? (
              <p className="text-sm text-foreground-subtle">Nenhuma perda no período selecionado.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  {lossesByPeriod.quantity} {displayItem.unit} em {lossesByPeriod.count} movimentação(ões)
                </p>
                <p className="text-foreground-muted">Custo estimado: {lossesByPeriod.estimatedCost !== null ? formatCurrency(lossesByPeriod.estimatedCost) : "Sem dado"}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Giro (vitalício)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground">
              {turnover.reductionQuantity} {displayItem.unit} reduzido(s) em {turnover.reductionCount} movimentação(ões)
            </p>
            <p className="mt-1 text-xs text-foreground-subtle">{turnover.lastReductionDate ? `Última redução: ${formatDateBR(turnover.lastReductionDate)}` : "Nenhuma redução registrada ainda"}</p>
          </CardContent>
        </Card>
      </div>
      <CalculationNote
        source="Movimentações de Estoque deste produto"
        formula="Consumo = saída/consumo/teste no período; Perdas = perda/avaria/vencimento/descarte no período; Giro = mesma contagem, histórico vitalício. Custo estimado = quantidade × custo médio atual."
        period={periodCaption}
        recordsUsed={`${movements.length} movimentação(ões) no histórico completo deste produto`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Receitas relacionadas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recipes.length === 0 ? (
            <EmptyState title="Nenhuma receita ainda usa este produto." description="Crie uma receita em /estoque/receitas para vincular este produto a um serviço." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Etapa</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Consumo esperado</th>
                    <th className="pb-2 font-medium">Amostras</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map(({ recipe, serviceName }) => (
                    <tr key={recipe.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/receitas/${recipe.id}`} className="font-medium text-foreground hover:text-accent hover:underline">
                          {serviceName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.vehicleCategory}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.processStep}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.status}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.quantityPerService !== null ? `${recipe.quantityPerService} ${recipe.unit}` : "Aguardando calibração"}</td>
                      <td className="py-2 text-foreground-muted">{recipe.sampleCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações — {movements.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação registrada." />
          ) : (
            <ol className="space-y-2">
              {movements.map((m) => (
                <li key={m.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{movementLabels[m.type]}</Badge>
                      <span className="text-foreground-muted">{formatDateBR(m.date)}</span>
                    </div>
                    <span className="font-medium text-foreground">
                      {m.quantity} {m.unit}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
                    <span>
                      Saldo: {m.previousBalance !== null ? m.previousBalance : <Unavailable label="não registrado" />} → {m.newBalance ?? <Unavailable label="não registrado" />}
                    </span>
                    {m.reference ? <span>Ref.: {m.reference}</span> : null}
                    {m.responsible ? <span>Responsável: {m.responsible}</span> : null}
                    {m.supplier ? <span>Fornecedor: {m.supplier}</span> : null}
                    {m.unitPricePaid != null ? <span>Preço pago: {formatCurrency(m.unitPricePaid)}</span> : null}
                  </div>
                  {m.notes ? <p className="mt-1 text-xs text-foreground-muted">{m.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-1.5 last:border-0">
      <span className="text-foreground-subtle">{label}</span>
      <span className="text-right text-foreground-muted">{value}</span>
    </div>
  );
}
