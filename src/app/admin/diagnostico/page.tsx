import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DiagnosticsPanel } from "@/components/admin/diagnostics-panel";
import { fetchAdminDiagnostics } from "@/lib/admin/diagnostics";

export const dynamic = "force-dynamic";

export default async function AdminDiagnosticoPage() {
  const snapshot = await fetchAdminDiagnostics();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico do sistema"
        description="Estado real das integrações críticas (Neon, JumpPark), sempre verificado ao vivo. Nenhum valor sensível é exibido nesta página. Restrita pelo mesmo gate de acesso temporário do resto do sistema."
      />
      <Card>
        <CardContent className="pt-4">
          <DiagnosticsPanel initial={snapshot} />
        </CardContent>
      </Card>
    </div>
  );
}
