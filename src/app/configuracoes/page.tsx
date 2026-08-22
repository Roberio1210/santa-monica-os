import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StoneIntegrationCard } from "@/components/configuracoes/stone-integration-card";
import { isJumpParkConfigured } from "@/lib/config/env";
import { getStoneIntegrationHealth } from "@/lib/integrations/stone/healthStatus";
import { computeSyncStatus } from "@/lib/integrations/stone/syncStatus";
import { metaIntegration } from "@/lib/integrations/meta";
import { googleIntegration } from "@/lib/integrations/google";
import { mercadoLivreIntegration } from "@/lib/integrations/mercadolivre";
import { whatsappIntegration } from "@/lib/integrations/whatsapp";
import { camerasIntegration } from "@/lib/integrations/cameras";
import type { IntegrationMeta } from "@/lib/integrations/types";
import { COMPANY_INFO } from "@/lib/company/info";

const integrations: IntegrationMeta[] = [
  metaIntegration,
  googleIntegration,
  mercadoLivreIntegration,
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

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const jumpparkConfigured = isJumpParkConfigured();
  const stoneHealth = await getStoneIntegrationHealth();

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
            <p className="text-foreground">{COMPANY_INFO.name}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Local</p>
            <p className="text-foreground">{COMPANY_INFO.neighborhood} — {COMPANY_INFO.city}, {COMPANY_INFO.state}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Domínio</p>
            <p className="text-foreground">{COMPANY_INFO.website}</p>
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
                <Badge variant={jumpparkConfigured ? "positive" : "outline"}>{jumpparkConfigured ? "Configurado" : "Não configurado"}</Badge>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                Estacionamento e ordens de serviço. Modo somente leitura.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/configuracoes/status">Ver status da integração</Link>
              </Button>
            </div>
            <StoneIntegrationCard
              initial={{
                health: stoneHealth.health,
                configured: stoneHealth.configured,
                lastImportRun: stoneHealth.lastImportRun,
                lastSuccessfulImportRun: stoneHealth.lastSuccessfulImportRun,
                syncStatus: computeSyncStatus(stoneHealth.recentRuns),
              }}
            />
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
          <CardTitle>Assistente</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {/*
            Missão 25 (04/08/2026) — este card mostrava 11 "Agentes" fictícios (src/data/mock/agents.ts,
            todos status "planejado"), sem nenhum aviso de dado demonstrativo, dando a impressão de uma
            arquitetura multiagente que não existe. O Santa Monica OS tem um único assistente
            operacional real: o Zézinho (src/lib/zezinho/*, com "diretoria" interna de módulos, não
            agentes nomeados). Substituído por este card único, honesto. Ver docs/mission-25-decisions.md.
          */}
          <div className="rounded-lg border border-border-subtle p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Zézinho</p>
              <Badge variant="positive">Ativo</Badge>
            </div>
            <p className="mt-1 text-xs text-foreground-muted">Assistente operacional real do Santa Monica OS — responde perguntas gerenciais com dados reais, sem geração de texto por IA externa nesta fase.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/zezinho">Abrir Zézinho</Link>
            </Button>
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
          <CardContent className="space-y-2 pt-0 text-xs text-foreground-muted">
            <p>Resumo administrativo de JumpPark, Neon, autenticação, estoque e Zézinho.</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/configuracoes/status">Ver status da integração</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
