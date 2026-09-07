import { DayAppointmentCard } from "@/components/planning/day-appointment-card";
import type { DayAppointmentView } from "@/lib/planning/types";

/** Missão 40 (item 4) — timeline ÚNICA do dia, ordenada por horário; sem colunas de box. */
export function DayTimeline({ appointments, capacityBoxesCount }: { appointments: DayAppointmentView[]; capacityBoxesCount: number | null }) {
  if (appointments.length === 0) {
    return <p className="py-3 text-sm text-foreground-subtle">Nenhum agendamento para este dia.</p>;
  }

  return (
    <div className="space-y-2.5">
      {appointments.map((appointment) => (
        <DayAppointmentCard key={appointment.id} appointment={appointment} capacityBoxesCount={capacityBoxesCount} />
      ))}
    </div>
  );
}
