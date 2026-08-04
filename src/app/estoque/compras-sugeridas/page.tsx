import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPurchaseSuggestions, type PurchaseSuggestionStatus } from "@/lib/inventory/purchase-suggestions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PurchaseSuggestionStatus, string> = {
  sugerida: "Comprar",
  sem_necessidade: "Sem necessidade",
  dados_insuficientes: "Dados insuficientes",
};

const STATUS_CLASS: Record<PurchaseSuggestionStatus, string> = {
  sugerida: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sem_necessidade: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  dados_insuficientes: "bg-foreground-subtle/15 text-foreground-subtle",
};

export default async function ComprasSugeridasPage() {
  const suggestions = await fetchPurchaseSuggestions();
  const toBuy = suggestions.filter((s) => s.status === "sugerida").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras sugeridas"
        description="Cálculo real a partir de saldo, estoque mínimo/ideal e consumo médio observado no livro-razão — nenhuma compra é inventada ou criada automaticamente. Esta é a tela oficial de sugestão de compras do Santa Monica OS (ver /compras para a nota sobre a tela descontinuada)."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Produtos — {suggestions.length} ({toBuy} com sugestão de compra)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 font-medium">Saldo</th>
                  <th className="pb-2 pr-3 font-medium">Mínimo</th>
                  <th className="pb-2 pr-3 font-medium">Consumo médio</th>
                  <th className="pb-2 pr-3 font-medium">Dias até esgotar</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Quantidade sugerida</th>
                  <th className="pb-2 font-medium">Como foi calculado</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(({ item, status, suggestedQuantity, consumptionPerDay, daysUntilStockout, reason }) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-0 align-top">
                    <td className="py-2 pr-3 font-medium text-foreground">{item.name}</td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {item.currentQuantity} {item.unit}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{item.minimumStock !== null ? `${item.minimumStock} ${item.unit}` : "Não configurado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{consumptionPerDay !== null ? `${consumptionPerDay} ${item.unit}/dia` : "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{daysUntilStockout !== null ? `${daysUntilStockout} dias` : "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{suggestedQuantity !== null ? `${suggestedQuantity} ${item.unit}` : "—"}</td>
                    <td className="py-2 max-w-md text-xs italic text-foreground-subtle">{reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
