import Link from "next/link";
import { Car, PlusCircle } from "lucide-react";
import type { SearchResult } from "@/lib/attendance/service";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

/**
 * Card de resultado da Pesquisa Global — mesmo formato usado na tela "Buscar" e (futuramente) na
 * Etapa 1 do wizard de Novo Atendimento. Nunca mostra `totalSpent` aqui: "Último valor" é
 * propositalmente só da ordem mais recente (ver `lastOrderValue` em `history.ts`).
 */
export function CustomerResultCard({ result }: { result: SearchResult }) {
  const { customer, history } = result;

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-background-panel p-4">
      <div>
        <p className="text-base font-semibold text-foreground">{customer.name ?? "Cliente sem nome cadastrado"}</p>
        <p className="text-sm text-foreground-subtle">{customer.phone ?? "Sem telefone cadastrado"}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-foreground-subtle">Última visita</dt>
          <dd className="mt-0.5 text-foreground">{history.lastVisitAt ? formatDateBR(history.lastVisitAt) : "Nenhuma visita ainda"}</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-subtle">Último valor</dt>
          <dd className="mt-0.5 text-foreground">{history.lastOrderValue !== null ? formatCurrency(history.lastOrderValue) : "—"}</dd>
        </div>
      </dl>

      {history.lastServices.length > 0 ? (
        <div>
          <p className="text-xs text-foreground-subtle">Últimos serviços</p>
          <p className="mt-0.5 text-sm text-foreground">{history.lastServices.join(", ")}</p>
        </div>
      ) : null}

      {history.vehicles.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-foreground-subtle">Veículos cadastrados</p>
          {history.vehicles.map((vehicle) => (
            <div key={vehicle.id} className="flex items-center gap-2 text-sm text-foreground">
              <Car className="h-4 w-4 shrink-0 text-foreground-subtle" />
              <span>
                {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
                {vehicle.plate ? ` · ${vehicle.plate}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {history.observations.length > 0 ? (
        <div>
          <p className="text-xs text-foreground-subtle">Observações</p>
          <p className="mt-0.5 text-sm text-foreground">{history.observations[history.observations.length - 1]}</p>
        </div>
      ) : null}

      <Link
        href={`/atendimento/novo?customerId=${customer.id}`}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
      >
        <PlusCircle className="h-5 w-5" />
        Novo Atendimento
      </Link>
    </div>
  );
}
