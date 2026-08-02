import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { TimelineList } from "@/components/attendance/mobile/timeline-list";
import { fetchCustomerSearchResult, fetchCustomerTimeline } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function CustomerTimelinePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const [searchResult, entries] = await Promise.all([fetchCustomerSearchResult(customerId), fetchCustomerTimeline(customerId)]);
  if (!searchResult) notFound();

  const { customer } = searchResult;

  return (
    <div>
      <MobileTopBar title={customer.name ?? "Cliente"} showBack />

      <div className="space-y-4 px-4 pb-8 pt-4">
        {customer.phone ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground-subtle">
            <Phone className="h-3.5 w-3.5" />
            {customer.phone}
          </p>
        ) : null}

        <TimelineList entries={entries} />
      </div>
    </div>
  );
}
