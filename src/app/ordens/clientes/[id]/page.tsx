import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchCustomerById } from "@/lib/integrations/jumppark/customersQuery";
import { CUSTOMER_STATUS_LABEL } from "@/lib/crm-intelligente/types";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

const statusVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  novo: "outline",
  ativo: "outline",
  vip: "positive",
  em_risco: "warning",
  perdido: "critical",
};

/** Missão 28 — nível de confiança do vínculo de identidade (ver `identityConfidenceEnum`). */
const identityConfidenceLabel: Record<string, string> = {
  confirmado: "Confirmado",
  provavel: "Provável",
  provisorio: "Provisório",
  ambiguo: "Ambíguo",
};
const identityConfidenceVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  confirmado: "positive",
  provavel: "outline",
  provisorio: "outline",
  ambiguo: "critical",
};

function maskedPlateFromExternalId(externalId: string | null): string | null {
  if (!externalId?.startsWith("plate:")) return null;
  return externalId.slice("plate:".length);
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

export default async function ClienteJumpParkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchCustomerById(id);
  if (!detail) notFound();

  const { customer, status, statusReason, daysSinceLastVisit, vehicles, orders } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name ?? NOT_INFORMED}
        description="Perfil calculado automaticamente a partir das ordens sincronizadas da JumpPark — nenhum campo abaixo foi digitado manualmente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens/clientes">Voltar à lista</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Identidade e status</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Nome" value={customer.name} />
          <div>
            <p className="text-xs text-foreground-subtle">Status</p>
            <Badge variant={statusVariant[status] ?? "outline"}>{CUSTOMER_STATUS_LABEL[status]}</Badge>
            <p className="mt-1 text-xs text-foreground-subtle">{statusReason}</p>
          </div>
          <Field label="Identificador externo (JumpPark)" value={customer.externalId} />
          <div>
            <p className="text-xs text-foreground-subtle">Confiança da identidade (Missão 28)</p>
            <Badge variant={identityConfidenceVariant[customer.identityConfidence] ?? "outline"}>
              {identityConfidenceLabel[customer.identityConfidence] ?? customer.identityConfidence}
            </Badge>
            {customer.identityConfidenceReason ? <p className="mt-1 text-xs text-foreground-subtle">{customer.identityConfidenceReason}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Relacionamento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Quantidade de visitas" value={String(customer.visitCount ?? 0)} />
          <Field label="Primeira visita" value={customer.firstVisitAt ? formatDateBR(customer.firstVisitAt) : null} />
          <Field label="Última visita" value={customer.lastVisit ? formatDateBR(customer.lastVisit) : null} />
          <Field label="Dias sem retornar" value={daysSinceLastVisit !== null ? String(daysSinceLastVisit) : null} />
          <Field label="Quantidade de ordens com serviço" value={String(customer.servicesOrderCount ?? 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Valores</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Valor total gasto" value={formatCurrency(customer.totalSpent ? Number(customer.totalSpent) : 0)} />
          <Field label="Ticket médio" value={formatCurrency(customer.averageTicket ? Number(customer.averageTicket) : 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Veículos ({vehicles.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {vehicles.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum veículo com placa identificável vinculado a este cliente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Modelo</th>
                    <th className="pb-2 pr-3 font-medium">Placa (mascarada)</th>
                    <th className="pb-2 pr-3 font-medium">Visitas</th>
                    <th className="pb-2 pr-3 font-medium">Primeira vez</th>
                    <th className="pb-2 font-medium">Última vez</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{v.model ?? NOT_INFORMED}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{maskedPlateFromExternalId(v.externalId) ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.visitCount ?? 0}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.firstSeenAt ? formatDateBR(v.firstSeenAt) : "—"}</td>
                      <td className="py-2 text-foreground-muted">{v.lastSeenAt ? formatDateBR(v.lastSeenAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-foreground-subtle">
            A JumpPark só fornece a placa mascarada nesta integração — o identificador do veículo usa a máscara, nunca a placa completa.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Histórico operacional ({orders.length} ordem(ns))</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma ordem vinculada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/${o.id}`} className="text-foreground hover:text-accent">
                          {formatDateBR(o.orderDate)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{o.vehicleModel ?? NOT_INFORMED}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(Number(o.totalAmount))}</td>
                      <td className="py-2">
                        <Badge variant="outline">{o.situation ?? NOT_INFORMED}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Origem e sincronização</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Origem" value="JumpPark → Neon (recálculo automático a cada sincronização)" />
          <Field label="Última atualização deste registro" value={new Date(customer.updatedAt).toLocaleString("pt-BR")} />
        </CardContent>
      </Card>
    </div>
  );
}
