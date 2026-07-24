import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZezinhoConversation } from "@/components/zezinho/zezinho-conversation";
import { generateDailySummary } from "@/lib/zezinho/service";
import { getAiProviderConfig } from "@/lib/zezinho/ai-provider";

export const dynamic = "force-dynamic";

export default async function ZezinhoPage() {
  const summary = await generateDailySummary();
  const ai = getAiProviderConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zézinho IA"
        description="Gerente virtual da Santa Mônica — conversa naturalmente, acompanha a operação e forma recomendações com base em dados reais."
        actions={<Badge variant="outline">Somente leitura</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumo do dia</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm leading-relaxed text-foreground">{summary}</p>
            </CardContent>
          </Card>

          <ZezinhoConversation />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sobre o Zézinho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-foreground-muted">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <span className="text-xs text-foreground-subtle">Modo</span>
                <Badge variant={ai.enabled ? "positive" : "outline"}>{ai.enabled ? `IA generativa (${ai.provider})` : "Analítico local"}</Badge>
              </div>
              {!ai.enabled ? <p className="text-xs text-foreground-subtle">Hoje respondo no modo analítico local — direto, natural e baseado 100% em dados reais, sem depender de um provedor de IA externo.</p> : null}
              <p>Conversa naturalmente e ajuda Robério a administrar a Santa Mônica. Consulta dados reais da operação, financeiro, clientes, estoque, agenda, marketing e integrações disponíveis.</p>
              <p>Entende datas em linguagem natural (hoje, ontem, este mês, &ldquo;os 19 dias de julho&rdquo;) e compara dois períodos automaticamente.</p>
              <p>Quando uma informação não está disponível, informa a limitação em vez de inventar.</p>
              <p>Não executa ações: não paga contas, não recebe, não altera nem exclui registros. Alterações continuam exigindo execução manual na tela correspondente.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
