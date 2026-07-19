import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JumpParkConnectionTest } from "@/components/configuracoes/jumppark-connection-test";
import { getInventoryConsumptionMode } from "@/lib/config/env";
import { fetchJumpParkDiagnostics } from "@/lib/integrations/jumppark/diagnostics";
import { isDatabaseConfigured } from "@/db/client";
import { getStorageMode } from "@/lib/storage/mode";
import { getAuthStatus } from "@/lib/auth/status";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";
import packageJson from "../../../../package.json";
import { metaIntegration } from "@/lib/integrations/meta";
import { googleIntegration } from "@/lib/integrations/google";
import { mercadoLivreIntegration } from "@/lib/integrations/mercadolivre";
import { stoneIntegration } from "@/lib/integrations/stone";
import { whatsappIntegration } from "@/lib/integrations/whatsapp";
import { camerasIntegration } from "@/lib/integrations/cameras";
import type { IntegrationMeta } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

const plannedIntegrations: IntegrationMeta[] = [
  metaIntegration,
  googleIntegration,
  mercadoLivreIntegration,
  stoneIntegration,
  whatsappIntegration,
  camerasIntegration,
];

function StatusRow({ label, ok, okLabel, notOkLabel, neutralLabel }: {
  label: string;
  ok: boolean | null;
  okLabel: string;
  notOkLabel: string;
  neutralLabel?: string;
}) {
  const variant = ok === null ? "outline" : ok ? "positive" : "warning";
  const text = ok === null ? (neutralLabel ?? notOkLabel) : ok ? okLabel : notOkLabel;
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0">
      <p className="text-sm text-foreground-muted">{label}</p>
      <Badge variant={variant}>{text}</Badge>
    </div>
  );
}

export default async function StatusPage() {
  const jumpPark = await fetchJumpParkDiagnostics();
  const databaseConfigured = isDatabaseConfigured();
  const storageMode = getStorageMode();
  const auth = getAuthStatus();
  const consumptionMode = getInventoryConsumptionMode();

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const shortCommit = commitSha ? commitSha.slice(0, 7) : null;
  const environment = process.env.VERCEL_ENV ?? "development";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status do projeto"
        description="Visão administrativa do que está conectado, configurado e planejado. Nenhum valor sensível é exibido nesta página."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Integrações e dados</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusRow
              label="JumpPark"
              ok={jumpPark.configured ? jumpPark.reachable : null}
              okLabel="Conectado"
              notOkLabel="Configurado, sem resposta"
              neutralLabel="Não configurado"
            />
            <StatusRow
              label="Banco de dados (Neon)"
              ok={databaseConfigured}
              okLabel="Configurado"
              notOkLabel="Não configurado"
            />
            <StatusRow
              label="Estoque"
              ok={storageMode === "postgres"}
              okLabel="Persistente (banco)"
              notOkLabel="Temporário (memória)"
            />
            <div className="flex items-center justify-between border-b border-border-subtle py-2">
              <p className="text-sm text-foreground-muted">Modo de consumo de estoque</p>
              <Badge variant={consumptionMode === "preview_and_confirm" ? "positive" : "outline"}>{consumptionMode}</Badge>
            </div>
            <div className="flex items-center justify-between py-2 last:border-0">
              <p className="text-sm text-foreground-muted">Fuso horário operacional</p>
              <Badge variant="outline">{SAO_PAULO_TZ}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acesso e versão</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusRow
              label="Gate de acesso temporário"
              ok={auth.temporaryGateEnabled}
              okLabel="Ativo"
              notOkLabel="Desativado"
            />
            <StatusRow
              label="Autenticação completa"
              ok={auth.fullAuthConfigured}
              okLabel="Configurada"
              notOkLabel="Não configurada"
            />
            <StatusRow
              label="Acesso público"
              ok={!auth.publiclyAccessible}
              okLabel="Restrito"
              notOkLabel="Sem restrição"
            />
            <div className="flex items-center justify-between border-b border-border-subtle py-2">
              <p className="text-sm text-foreground-muted">Versão</p>
              <Badge variant="outline">{packageJson.version}</Badge>
            </div>
            <div className="flex items-center justify-between py-2 last:border-0">
              <p className="text-sm text-foreground-muted">Commit</p>
              <Badge variant="outline">{shortCommit ?? "indisponível"}{environment ? ` · ${environment}` : ""}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico da integração JumpPark</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <JumpParkConnectionTest initial={jumpPark} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrações planejadas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plannedIntegrations.map((integration) => (
              <div key={integration.id} className="rounded-lg border border-border-subtle p-3">
                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                <p className="mt-1 text-xs text-foreground-muted">{integration.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
