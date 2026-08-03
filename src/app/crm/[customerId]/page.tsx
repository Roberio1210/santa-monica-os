import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ExecutiveSummaryPanel } from "@/components/crm/executive-summary-panel";
import { CustomerProfileCard } from "@/components/crm/customer-profile-card";
import { VehicleSection } from "@/components/crm/vehicle-section";
import { CommercialHistoryCard } from "@/components/crm/commercial-history-card";
import { CrmTimelineList } from "@/components/crm/timeline-list";
import { FutureIntegrationsCard } from "@/components/crm/future-integrations-card";
import { fetchCustomerCrmDetail } from "@/lib/crm-intelligente/service";

export const dynamic = "force-dynamic";

export default async function CrmCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const detail = await fetchCustomerCrmDetail(customerId);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={detail.customer.name ?? "Cliente sem nome cadastrado"} description="Memória completa do cliente e de cada veículo." />

      <ExecutiveSummaryPanel summary={detail.executiveSummary} />

      <CustomerProfileCard profile={detail.profile} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Veículos · {detail.vehicles.length}</h2>
        {detail.vehicles.length === 0 ? (
          <p className="text-sm text-foreground-subtle">Nenhum veículo cadastrado para este cliente.</p>
        ) : (
          <div className="space-y-4">
            {detail.vehicles.map((v) => (
              <VehicleSection key={v.vehicle.id} detail={v} />
            ))}
          </div>
        )}
      </section>

      <CommercialHistoryCard history={detail.commercialHistory} />

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-foreground">Timeline completa · {detail.timeline.length}</h2>
        <CrmTimelineList entries={detail.timeline} />
      </section>

      <FutureIntegrationsCard integrations={detail.integrations} />
    </div>
  );
}
