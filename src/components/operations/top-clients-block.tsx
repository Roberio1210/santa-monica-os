import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Missão 25 (04/08/2026) — antes disso, este card sempre mostrava "CRM ainda não disponível" e
 * linkava para /clientes (tela mock). Isso ficou desatualizado desde a Missão 21 (CRM
 * Inteligente real, /crm). Agora usa a mesma fonte oficial única (`listCustomerOverviews`).
 * Se a lista vier vazia, é porque `customers` está mesmo vazia em produção (Atendimento ainda
 * sem uso real) — nunca inventa clientes.
 */
export async function TopClientsBlock() {
  const customers = await listCustomerOverviews();
  const top = [...customers].sort((a, b) => b.profile.totalSpent - a.profile.totalSpent).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Top clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {top.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nenhum cliente registrado via Atendimento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {top.map((c) => (
              <li key={c.customer.id}>
                <Link href={`/crm/${c.customer.id}`} className="flex items-center justify-between text-sm hover:text-accent">
                  <span className="text-foreground-muted">{c.customer.name ?? "Cliente sem nome"}</span>
                  <span className="font-medium text-foreground">{formatCurrency(c.profile.totalSpent)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button asChild variant="outline">
            <Link href="/crm">Ver todos no CRM</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
