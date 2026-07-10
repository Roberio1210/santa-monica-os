import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agentProfiles } from "@/data/mock/agents";
import type { AgentRecommendation } from "@/types/agent";

export function ZezinhoRecommendations({ recommendations }: { recommendations: AgentRecommendation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recomendações do Zézinho</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {recommendations.map((rec) => {
          const agent = agentProfiles.find((a) => a.id === rec.agentId);
          return (
            <div key={rec.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background-elevated text-foreground-subtle">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {rec.title}
                  {agent ? <span className="ml-1.5 text-xs font-normal text-foreground-subtle">— {agent.name}</span> : null}
                </p>
                <p className="text-xs text-foreground-muted">{rec.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
