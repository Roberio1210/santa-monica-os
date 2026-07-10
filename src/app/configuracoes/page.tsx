import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { agentProfiles } from "@/data/mock/agents";
import { metaIntegration } from "@/lib/integrations/meta";
import { googleIntegration } from "@/lib/integrations/google";
import { mercadoLivreIntegration } from "@/lib/integrations/mercadolivre";
import { stoneIntegration } from "@/lib/integrations/stone";
import { whatsappIntegration } from "@/lib/integrations/whatsapp";
import { camerasIntegration } from "@/lib/integrations/cameras";
import type { IntegrationMeta } from "@/lib/integrations/types";

const integrations: IntegrationMeta[] = [
  metaIntegration,
  googleIntegration,
  mercadoLivreIntegration,
  stoneIntegration,
  whatsappIntegration,
  camerasIntegration,
];

const statusVariant: Record<IntegrationMeta["status"], "outline" | "warning" | "positive"> = {
  nao_configurado: "outline",
  planejado: "warning",
  ativo: "positive",
};

const statusLabel: Record<IntegrationMeta["status"], string> = {
  nao_configurado: "Não configurado",
  planejado: "Planejado",
  ativo: "Ativo",
};

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Perfil da empresa, integrações, agentes e segurança." />

      <Card>
        <CardHeader>
          <CardTitle>Perfil da empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-foreground-subtle">Nome</p>
            <p className="text-foreground">Sta Monica Estética Automotiva</p>
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Local</p>
            <p className="text-foreground">Santa Mônica — Florianópolis, SC</p>
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Domínio</p>
            <p className="text-foreground">esteticastamonica.com.br</p>
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Fonte oficial de dados</p>
            <p className="text-foreground">JumpPark (leitura)</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrações</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border-subtle p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">JumpPark</p>
                <Badge variant="outline">Consultar em /configuracoes → status via /api/jumppark/status</Badge>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                Estacionamento e ordens de serviço. Modo somente leitura.
              </p>
            </div>
            {integrations.map((integration) => (
              <div key={integration.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{integration.name}</p>
                  <Badge variant={statusVariant[integration.status]}>{statusLabel[integration.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-foreground-muted">{integration.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agentes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agentProfiles.map((agent) => (
              <div key={agent.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{agent.name}</p>
                  <Badge variant="outline">{agent.role}</Badge>
                </div>
                <p className="mt-1 text-xs text-foreground-muted">{agent.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Segurança e privacidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-foreground-muted">
            <p>Credenciais somente no backend, nunca enviadas ao navegador.</p>
            <p>Nenhuma ação financeira, comercial ou destrutiva é executada sem confirmação humana.</p>
            <p>Dados demonstrativos são claramente identificados em toda a interface.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status do sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-xs text-foreground-muted">
            <p>Consulte <code className="text-foreground">/api/health</code> para verificação básica da aplicação.</p>
            <p>Consulte <code className="text-foreground">/api/jumppark/status</code> para diagnóstico seguro da integração JumpPark.</p>
            <p>
              Veja{" "}
              <a href="/configuracoes/status" className="text-foreground underline underline-offset-2">
                /configuracoes/status
              </a>{" "}
              para um resumo administrativo de banco, autenticação e estoque.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
