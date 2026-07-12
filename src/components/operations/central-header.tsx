import { AlertTriangle, CheckCircle2, Database, HardDriveDownload, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RefreshButton } from "@/components/operations/refresh-button";
import { formatDateBR } from "@/lib/utils/format";
import type { StorageMode } from "@/lib/storage/mode";
import type { CentralOverview, SituationLevel } from "@/lib/operations/central";

const situationMeta: Record<SituationLevel, { label: string; variant: "positive" | "warning" | "critical"; icon: typeof CheckCircle2 }> = {
  normal: { label: "Situação normal", variant: "positive", icon: CheckCircle2 },
  atencao: { label: "Requer atenção", variant: "warning", icon: AlertTriangle },
  critica: { label: "Situação crítica", variant: "critical", icon: AlertTriangle },
};

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

interface CentralHeaderProps {
  overview: CentralOverview;
  situation: SituationLevel;
  storageMode: StorageMode;
}

export function CentralHeader({ overview, situation, storageMode }: CentralHeaderProps) {
  const now = new Date();
  const meta = situationMeta[situation];
  const SituationIcon = meta.icon;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Central de Operações</h1>
          <p className="mt-1 text-sm text-foreground-muted">Visão diária da Estética Automotiva e Estacionamento Sta. Mônica.</p>
          <p className="mt-1 text-sm text-foreground-subtle">
            {greeting(now.getHours())}, Robério — {formatDateBR(overview.asOfDate)}. Última atualização às{" "}
            {new Date(overview.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false })}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.variant}>
            <SituationIcon className="h-3 w-3" />
            {meta.label}
          </Badge>
          <RefreshButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {overview.jumpparkConfigured ? (
          <Badge variant={overview.jumppark.error ? "critical" : "positive"}>
            {overview.jumppark.error ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            JumpPark {overview.jumppark.error ? "com falha de conexão" : "conectado"}
          </Badge>
        ) : (
          <Badge variant="outline">
            <WifiOff className="h-3 w-3" />
            JumpPark não configurado
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
