import { DayAppointmentCard } from "@/components/planning/day-appointment-card";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { DayAppointmentView } from "@/lib/planning/types";

/**
 * Missão 40 (item 4) / Missão 43 (Parte C) — timeline ÚNICA do dia, ordenada por horário; sem
 * colunas de box e sem slots vazios inventados a cada 15min — só os horários que têm agendamento
 * real ganham um marcador na régua vertical.
 */
export function DayTimeline({
  appointments,
  capacityBoxesCount,
  todayIso,
  serviceCatalog,
}: {
  appointments: DayAppointmentView[];
  capacityBoxesCount: number | null;
  todayIso: string;
  serviceCatalog: ServiceCatalogEntry[];
}) {
  if (appointments.length === 0) {
    return <p className="py-3 text-sm text-foreground-subtle">Nenhum agendamento para este dia.</p>;
  }

  return (
    <div className="relative space-y-2.5 border-l-2 border-border-subtle pl-4 sm:pl-5">
      {appointments.map((appointment) => (
        <div key={appointment.id} className="relative">
          <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent sm:-left-[25px]" aria-hidden="true" />
          <DayAppointmentCard appointment={appointment} capacityBoxesCount={capacityBoxesCount} todayIso={todayIso} serviceCatalog={serviceCatalog} />
        </div>
      ))}
    </div>
  );
}
