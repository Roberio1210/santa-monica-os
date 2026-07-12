import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZezinhoConversation } from "@/components/zezinho/zezinho-conversation";
import { generateDailySummary, ZEZINHO_QUESTIONS } from "@/lib/zezinho/service";

export const dynamic = "force-dynamic";

export default async function ZezinhoPage() {
  const summary = await generateDailySummary();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zézinho IA"
        description="Versão gerencial baseada nos dados do sistema — sem integração com provedor de IA externo nesta etapa."
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

          <ZezinhoConversation questions={ZEZINHO_QUESTIONS} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sobre o Zézinho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-foreground-muted">
              <p>Responde só com consultas determinísticas sobre os dados reais do Santa Monica OS — nunca inventa números ou conclusões.</p>
              <p>Não executa ações: não paga contas, não recebe, não altera nem exclui registros.</p>
              <p>Quando não há dado suficiente, avisa &ldquo;Ainda não tenho dados suficientes&rdquo; em vez de supor uma resposta.</p>
              <p className="text-xs text-foreground-subtle">Arquitetura preparada para um provedor de IA futuro — nenhum SDK de IA foi integrado nesta etapa.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
