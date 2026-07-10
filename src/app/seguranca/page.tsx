import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockCameras } from "@/data/mock/cameras";
import type { CameraStatus } from "@/types/camera";

const statusMeta: Record<CameraStatus, { label: string; variant: "positive" | "critical" | "outline" }> = {
  online: { label: "Online", variant: "positive" },
  offline: { label: "Offline", variant: "critical" },
  sem_informacao: { label: "Sem informação", variant: "outline" },
};

export default function SegurancaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Segurança"
        description="Módulo Vigia — cadastro demonstrativo de câmeras Intelbras/Mibo."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockCameras.map((camera) => {
          const status = statusMeta[camera.status];
          return (
            <Card key={camera.id}>
              <CardHeader>
                <CardTitle>{camera.name}</CardTitle>
                <Badge variant={status.variant}>{status.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-xs text-foreground-muted">
                <p>Local: {camera.location}</p>
                <p>Modelo: {camera.model}</p>
                <p>IP: {camera.ipMasked}</p>
                <p>Última verificação: {new Date(camera.lastCheck).toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">
              A transmissão ao vivo dependerá de uma ponte local segura ou integração oficial compatível.
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Nesta fase não há transmissão real, abertura de porta RTSP na internet ou exposição de credenciais das
              câmeras. A integração futura seguirá os protocolos RTSP/ONVIF através de um NVR ou serviço de ponte local.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
