import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ZezinhoChat } from "@/components/agents/zezinho-chat";
import { mockRecommendations } from "@/data/mock/agents";
import { agentProfiles } from "@/data/mock/agents";

export default function ZezinhoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Zézinho IA"
        description="Gerente Geral — interface de conversa demonstrativa."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ZezinhoChat />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recomendações recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {mockRecommendations.slice(0, 4).map((rec) => {
                const agent = agentProfiles.find((a) => a.id === rec.agentId);
                return (
                  <div key={rec.id}>
                    <p className="text-sm font-medium text-foreground">
                      {rec.title}
                      {agent ? <span className="ml-1 text-xs font-normal text-foreground-subtle">— {agent.name}</span> : null}
                    </p>
                    <p className="text-xs text-foreground-muted">{rec.description}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
