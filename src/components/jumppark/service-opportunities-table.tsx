import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import type { ServiceOpportunity } from "@/lib/integrations/jumppark/serviceAnalytics";

/** Tabela de oportunidades comerciais (cross-sell/upsell) — mostra sempre a evidência real por trás da sugestão, nunca só a conclusão. */
export function ServiceOpportunitiesTable({ opportunities }: { opportunities: ServiceOpportunity[] }) {
  if (opportunities.length === 0) return <EmptyState title="Nenhuma oportunidade identificada com a evidência mínima exigida." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
            <th className="pb-2 pr-3 font-medium">Cliente</th>
            <th className="pb-2 pr-3 font-medium">Veículo</th>
            <th className="pb-2 pr-3 font-medium">Serviço atual</th>
            <th className="pb-2 pr-3 font-medium">Sugestão</th>
            <th className="pb-2 font-medium">Motivo / evidência</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o, i) => (
            <tr key={`${o.customerId}-${o.suggestedService}-${i}`} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-3 text-foreground-muted">
                {o.customerId ? (
                  <Link href={`/ordens/clientes/${o.customerId}`} className="hover:text-accent">
                    {o.customerName ?? "Não informado"}
                  </Link>
                ) : (
                  o.customerName ?? "Não informado"
                )}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">
                {o.vehicleId ? (
                  <Link href={`/ordens/veiculos/${o.vehicleId}`} className="hover:text-accent">
                    {o.vehicleModel ?? "Não informado"}
                  </Link>
                ) : (
                  o.vehicleModel ?? "Não informado"
                )}
              </td>
              <td className="py-2 pr-3 text-foreground-muted">{o.currentService}</td>
              <td className="py-2 pr-3 font-medium text-foreground">{o.suggestedService}</td>
              <td className="py-2 text-xs text-foreground-subtle">
                {o.reason}
                <br />
                <span className="italic">Evidência: {o.evidence}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
