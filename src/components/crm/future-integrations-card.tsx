import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FutureIntegrationsScaffold } from "@/lib/crm-intelligente/types";

/** "INTEGRAÇÕES FUTURAS" (Missão 21) — estrutura preparada, sem implementação real. */
export function FutureIntegrationsCard({ integrations }: { integrations: FutureIntegrationsScaffold }) {
  const slots = Object.values(integrations);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Integrações futuras</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {slots.map((slot) => (
          <Badge key={slot.label} variant="outline">
            {slot.label} · em breve
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}
