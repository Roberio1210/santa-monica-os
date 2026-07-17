import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MappingsView } from "@/components/inventory/mappings-view";
import { listSuggestions } from "@/lib/inventory/suggestions";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";

export const dynamic = "force-dynamic";

export default async function MapeamentosPage() {
  const [suggestions, rawItems] = await Promise.all([listSuggestions(), getInventoryRepository().listItems()]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapeamentos iniciais"
        description="Sugestões de produto por etapa (Fase B) — confirmar aqui nunca gera consumo automático. Receita e calibração continuam obrigatórias em /estoque/receitas."
      />

      <Card>
        <CardContent className="pt-4 text-sm text-foreground-muted">
          <p className="font-medium text-foreground">Pretinho dos pneus ainda não identificado.</p>
          <p className="mt-1 text-xs text-foreground-subtle">Nenhum item real foi cadastrado para este produto — cadastre-o em Contagem/Movimentações antes de criar um mapeamento.</p>
        </CardContent>
      </Card>

      <MappingsView suggestions={suggestions} items={items} />
    </div>
  );
}
