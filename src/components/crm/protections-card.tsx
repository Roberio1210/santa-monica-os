import { ShieldCheck } from "lucide-react";
import type { ProtectionRecord } from "@/lib/crm-intelligente/types";

/**
 * "Proteções Ativas" (Missão 21) — mostra só o fato real (há quanto tempo o serviço foi feito),
 * nunca uma data de vencimento/garantia inventada (ver `protections.ts` para a justificativa).
 */
export function ProtectionsCard({ protections }: { protections: ProtectionRecord[] }) {
  if (protections.length === 0) {
    return <p className="rounded-xl border border-dashed border-border-subtle p-3 text-xs text-foreground-subtle">Nenhuma proteção registrada para este veículo ainda.</p>;
  }

  return (
    <div className="space-y-1.5">
      {protections.map((p) => (
        <div key={p.serviceName} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-background-elevated p-2.5 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-positive" />
          <span className="font-medium text-foreground">{p.serviceName}</span>
          <span className="text-foreground-subtle">— realizada há {p.daysSince} dias</span>
        </div>
      ))}
    </div>
  );
}
