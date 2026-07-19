import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { fetchOperationalOrderDetail } from "@/lib/integrations/jumppark/operation-detail";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { isValidIsoDate } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

function duration(entry: string | null, exit: string | null): string {
  if (!entry || !exit) return "Informação não fornecida pelo JumpPark";
  const entryDate = new Date(entry.replace(" ", "T"));
  const exitDate = new Date(exit.replace(" ", "T"));
  const minutes = Math.round((exitDate.getTime() - entryDate.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "Informação não fornecida pelo JumpPark";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins} min`;
}

export default async function MovimentacaoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ externalId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { externalId } = await params;
  const { date } = await searchParams;
  const dateHint = isValidIsoDate(date) ? date : undefined;

  const result = await fetchOperationalOrderDetail(externalId, dateHint);

  if (!result.jumpparkConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title="Detalhe da ordem" />
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="JumpPark não configurado neste ambiente." />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Detalhe da ordem" />
        <Card>
          <CardContent className="pt-4">
            <Unavailable label={result.error} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result.order) notFound();

  const order = result.order;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ordem ${order.code ?? order.externalId}`}
        description={`${order.clientName ?? "Cliente não informado"} — ${order.vehicleModel}`}
        actions={<Badge variant={order.kind === "lavacao" ? "info" : "outline"}>{order.kind === "lavacao" ? "Lavação" : "Estacionamento"}</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Dados gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0 text-sm sm:grid-cols-3">
          <Row label="Identificador" value={order.code ?? order.externalId} />
          <Row label="Data" value={formatDateBR(order.date)} />
          <Row label="Entrada" value={order.entryTime ?? "Informação não fornecida pelo JumpPark"} />
          <Row label="Saída" value={order.exitTime ?? "Informação não fornecida pelo JumpPark"} />
          <Row label="Duração" value={duration(order.entryDateTime, order.exitDateTime)} />
          <Row label="Status" value={order.situation} />
          <Row label="Cliente" value={order.clientName ?? "Informação não fornecida pelo JumpPark"} />
          <Row label="Telefone" value={order.clientPhoneMasked ?? "Informação não fornecida pelo JumpPark"} />
          <Row label="Veículo" value={order.vehicleModel} />
          <Row label="Placa" value={order.plateMasked} />
          <Row label="Forma de pagamento" value={order.paymentMethodName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Serviços e valores</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {order.services.length === 0 ? (
            <p className="mb-3 text-sm text-foreground-muted">Ordem de estacionamento puro — nenhum serviço agregado.</p>
          ) : (
            <ul className="mb-3 space-y-1">
              {order.services.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground-muted">{s.description}</span>
                  <span className="text-foreground">{formatCurrency(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-3 gap-3 border-t border-border-subtle pt-3 text-sm">
            <Row label="Estacionamento" value={formatCurrency(order.parkingAmount)} />
            <Row label="Serviços" value={formatCurrency(order.servicesAmount)} />
            <Row label="Total" value={formatCurrency(order.totalAmount)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros relacionados</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Link href={`/estoque/ordens/${order.externalId}`} className="text-sm text-accent hover:underline">
            Ver consumo de estoque desta ordem
          </Link>
          <p className="mt-2 text-xs text-foreground-subtle">
            Cliente e conta a receber vinculados exigem um cadastro de clientes que ainda não está disponível para consulta cruzada nesta tela — nenhum link foi inventado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
