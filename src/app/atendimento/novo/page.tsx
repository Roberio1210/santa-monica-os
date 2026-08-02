import { NewAttendanceWizard } from "@/components/attendance/mobile/wizard/new-attendance-wizard";
import { fetchCustomerSearchResult, fetchServiceCatalog } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function NovoAtendimentoPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;

  const [serviceCatalog, initialCustomer] = await Promise.all([fetchServiceCatalog(), customerId ? fetchCustomerSearchResult(customerId) : Promise.resolve(null)]);

  return <NewAttendanceWizard initialCustomer={initialCustomer} serviceCatalog={serviceCatalog} />;
}
