import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockPurchaseOpportunities } from "@/data/mock/purchases";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type { PurchaseRecommendation } from "@/types/purchase";

const recommendationMeta: Record<PurchaseRecommendation, { label: string; variant: "positive" | "warning" | "outline" }> = {
  comprar: { label: "Comprar", variant: "positive" },
  aguardar: { label: "Aguardar", variant: "outline" },
  observar: { label: "Observar", variant: "warning" },
};

export default function ComprasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras"
        description="Pesquisa de preços e oportunidades. Nenhuma compra é realizada automaticamente."
        actions={<DemoDataBadge />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Oportunidades — Mercado Livre (demonstrativo)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 font-medium">Preço atual</th>
                  <th className="pb-2 pr-3 font-medium">Referência</th>
                  <th className="pb-2 pr-3 font-medium">Diferença</th>
                  <th className="pb-2 pr-3 font-medium">Vendedor</th>
                  <th className="pb-2 pr-3 font-medium">Reputação</th>
                  <th className="pb-2 pr-3 font-medium">Frete</th>
                  <th className="pb-2 pr-3 font-medium">Prazo</th>
                  <th className="pb-2 pr-3 font-medium">Full</th>
                  <th className="pb-2 pr-3 font-medium">Cupom</th>
                  <th className="pb-2 font-medium">Recomendação</th>
                </tr>
              </thead>
              <tbody>
                {mockPurchaseOpportunities.map((item) => {
                  const rec = recommendationMeta[item.recommendation];
                  return (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{item.product}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(item.currentPrice)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(item.referencePrice)}</td>
                      <td className={`py-2 pr-3 font-medium ${item.priceDifferencePercent < 0 ? "text-positive" : "text-critical"}`}>
                        {item.priceDifferencePercent > 0 ? "+" : ""}
                        {formatPercent(item.priceDifferencePercent)}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.seller}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.sellerReputation.toFixed(1)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.shipping}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.deliveryEstimate}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.isFull ? "Sim" : "Não"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.coupon ?? "—"}</td>
                      <td className="py-2">
                        <Badge variant={rec.variant}>{rec.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
