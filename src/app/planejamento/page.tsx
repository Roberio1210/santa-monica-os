import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/planning/appointment-card";
import { DayNavigator } from "@/components/planning/day-navigator";
import { DaySection } from "@/components/planning/day-section";
import { DaySummaryCards } from "@/components/planning/day-summary-cards";
import { DayTimeline } from "@/components/planning/day-timeline";
import { NextClientCard } from "@/components/planning/next-client-card";
import { PlanningSearchBar } from "@/components/planning/search-bar";
import { RangeFilter } from "@/components/planning/range-filter";
import { TomorrowPreparation } from "@/components/planning/tomorrow-preparation";
import { fetchServiceCatalog } from "@/lib/attendance/service";
import { resolveDayParam } from "@/lib/planning/dayView";
import { fetchDayView, fetchPlanningBoard, searchPlanningAppointments } from "@/lib/planning/service";
import { PLANNING_RANGE_LABELS, type PlanningRangeKey } from "@/lib/planning/types";
import { saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(Object.keys(PLANNING_RANGE_LABELS));

export default async function PlanejamentoPage({ searchParams }: { searchParams: Promise<{ range?: string; q?: string; date?: string }> }) {
  const { range: rawRange, q, date: rawDate } = await searchParams;
  const range: PlanningRangeKey | null = rawRange && VALID_RANGES.has(rawRange) ? (rawRange as PlanningRangeKey) : null;
  const query = q?.trim() ?? "";

  const searchResults = query.length >= 2 ? await searchPlanningAppointments(query) : null;

  const header = (
    <PageHeader
      title="Planejamento Operacional"
      description="Quem vem, quando, qual serviço e quanto ainda cabe na agenda."
      actions={
        <Button asChild size="sm">
          <Link href="/planejamento/novo">
            <PlusCircle className="h-4 w-4" />
            Novo Agendamento
          </Link>
        </Button>
      }
    />
  );

  if (searchResults) {
    return (
      <div className="space-y-5">
        {header}
        <PlanningSearchBar initialQuery={query} />
        <section className="space-y-2.5">
          <h2 className="text-sm font-semibold text-foreground">Resultados da busca · {searchResults.length}</h2>
          {searchResults.length === 0 ? (
            <p className="py-3 text-sm text-foreground-subtle">Nenhum agendamento encontrado para &quot;{query}&quot;.</p>
          ) : (
            <div className="space-y-2.5">
              {searchResults.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (range) {
    const board = await fetchPlanningBoard(range);
    return (
      <div className="space-y-5">
        {header}
        <PlanningSearchBar initialQuery={query} />
        <NextClientCard data={board.nextClient} />
        <TomorrowPreparation data={board.tomorrowPreparation} />
        <RangeFilter current={range} />
        <div className="space-y-5">
          {board.days.map((day) => (
            <DaySection key={day.dateIso} day={day} />
          ))}
        </div>
      </div>
    );
  }

  const todayIso = saoPauloDateISO();
  const dateIso = resolveDayParam(rawDate, todayIso);
  const [dayView, serviceCatalog] = await Promise.all([fetchDayView(dateIso), fetchServiceCatalog()]);
  const capacityBoxesCount = dayView.capacity.configured ? dayView.capacity.boxesCount : null;

  return (
    <div className="space-y-5">
      {header}
      <PlanningSearchBar initialQuery={query} />
      <RangeFilter current={null} />
      <DayNavigator dateIso={dateIso} todayIso={todayIso} />
      <DaySummaryCards dayView={dayView} />
      <DayTimeline appointments={dayView.appointments} capacityBoxesCount={capacityBoxesCount} todayIso={todayIso} serviceCatalog={serviceCatalog} />
    </div>
  );
}
