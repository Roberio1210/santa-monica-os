import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { DiagnosticFlow } from "@/components/attendance/diagnostic-flow";
import { fetchServiceCatalog, fetchServiceVisitContext } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function AtendimentoDetailPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const [context, serviceCatalog] = await Promise.all([fetchServiceVisitContext(visitId), fetchServiceCatalog()]);

  if (!context) notFound();

  const vehicleLabel = [context.vehicle.brand, context.vehicle.model, context.vehicle.plate].filter(Boolean).join(" ") || "Veículo";

  return (
    <div className="space-y-6">
      <PageHeader title="Diagnóstico Técnico" description="Registre a condição do veículo, recomendações técnicas e os serviços aprovados." />
      <DiagnosticFlow
        serviceVisitId={context.visit.id}
        customerName={context.customer.name ?? "Cliente"}
        vehicleLabel={vehicleLabel}
        initialDiagnostic={context.diagnostic}
        initialRecommendations={context.recommendations}
        initialOrder={context.order}
        serviceCatalog={serviceCatalog}
      />
    </div>
  );
}
