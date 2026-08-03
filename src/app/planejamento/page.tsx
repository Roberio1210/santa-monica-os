import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/planning/appointment-card";
import { DaySection } from "@/components/planning/day-section";
import { NextClientCard } from "@/components/planning/next-client-card";
import { PlanningSearchBar } from "@/components/planning/search-bar";
import { RangeFilter } from "@/components/planning/range-filter";
import { TomorrowPreparation } from "@/components/planning/tomorrow-preparation";
import { fetchPlanningBoard, searchPlanningAppointments } from "@/lib/planning/service";
import { PLANNING_RANGE_LABELS, type PlanningRangeKey } from "@/lib/planning/types";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set(Object.keys(PLANNING_RANGE_LABELS));

export default async function PlanejamentoPage({ searchParams }: { searchParams: Promise<{ range?: string; q?: string }> }) {
  const { range: rawRange, q } = await searchParams;
  const range: PlanningRangeKey | null = rawRange && VALID_RANGES.has(rawRange) ? (rawRange as PlanningRangeKey) : null;
  const query = q?.trim() ?? "";

  const searchResults = query.length >= 2 ? await searchPlanningAppointments(query) : null;
  const board = searchResults ? null : await fetchPlanningBoard(range);

  return (
    <div className="space-y-5">
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

      <PlanningSearchBar initialQuery={query} />

      {searchResults ? (
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
      ) : (
        <>
          <NextClientCard data={board!.nextClient} />

          <TomorrowPreparation data={board!.tomorrowPreparation} />

          <RangeFilter current={range} />

          <div className="space-y-5">
            {board!.days.map((day) => (
              <DaySection key={day.dateIso} day={day} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
