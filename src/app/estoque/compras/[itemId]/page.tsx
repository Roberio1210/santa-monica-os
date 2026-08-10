import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalculationNote } from "@/components/shared/calculation-note";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import { PurchaseRowsDrilldown } from "@/components/inventory/purchase-rows-drilldown";
import { fetchProductPurchaseDetail } from "@/lib/inventory/purchasesQuery";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

export default async function ProductPurchaseDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const detail = await fetchProductPurchaseDetail(itemId);
  if (!detail.found) notFound();

  const { itemName, category, unit, currentQuantity, minimumStock, idealStock, unitCost, location, lifetimeStats, events, estimate, supplierComparison, evolutionMonthly } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={itemName}
        description="Perfil de compras deste produto — calculado a partir de Movimentações de Estoque (tipo compra). Nenhum valor foi inventado quando a fonte não permitia calculá-lo."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/estoque/compras">Voltar para Produtos/Compras</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Dados do produto e estoque atual</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Categoria" value={category} />
          <Field label="Unidade" value={unit} />
          <Field label="Quantidade atual em estoque" value={`${currentQuantity} ${unit}`} />
          <Field label="Estoque mínimo cadastrado" value={minimumStock !== null ? `${minimumStock} ${unit}` : null} />
          <Field label="Estoque ideal cadastrado" value={idealStock !== null ? `${idealStock} ${unit}` : null} />
          <Field label="Custo médio ponderado atual" value={unitCost !== null ? formatCurrency(unitCost) : null} />
          <Field label="Localização" value={location} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Histórico de compras (vitalício)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {lifetimeStats.purchaseCount === 0 ? (
            <p className="text-sm text-foreground-subtle">Sem dados disponíveis — nenhuma compra registrada para este produto.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Quantidade de compras" value={String(lifetimeStats.purchaseCount)} />
              <Field label="Valor total (com preço conhecido)" value={lifetimeStats.purchasesWithKnownValue > 0 ? formatCurrency(lifetimeStats.totalValue) : null} />
              <Field label="Quantidade total comprada" value={`${lifetimeStats.totalQuantity} ${unit}`} />
              <Field label="Primeira compra" value={lifetimeStats.firstDate ? formatDateBR(lifetimeStats.firstDate) : null} />
              <Field label="Última compra" value={lifetimeStats.lastDate ? formatDateBR(lifetimeStats.lastDate) : null} />
              <Field label="Último preço pago" value={lifetimeStats.lastPrice !== null ? formatCurrency(lifetimeStats.lastPrice) : null} />
              <Field label="Preço médio" value={lifetimeStats.averagePrice !== null ? formatCurrency(lifetimeStats.averagePrice) : null} />
              <Field label="Menor preço já pago" value={lifetimeStats.minPrice !== null ? formatCurrency(lifetimeStats.minPrice) : null} />
              <Field label="Maior preço já pago" value={lifetimeStats.maxPrice !== null ? formatCurrency(lifetimeStats.maxPrice) : null} />
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque (inventory_movements), tipo compra, filtradas por este produto"
              formula="Valor/preço médio/menor/maior calculados só entre as compras com preço pago informado. Quantidade total soma todas as compras, com ou sem preço."
              period="Histórico vitalício"
              recordsUsed={`${lifetimeStats.purchaseCount} compra(s), ${lifetimeStats.purchasesWithKnownValue} com preço informado`}
              limitations="Quando nenhuma compra tem preço informado, os campos de valor aparecem como 'sem dado' — nunca como R$ 0,00."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Fornecedores deste produto ({supplierComparison.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {supplierComparison.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Sem dados disponíveis — nenhuma compra deste produto tem fornecedor E preço informados simultaneamente, o que é necessário para comparar fornecedores.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium">Compras</th>
                    <th className="pb-2 pr-3 font-medium">Preço médio</th>
                    <th className="pb-2 pr-3 font-medium">Menor / Maior</th>
                    <th className="pb-2 font-medium">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierComparison.map((s) => (
                    <tr key={s.supplierId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/financeiro/fornecedores/${s.supplierId}`} className="text-foreground hover:text-accent">
                          {s.supplierName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{s.purchaseCount}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(s.averagePrice)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {formatCurrency(s.minPrice)} / {formatCurrency(s.maxPrice)}
                      </td>
                      <td className="py-2 text-foreground-muted">{formatDateBR(s.lastDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-foreground-subtle">
            Só os fatos são mostrados aqui — o sistema não declara automaticamente um &quot;melhor fornecedor&quot;. A decisão de qual fornecedor priorizar é gerencial e pode envolver fatores além do
            preço (prazo, qualidade, confiabilidade).
          </p>
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
          <CardTitle>5. Próxima compra estimada</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!estimate ? (
            <p className="text-sm text-foreground-subtle">
              Menos de 3 compras em datas distintas registradas para este produto — evidência insuficiente para estimar. Nenhuma previsão foi inventada.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Data estimada" value={formatDateBR(estimate.estimatedDate)} />
              <Field label="Intervalo médio observado" value={`${estimate.averageIntervalDays} dia(s)`} />
            </div>
          )}
          {estimate ? <p className="mt-3 text-xs italic text-foreground-subtle">{estimate.basis}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Todas as compras deste produto ({events.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <PurchaseRowsDrilldown rows={events} />
        </CardContent>
      </Card>
    </div>
  );
}
