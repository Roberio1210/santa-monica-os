import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalculationNote } from "@/components/shared/calculation-note";
import { PeriodSelector } from "@/components/operations/period-selector";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import { fetchSupplierDetail } from "@/lib/finance/suppliersQuery";
import { formatCurrency, formatDateBR, formatPercent } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

export default async function FornecedorDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const rawParams = await searchParams;
  const period = parsePeriodParams({ period: rawParams.period, from: rawParams.from, to: rawParams.to });
  const detail = await fetchSupplierDetail(id, period);
  if (!detail.found) notFound();

  const { supplier, lifetimeStats, currentStats, previousStats, comparison, daysSinceLastPurchase, inactivityBucket, isStoppedRelativeToOwnPattern, evolutionMonthly, payables, products, recurringRelationships, shareOfTotalSpend } = detail;
  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description="Perfil calculado a partir de Contas a Pagar (gasto financeiro) e Movimentações de Estoque (produtos) — nenhum valor foi inventado quando a fonte não permitia calculá-lo."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/financeiro/fornecedores">Voltar para Fornecedores</Link>
          </Button>
        }
      />

      <PeriodSelector period={period} />

      <Card>
        <CardHeader>
          <CardTitle>1. Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Nome" value={supplier.name} />
          <Field label="Contato" value={supplier.contactName} />
          <Field label="CNPJ/CPF" value={supplier.taxId} />
          <Field label="Telefone" value={supplier.phone} />
          <Field label="E-mail" value={supplier.email} />
          <Field label="Endereço" value={supplier.address} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Histórico de compras (vitalício)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!lifetimeStats ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis — nenhuma conta a pagar com este fornecedor foi lançada ainda.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Quantidade de compras" value={String(lifetimeStats.count)} />
              <Field label="Valor total gasto" value={formatCurrency(lifetimeStats.total)} />
              <Field label="Ticket médio" value={formatCurrency(lifetimeStats.averageTicket)} />
              <Field label="Primeira compra" value={lifetimeStats.firstDate ? formatDateBR(lifetimeStats.firstDate) : null} />
              <Field label="Última compra" value={lifetimeStats.lastDate ? formatDateBR(lifetimeStats.lastDate) : null} />
              <Field label="Dias desde a última compra" value={daysSinceLastPurchase !== null ? String(daysSinceLastPurchase) : null} />
              <Field label="Participação no gasto total com fornecedores" value={formatPercent(shareOfTotalSpend, 1)} />
              <div>
                <p className="text-xs text-foreground-subtle">Situação</p>
                <Badge variant={inactivityVariant[inactivityBucket]}>{inactivityLabel[inactivityBucket]}</Badge>
                {isStoppedRelativeToOwnPattern ? (
                  <p className="mt-1 text-xs text-warning">Comprava com regularidade e o intervalo atual já passa de 2x o intervalo médio histórico próprio — não é um limiar genérico de 30/60/90 dias.</p>
                ) : null}
              </div>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Contas a Pagar (accounts_payable), filtradas por supplierId"
              formula="Vitalício: soma/contagem de todos os lançamentos ativos deste fornecedor, qualquer data. Situação: dias corridos desde a última compra (30/60/90 = limiares fixos); 'comprava com regularidade e parou' compara com o intervalo médio PRÓPRIO do fornecedor, não um limiar genérico."
              period="Histórico vitalício"
              recordsUsed={`${lifetimeStats?.count ?? 0} lançamento(s)`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. No período selecionado ({periodCaption})</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Compras no período" value={String(currentStats?.count ?? 0)} />
          <Field label="Valor no período" value={formatCurrency(currentStats?.total ?? 0)} />
          <Field label="Compras no período anterior" value={String(previousStats?.count ?? 0)} />
          <Field
            label="Variação de valor vs período anterior"
            value={comparison.total.percent !== null ? `${comparison.total.percent > 0 ? "+" : ""}${formatPercent(comparison.total.percent, 0)}` : "Sem base no período anterior"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Evolução mensal (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {evolutionMonthly.every((p) => p.quantity === 0) ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis nos últimos 12 meses.</p>
          ) : (
            <ServiceEvolutionChart points={evolutionMonthly} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Relacionamento recorrente conhecido ({recurringRelationships.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recurringRelationships.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum modelo de recorrência cadastrado para este fornecedor.</p>
          ) : (
            <ul className="space-y-2">
              {recurringRelationships.map((t) => (
                <li key={t.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <p className="font-medium text-foreground">{t.description}</p>
                  <p className="text-xs text-foreground-subtle">
                    {t.periodicity} · {t.variableAmount ? "valor variável" : t.amount !== null ? formatCurrency(t.amount) : "valor não informado"}
                    {t.dueDay ? ` · vencimento dia ${t.dueDay}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-foreground-subtle">
            Isto é a RELAÇÃO esperada (ex.: &quot;aluguel, mensal&quot;), não um valor gasto real — o valor real, quando lançado, aparece na seção de histórico de compras acima.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Produtos comprados ({products.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {products.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis — nenhuma movimentação de estoque com fornecedor e preço identificados para este fornecedor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Compras</th>
                    <th className="pb-2 pr-3 font-medium">Qtd. total</th>
                    <th className="pb-2 pr-3 font-medium">Último preço</th>
                    <th className="pb-2 pr-3 font-medium">Preço médio</th>
                    <th className="pb-2 pr-3 font-medium">Menor / Maior</th>
                    <th className="pb-2 font-medium">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.itemId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/produtos/${p.itemId}`} className="text-foreground hover:text-accent">
                          {p.itemName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.purchaseCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.totalQuantity}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(p.lastPrice)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(p.averagePrice)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {formatCurrency(p.minPrice)} / {formatCurrency(p.maxPrice)}
                      </td>
                      <td className="py-2 text-foreground-muted">{formatDateBR(p.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque (inventory_movements, tipo compra/entrada) cujo fornecedor bate por nome exato com o cadastro"
              formula="Preço unitário = unit_price_paid da movimentação. Nunca calculado quando a fonte não informa preço."
              period="Histórico vitalício"
              recordsUsed={`${products.length} produto(s) distinto(s)`}
              limitations="Dado estruturalmente separado de Contas a Pagar — nunca somado ao valor financeiro acima, para não contar a mesma compra duas vezes."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7. Lançamentos de Contas a Pagar ({payables.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {payables.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum lançamento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Competência</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((p) => (
                    <tr key={p.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">
                        <Link href={`/financeiro/contas-a-pagar/${p.id}`} className="hover:text-accent">
                          {formatDateBR(p.competenceDate)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.description}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{p.categoryName}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(p.originalAmount)}</td>
                      <td className="py-2">
                        <Badge variant="outline">{p.computedStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
