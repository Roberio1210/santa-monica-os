import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPurchaseSuggestions } from "@/lib/inventory/purchase-suggestions";

export const dynamic = "force-dynamic";

export default async function ComprasSugeridasPage() {
  const suggestions = await fetchPurchaseSuggestions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras sugeridas"
        description="Só calcula com estoque mínimo, consumo aprovado e lead time reais — nenhuma compra é inventada ou criada automaticamente."
      />

      <Card>
        <CardHeader>
          <CardTitle>Produtos — {suggestions.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 font-medium">Saldo</th>
                  <th className="pb-2 pr-3 font-medium">Mínimo</th>
                  <th className="pb-2 pr-3 font-medium">Quantidade sugerida</th>
                  <th className="pb-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(({ item, reasonUnavailable, suggestedQuantity }) => (
                  <tr key={item.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{item.name}</td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {item.currentQuantity} {item.unit}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{item.minimumStock !== null ? `${item.minimumStock} ${item.unit}` : "Não configurado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{suggestedQuantity !== null ? `${suggestedQuantity} ${item.unit}` : "—"}</td>
                    <td className="py-2 text-xs italic text-foreground-subtle">{reasonUnavailable ?? "—"}</td>
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
