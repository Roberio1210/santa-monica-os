import Link from "next/link";
import { Building2, DollarSign, Receipt, Ticket, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/cards/stat-card";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import { fetchSuppliersGerencial } from "@/lib/finance/suppliersQuery";
import { comparisonToTrend } from "@/lib/utils/comparison";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const inactivityLabel: Record<string, string> = {
  ativo: "Ativo",
  "30_dias": "30+ dias sem comprar",
  "60_dias": "60+ dias sem comprar",
  "90_dias": "90+ dias sem comprar",
};
const inactivityVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  ativo: "positive",
  "30_dias": "outline",
  "60_dias": "warning",
  "90_dias": "critical",
};

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchSuppliersGerencial(period);
  const { overview, comparison, suppliers, concentration, evolutionMonthly, dataQuality } = result;

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;
  const previousPeriodCaption = `${formatDateBR(result.previousPeriod.from)} a ${formatDateBR(result.previousPeriod.to)}`;
  const topByValue = [...suppliers].filter((s) => s.purchaseCount > 0).sort((a, b) => b.totalSpent - a.totalSpent)[0] ?? null;
  const topByFrequency = [...suppliers].filter((s) => s.purchaseCount > 0).sort((a, b) => b.purchaseCount - a.purchaseCount)[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fornecedores"
        description="De quem compramos, quanto, o que e com que frequência — derivado de Contas a Pagar (gasto financeiro) e Movimentações de Estoque (produtos), sem duplicar valor entre as duas fontes."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/financeiro/contas-a-pagar">Contas a Pagar</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">
          Comparado com <span className="font-medium text-foreground-muted">{previousPeriodCaption}</span>
        </p>
      </div>

      {!result.hasAnyPurchaseData ? (
        <Card className="border-warning/40">
          <CardContent className="pt-6 text-sm text-foreground-muted">
            <p className="font-medium text-foreground">Sem dados de compra disponíveis.</p>
            <p className="mt-1 text-xs">
              Nenhuma conta a pagar com fornecedor identificado foi lançada ainda, e nenhuma movimentação de estoque tem fornecedor atribuído. Os {overview.totalSuppliers} fornecedores cadastrados
              abaixo mostram só o relacionamento recorrente conhecido (quando existir) — nenhum valor de compra foi inventado.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* 1. Visão geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Fornecedores cadastrados" value={String(overview.totalSuppliers)} icon={Building2} />
        <StatCard label="Fornecedores com compras" value={String(overview.suppliersWithPurchases)} icon={Users} />
        <StatCard label="Ativos no período" value={String(overview.suppliersActiveInPeriod)} icon={Users} trend={comparisonToTrend(comparison.suppliersActiveInPeriod)} />
        <StatCard label="Sem compra há 90+ dias" value={String(overview.suppliersInactive90d)} icon={Users} />
        <StatCard label="Valor comprado" value={formatCurrency(overview.totalSpent)} icon={DollarSign} trend={comparisonToTrend(comparison.totalSpent)} />
        <StatCard label="Quantidade de compras" value={String(overview.purchaseCount)} icon={Receipt} trend={comparisonToTrend(comparison.purchaseCount)} />
        <StatCard label="Ticket médio por compra" value={formatCurrency(overview.averageTicket)} icon={Ticket} />
        <StatCard label="Gasto médio por fornecedor ativo" value={formatCurrency(overview.averageSpentPerSupplier)} icon={DollarSign} />
      </div>
      <CalculationNote
        source="Contas a Pagar (accounts_payable), filtradas por supplierId não nulo e competenceDate no período — fonte oficial de gasto financeiro, mesma já usada em Despesas (Missão 29)"
        formula="Valor comprado = soma de originalAmount. Ticket médio = valor ÷ quantidade de compras. Gasto médio por fornecedor = valor ÷ fornecedores com compra no período."
        period={periodCaption}
        recordsUsed={`${overview.purchaseCount} lançamento(s) de Contas a Pagar com fornecedor identificado`}
        recordsIgnored="Lançamentos cancelados e sem fornecedor identificado nunca entram nestes totais"
        limitations="Produtos comprados via Movimentações de Estoque (sem passar por Contas a Pagar) NÃO entram neste valor financeiro — aparecem separadamente na seção de produtos, para nunca contar o mesmo gasto duas vezes."
      />

      {topByValue || topByFrequency ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-foreground-subtle">Principal fornecedor por valor</p>
              {topByValue ? (
                <>
                  <Link href={`/financeiro/fornecedores/${topByValue.id}`} className="text-lg font-semibold text-foreground hover:text-accent">
                    {topByValue.name}
                  </Link>
                  <p className="text-sm text-foreground-muted">{formatCurrency(topByValue.totalSpent)}</p>
                </>
              ) : (
                <p className="text-sm text-foreground-subtle">Sem dados disponíveis</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-foreground-subtle">Principal fornecedor por frequência</p>
              {topByFrequency ? (
                <>
                  <Link href={`/financeiro/fornecedores/${topByFrequency.id}`} className="text-lg font-semibold text-foreground hover:text-accent">
                    {topByFrequency.name}
                  </Link>
                  <p className="text-sm text-foreground-muted">{topByFrequency.purchaseCount} compra(s)</p>
                </>
              ) : (
                <p className="text-sm text-foreground-subtle">Sem dados disponíveis</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* 2. Concentração */}
      <Card>
        <CardHeader>
          <CardTitle>Concentração e dependência</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {concentration.suppliersWithSpend === 0 ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis — nenhum fornecedor tem compra registrada.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Top 1 concentra</p>
                <p className="text-lg font-semibold text-foreground">{formatPercent(concentration.top1Share, 1)}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Top 3 concentram</p>
                <p className="text-lg font-semibold text-foreground">{formatPercent(concentration.top3Share, 1)}</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-foreground-subtle">Top 5 concentram</p>
                <p className="text-lg font-semibold text-foreground">{formatPercent(concentration.top5Share, 1)}</p>
              </div>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Gasto vitalício por fornecedor (Contas a Pagar)"
              formula="% do gasto total concentrado nos N maiores fornecedores por valor comprado (vitalício, não restrito ao período selecionado)"
              period="Histórico vitalício"
              recordsUsed={`${concentration.suppliersWithSpend} fornecedor(es) com compra`}
              limitations="Nenhum alerta de dependência é calculado aqui além do percentual em si — a decisão de considerar isso um risco é de quem lê o número."
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Evolução */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {evolutionMonthly.every((p) => p.quantity === 0) ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis nos últimos 12 meses.</p>
          ) : (
            <ServiceEvolutionChart points={evolutionMonthly} />
          )}
        </CardContent>
      </Card>

      {/* 4. Lista gerencial */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de fornecedores ({suppliers.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                  <th className="pb-2 pr-3 font-medium">Compras</th>
                  <th className="pb-2 pr-3 font-medium">Valor total</th>
                  <th className="pb-2 pr-3 font-medium">Ticket médio</th>
                  <th className="pb-2 pr-3 font-medium">Produtos distintos</th>
                  <th className="pb-2 pr-3 font-medium">Última compra</th>
                  <th className="pb-2 pr-3 font-medium">Participação</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                    <td className="py-2 pr-3">
                      <Link href={`/financeiro/fornecedores/${s.id}`} className="font-medium text-foreground hover:text-accent">
                        {s.name}
                      </Link>
                      {s.recurringRelationships.length > 0 ? <p className="text-xs text-foreground-subtle">{s.recurringRelationships.map((r) => r.description).join(", ")}</p> : null}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.purchaseCount}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{s.purchaseCount > 0 ? formatCurrency(s.totalSpent) : "Sem dados disponíveis"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.purchaseCount > 0 ? formatCurrency(s.averageTicket) : "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.distinctProductsCount}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.lastPurchaseDate ? formatDateBR(s.lastPurchaseDate) : "Sem dados disponíveis"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{s.purchaseCount > 0 ? formatPercent(s.share, 1) : "—"}</td>
                    <td className="py-2">
                      {s.purchaseCount === 0 ? (
                        <Badge variant="outline">Sem compras</Badge>
                      ) : (
                        <Badge variant={inactivityVariant[s.inactivityBucket]}>{inactivityLabel[s.inactivityBucket]}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Qualidade dos dados */}
      <Card>
        <CardHeader>
          <CardTitle>Qualidade dos dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Nomes possivelmente semelhantes ({dataQuality.possibleDuplicateNames.length}) — nunca fundidos automaticamente</p>
            {dataQuality.possibleDuplicateNames.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum par de nomes com sobreposição relevante encontrado.</p>
            ) : (
              <ul className="space-y-1.5">
                {dataQuality.possibleDuplicateNames.map((p) => (
                  <li key={`${p.a}-${p.b}`} className="text-sm text-foreground-muted">
                    <span className="font-medium text-foreground">{p.a}</span> ↔ <span className="font-medium text-foreground">{p.b}</span> — {formatPercent(p.similarity, 0)} de sobreposição
                    (palavras em comum: {p.sharedWords.join(", ")})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Compras sem fornecedor identificado (Contas a Pagar)</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.purchasesWithoutSupplier}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-xs text-foreground-subtle">Fornecedores cadastrados sem nenhuma compra</p>
              <p className="text-lg font-semibold text-foreground">{dataQuality.suppliersWithoutAnyPurchase}</p>
            </div>
          </div>
          <CalculationNote
            source="Catálogo de fornecedores (suppliers) + Contas a Pagar"
            formula="Nomes semelhantes: varredura léxica (Jaccard sobre palavras, mesma técnica já usada em Serviços) — só para revisão humana. Compras sem fornecedor: lançamentos ativos de Contas a Pagar com supplierId nulo."
            period="Sem período — auditoria estrutural do cadastro"
            recordsUsed={`${overview.totalSuppliers} fornecedor(es) cadastrado(s)`}
            limitations="Nomes da mesma empresa-mãe para serviços diferentes (ex.: 'Vivo — Telefonia' e 'Vivo — Internet') podem aparecer aqui só por compartilharem uma palavra — não é uma duplicata real, é o mesmo fornecedor prestando dois serviços distintos, mantidos separados de propósito."
          />
        </CardContent>
      </Card>
    </div>
  );
}
