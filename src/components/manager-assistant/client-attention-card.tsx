import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils/format";
import type { ClientAttentionEntry } from "@/lib/manager-assistant/clientAttention";

/** Seção 3 — só aparece quando `deriveClientAttention` já encontrou um sinal real (ver clientAttention.ts). */
export function ClientAttentionCard({ entry }: { entry: ClientAttentionEntry }) {
  return (
    <div className="rounded-xl border border-border bg-background-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{entry.customerName ?? "Cliente sem nome cadastrado"}</p>
          <p className="mt-0.5 text-xs text-foreground-subtle">{entry.vehicles.map((v) => v.label).join(", ") || "Sem veículo cadastrado"}</p>
        </div>
        <Link href={`/atendimento/clientes/${entry.customerId}`} className="flex items-center gap-0.5 text-xs font-medium text-accent">
          Ver histórico
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.reasons.map((reason) => (
          <Badge key={reason} variant="outline">
            {reason}
          </Badge>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-foreground-subtle">Última visita</dt>
          <dd className="mt-0.5 text-foreground">{entry.lastVisitAt ? formatDateBR(entry.lastVisitAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-foreground-subtle">Últimos serviços</dt>
          <dd className="mt-0.5 text-foreground">{entry.lastServices.length > 0 ? entry.lastServices.join(", ") : "—"}</dd>
        </div>
      </dl>

      {entry.observations.length > 0 ? (
        <p className="mt-2 text-xs text-foreground-muted">&quot;{entry.observations[entry.observations.length - 1]}&quot;</p>
      ) : null}
    </div>
  );
}
