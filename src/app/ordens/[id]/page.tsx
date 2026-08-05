import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchOrderById } from "@/lib/integrations/jumppark/ordersQuery";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function OrdemDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const rawParams = await searchParams;
  const order = await fetchOrderById(id);
  if (!order) notFound();

  const backQuery = new URLSearchParams();
  for (const key of ["from", "to", "cliente", "placa", "veiculo", "status", "sort", "dir", "page"]) {
    const value = firstValue(rawParams[key]);
    if (value) backQuery.set(key, value);
  }
  const backHref = `/ordens${backQuery.toString() ? `?${backQuery.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ordem ${order.code ?? order.externalId}`}
        description="Detalhe completo do registro sincronizado — só campos realmente presentes no Neon, nada inventado."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>Voltar à lista</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Código da ordem" value={order.code} />
          <Field label="Identificador externo (JumpPark)" value={order.externalId} />
          <div>
            <p className="text-xs text-foreground-subtle">Status</p>
            <Badge variant="outline">{order.situation ?? NOT_INFORMED}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Nome" value={order.clientName} />
          <Field label="Telefone (mascarado)" value={order.clientPhoneMasked} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Veículo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Modelo" value={order.vehicleModel} />
          <Field label="Placa (mascarada)" value={order.plateMasked} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Serviços</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="text-xs text-foreground-subtle">
            A sincronização (Fase 1, primeira entrega) grava só os valores agregados por ordem — não uma lista individual de serviços realizados. Abaixo, a única divisão real
            disponível no registro.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Valor de estacionamento" value={formatCurrency(Number(order.parkingAmount))} />
            <Field label="Valor de serviços/lavação" value={formatCurrency(Number(order.servicesAmount))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Valores e pagamento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Valor total" value={formatCurrency(Number(order.totalAmount))} />
          <Field label="Forma de pagamento" value={order.paymentMethod} />
          <Field label="Situação financeira" value={order.situation} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Datas e horários</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Data da ordem" value={formatDateBR(order.orderDate)} />
          <Field label="Horário de entrada" value={order.entryTime} />
          <Field label="Horário de saída" value={order.exitTime} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7. Status</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Badge variant="outline">{order.situation ?? NOT_INFORMED}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>8. Origem e sincronização</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Origem" value="JumpPark → Neon" />
          <Field label="Identificador externo (JumpPark)" value={order.externalId} />
          <Field label="Registrado no Neon em" value={new Date(order.createdAt).toLocaleString("pt-BR")} />
          <Field label="Última sincronização deste registro" value={new Date(order.updatedAt).toLocaleString("pt-BR")} />
        </CardContent>
      </Card>
    </div>
  );
}
