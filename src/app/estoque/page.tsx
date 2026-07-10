import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockInventory } from "@/data/mock/inventory";
import type { InventoryCategory, InventoryStatus } from "@/types/inventory";

const categoryLabels: Record<InventoryCategory, string> = {
  shampoos: "Shampoos",
  desengraxantes: "Desengraxantes",
  ceras: "Ceras",
  compostos: "Compostos",
  produtos_internos: "Produtos internos",
  produtos_couro: "Produtos para couro",
  produtos_vidro: "Produtos para vidro",
  acessorios: "Acessórios",
  panos: "Panos",
  epis: "EPIs",
  embalagens: "Embalagens",
  outros: "Outros",
};

const statusMeta: Record<InventoryStatus, { label: string; variant: "positive" | "warning" | "critical" | "outline" }> = {
  normal: { label: "Normal", variant: "positive" },
  atencao: { label: "Atenção", variant: "warning" },
  critico: { label: "Crítico", variant: "critical" },
  sem_informacao: { label: "Sem informação", variant: "outline" },
};

export default function EstoquePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Consumo, saldo estimado e sugestões de reposição."
        actions={<DemoDataBadge />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Produto</th>
                  <th className="pb-2 pr-3 font-medium">Categoria</th>
                  <th className="pb-2 pr-3 font-medium">Qtd. estimada</th>
                  <th className="pb-2 pr-3 font-medium">Mínimo</th>
                  <th className="pb-2 pr-3 font-medium">Consumo médio</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 font-medium">Sugestão</th>
                </tr>
              </thead>
              <tbody>
                {mockInventory.map((item) => {
                  const status = statusMeta[item.status];
                  return (
                    <tr key={item.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{item.name}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{categoryLabels[item.category]}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.estimatedQuantity} {item.unit}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.minimumStock} {item.unit}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{item.averageConsumption} {item.unit}/dia</td>
                      <td className="py-2 pr-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="py-2 text-foreground-subtle">{item.purchaseSuggestion ?? "—"}</td>
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
