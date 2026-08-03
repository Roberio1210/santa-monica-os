import { AppointmentCard } from "@/components/planning/appointment-card";
import type { PlanningDay } from "@/lib/planning/types";

export function DaySection({ day }: { day: PlanningDay }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">
        {day.label} · {day.appointments.length}
      </h2>
      {day.appointments.length === 0 ? (
        <p className="py-3 text-sm text-foreground-subtle">Nenhum agendamento.</p>
      ) : (
        <div className="space-y-2.5">
          {day.appointments.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      )}
    </section>
  );
}
