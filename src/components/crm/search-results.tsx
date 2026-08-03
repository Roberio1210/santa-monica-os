import Link from "next/link";
import { Car, ChevronRight, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { CrmSearchMatch } from "@/lib/crm-intelligente/types";

export function CrmSearchResults({ query, results }: { query: string; results: CrmSearchMatch[] | null }) {
  if (results === null) {
    return <p className="py-6 text-center text-sm text-foreground-subtle">Digite ao menos 2 caracteres para buscar por nome, telefone ou placa.</p>;
  }

  if (results.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground-subtle">Nenhum cliente encontrado para &quot;{query}&quot;.</p>;
  }

  return (
    <div className="space-y-2.5">
      {results.map(({ customer, vehicles, profile }) => (
        <Link
          key={customer.id}
          href={`/crm/${customer.id}`}
          className="flex items-center gap-3 rounded-xl border border-border-subtle bg-background-panel p-3.5 transition-colors hover:border-accent/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{customer.name ?? "Cliente sem nome cadastrado"}</p>
              {profile.isVip ? <Badge variant="positive">VIP</Badge> : null}
              {profile.isRecurring ? <Badge variant="info">Recorrente</Badge> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground-subtle">
              {customer.phone ? (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {customer.phone}
                </span>
              ) : null}
              {vehicles.length > 0 ? (
                <span className="flex items-center gap-1">
                  <Car className="h-3 w-3" />
                  {vehicles.length} veículo{vehicles.length > 1 ? "s" : ""}
                </span>
              ) : null}
              <span>{profile.lastVisitAt ? `Última visita ${formatDateBR(saoPauloDateISO(new Date(profile.lastVisitAt)))}` : "Sem visitas registradas"}</span>
            </div>
            <p className="mt-0.5 text-xs text-foreground-subtle">Total gasto: {formatCurrency(profile.totalSpent)}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-foreground-subtle" />
        </Link>
      ))}
    </div>
  );
}
