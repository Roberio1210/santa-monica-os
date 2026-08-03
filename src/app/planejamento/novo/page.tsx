import { PageHeader } from "@/components/shared/page-header";
import { NewAppointmentForm } from "@/components/planning/new-appointment-form";
import { fetchServiceCatalog } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage() {
  const serviceCatalog = await fetchServiceCatalog();

  return (
    <div className="space-y-5">
      <PageHeader title="Novo Agendamento" description="Cliente, veículo, serviço esperado e horário." />
      <NewAppointmentForm serviceCatalog={serviceCatalog} />
    </div>
  );
}
