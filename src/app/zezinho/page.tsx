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
        description="Gerente virtual do Santa Monica OS — entende linguagem natural, compara períodos e responde com dados reais."
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
              {!ai.enabled ? <p className="text-xs text-foreground-subtle">IA generativa não configurada — usando modo analítico local.</p> : null}
              <p>Entende datas em linguagem natural (hoje, ontem, este mês, &ldquo;os 19 dias de julho&rdquo;) e compara dois períodos automaticamente.</p>
              <p>Responde só com consultas sobre os dados reais do sistema — nunca inventa números ou conclusões.</p>
              <p>Não executa ações: não paga contas, não recebe, não altera nem exclui registros. Alterações continuam exigindo execução manual na tela correspondente.</p>
              <p className="text-xs text-foreground-subtle">Quando não há dado suficiente, avisa em vez de supor uma resposta.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
