import { Database, HardDriveDownload, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils/format";
import { isProductionEnvironment } from "@/lib/config/env";
import type { StorageMode } from "@/lib/storage/mode";
import type { CentralOverview } from "@/lib/operations/central";

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

interface CentralHeaderProps {
  overview: CentralOverview;
  storageMode: StorageMode;
}

/**
 * Missão UX/Navegação 4C — "Situação" e "Atualizar" saíram daqui: viviam duplicados (cabeçalho
 * global E aqui, mostrando o mesmo `computeSituation()`/mesmo botão). Agora só o cabeçalho global
 * (`header.tsx`, `src/app/layout.tsx`) representa isso, numa única fonte visível. Este componente
 * mantém o que é específico da Central: título, saudação/hora da última leitura, e o estado real
 * das integrações (JumpPark/Neon) — nenhum dos dois duplicado em nenhum outro lugar do app.
 */
export function CentralHeader({ overview, storageMode }: CentralHeaderProps) {
  const now = new Date();

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Central de Operações</h1>
        <p className="mt-1 text-sm text-foreground-muted">Visão diária da Estética Automotiva e Estacionamento Sta. Mônica.</p>
        <p className="mt-1 text-sm text-foreground-subtle">
          {greeting(now.getHours())}, Robério — {formatDateBR(overview.asOfDate)}. Última atualização às{" "}
          {new Date(overview.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false })}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {overview.jumpparkConfigured ? (
          <Badge variant={overview.jumppark.error ? "critical" : "positive"}>
            {overview.jumppark.error ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            JumpPark {overview.jumppark.error ? (overview.jumppark.cause === "token_rejeitado" ? "com token expirado" : "com falha de conexão") : "conectado"}
          </Badge>
        ) : (
          <Badge variant="outline">
            <WifiOff className="h-3 w-3" />
            {isProductionEnvironment() ? "JumpPark não configurado" : "Status da integração indisponível neste ambiente"}
          </Badge>
        )}
        {storageMode === "postgres" ? (
          <Badge variant="positive">
            <Database className="h-3 w-3" />
            Neon conectado
          </Badge>
        ) : (
          <Badge variant="outline">
            <HardDriveDownload className="h-3 w-3" />
            Armazenamento temporário (memória)
          </Badge>
        )}
      </div>
    </div>
  );
}
