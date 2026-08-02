import { CalendarClock } from "lucide-react";

/**
 * "Próximo Cliente" — componente preparado, sem agenda real conectada ainda (a Agenda hoje só
 * tem dados de demonstração, nunca usados aqui). Quando a Agenda real existir, este componente
 * passa a receber o próximo agendamento (horário, nome, veículo, última visita, último serviço)
 * e o botão "Cliente Chegou" (`CheckIn`) passa a operar sobre ele diretamente.
 */
export function NextCustomerCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border-subtle p-4">
      <CalendarClock className="h-5 w-5 shrink-0 text-foreground-subtle" />
      <div>
        <p className="text-sm font-medium text-foreground">Nenhum atendimento agendado</p>
        <p className="mt-0.5 text-xs text-foreground-subtle">A Agenda ainda não está conectada a dados reais.</p>
      </div>
    </div>
  );
}
