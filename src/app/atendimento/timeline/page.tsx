import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { EntryCard } from "@/components/attendance/mobile/entry-card";
import { DayPeriodFilter } from "@/components/attendance/mobile/day-period-filter";
import { fetchTimelineFeed } from "@/lib/attendance/service";
import { parseDayPeriodParam } from "@/lib/attendance/period";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const periodKey = parseDayPeriodParam(periodParam);
  const { entries, period } = await fetchTimelineFeed(periodKey);

  return (
    <div>
      <MobileTopBar title="Timeline" showBack />

      <div className="space-y-3 px-4 pt-4 pb-4">
        <DayPeriodFilter current={period.key} />

        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-subtle">Nenhuma entrada em &quot;{period.label}&quot;.</p>
        ) : (
          <div className="space-y-2.5">
            {entries.map((order) => (
              <EntryCard key={order.serviceOrderId} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
