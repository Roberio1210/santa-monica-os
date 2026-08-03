import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/** Todos os campos pedidos em "AO ABRIR O CLIENTE" — cada um calculado a partir de dado real. */
export function CustomerProfileCard({ profile }: { profile: CustomerProfile }) {
  const { customer } = profile;
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CardTitle className="text-base text-foreground">{customer.name ?? "Cliente sem nome cadastrado"}</CardTitle>
          {profile.isVip ? <Badge variant="positive">Cliente VIP</Badge> : null}
          {profile.isRecurring ? <Badge variant="info">Cliente recorrente</Badge> : null}
        </div>
        {customer.phone ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground-subtle">
            <Phone className="h-3.5 w-3.5" />
            {customer.phone}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Data da primeira visita" value={profile.firstVisitAt ? formatDateBR(saoPauloDateISO(new Date(profile.firstVisitAt))) : "Sem visitas registradas"} />
        <Field label="Dias como cliente" value={profile.daysAsCustomer !== null ? `${profile.daysAsCustomer} dias` : "—"} />
        <Field label="Visitas totais" value={String(profile.visitCount)} />
        <Field label="Veículos" value={String(profile.vehicleCount)} />
        <Field label="Última visita" value={profile.lastVisitAt ? formatDateBR(saoPauloDateISO(new Date(profile.lastVisitAt))) : "Sem visitas registradas"} />
        <Field label="Dias desde a última visita" value={profile.daysSinceLastVisit !== null ? `${profile.daysSinceLastVisit} dias` : "—"} />
        <Field label="Valor total gasto" value={formatCurrency(profile.totalSpent)} />
        <Field label="Ticket médio" value={profile.averageTicket !== null ? formatCurrency(profile.averageTicket) : "—"} />
      </CardContent>
    </Card>
  );
}
