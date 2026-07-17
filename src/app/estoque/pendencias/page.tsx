import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchDataQualitySummary } from "@/lib/inventory/data-quality";

export const dynamic = "force-dynamic";

interface PendingSectionProps {
  title: string;
  description: string;
  count: number;
  href: string;
  actionLabel: string;
  severity: "info" | "warning";
}

function PendingSection({ title, description, count, href, actionLabel, severity }: PendingSectionProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant={severity === "warning" ? "warning" : "info"}>{count}</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-foreground-muted">{description}</p>
        {count > 0 ? (
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href={href}>{actionLabel}</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function PendenciasPage() {
  const dq = await fetchDataQualitySummary();

  const allEmpty =
    dq.measurementPending.length === 0 &&
    dq.withoutCost.length === 0 &&
    dq.withoutMinimum.length === 0 &&
    dq.servicesWithoutRecipe.length === 0 &&
    dq.recipesWithoutSamples.length === 0 &&
    dq.recipesWithFewSamples.length === 0 &&
    dq.pendingMappings.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Pendências" description="Ausência de configuração nunca é tratada como erro crítico — cada item aqui tem uma ação direta para corrigir." />

      {allEmpty ? (
        <EmptyState title="Nenhuma pendência encontrada." description="Todos os dados conhecidos estão configurados." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PendingSection
            title="Produtos com medição pendente"
            description="Conteúdo real da embalagem ainda não foi medido fisicamente."
            count={dq.measurementPending.length}
            href="/estoque/produtos?quantityStatus=measurement_pending"
            actionLabel="Ver produtos"
            severity="warning"
          />
          <PendingSection
            title="Produtos sem custo"
            description="Custo unitário nunca foi cadastrado — valor de estoque incompleto."
            count={dq.withoutCost.length}
            href="/estoque/produtos"
            actionLabel="Ver produtos"
            severity="info"
          />
          <PendingSection
            title="Produtos sem estoque mínimo"
            description="Sem mínimo configurado, o produto nunca aparece como baixo ou crítico."
            count={dq.withoutMinimum.length}
            href="/estoque/produtos"
            actionLabel="Ver produtos"
            severity="info"
          />
          <PendingSection
            title="Produtos sem marca informada"
            description={'Marca registrada como "Não informado" na contagem original.'}
            count={dq.withoutBrand.length}
            href="/estoque/produtos"
            actionLabel="Ver produtos"
            severity="info"
          />
          <PendingSection
            title="Serviços sem receita"
            description="Nenhuma receita (rascunho ou aprovada) existe ainda para este serviço, em nenhuma categoria de veículo."
            count={dq.servicesWithoutRecipe.length}
            href="/estoque/receitas/nova"
            actionLabel="Criar receita"
            severity="warning"
          />
          <PendingSection
            title="Receitas sem amostras"
            description="Receita criada, mas nenhuma calibração foi registrada ainda."
            count={dq.recipesWithoutSamples.length}
            href="/estoque/calibracao"
            actionLabel="Calibrar"
            severity="warning"
          />
          <PendingSection
            title="Receitas com poucas amostras"
            description="Já tem alguma calibração, mas ainda abaixo do mínimo para referência provisória."
            count={dq.recipesWithFewSamples.length}
            href="/estoque/receitas"
            actionLabel="Ver receitas"
            severity="warning"
          />
          <PendingSection
            title="Mapeamentos pendentes"
            description="Sugestões etapa → produto ainda não confirmadas nem rejeitadas."
            count={dq.pendingMappings.length}
            href="/estoque/mapeamentos"
            actionLabel="Revisar mapeamentos"
            severity="warning"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campos ainda não implementados no cadastro de produto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0 text-sm text-foreground-muted">
          <p>Fornecedor: campo ainda não existe no schema — nenhum produto possui essa informação.</p>
          <p>Localização: campo ainda não existe no schema — nenhum produto possui essa informação.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integração com JumpPark</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-foreground-muted">
          <p>Ainda não implementada (Fase D — preview_and_confirm). Não há ordens futuras sem mapeamento a mostrar aqui nesta fase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
