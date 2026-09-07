import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/planning/status-badge";
import { PlateConflictActions } from "@/components/jumppark/plate-conflict-actions";
import type { EnrichedExistingVehicle, EnrichedIncomingOrder, EnrichedPlateConflictReviewViewModel } from "@/lib/integrations/jumppark/plateConflictEnrichment";
import type { PlateConflictType } from "@/lib/integrations/jumppark/plateConflictEvidence";
import type { AppointmentStatus } from "@/lib/planning/types";
import { formatDateBR } from "@/lib/utils/format";
import { saoPauloTimeHM } from "@/lib/utils/timezone";

/**
 * Missão 20 (Etapa D — UI read-only) / Missão 28 (Etapa E6 — ações). Card dedicado para
 * conflitos de placa detectados pelo sync JumpPark (Missão 14/17), consumindo só o
 * `EnrichedPlateConflictReviewViewModel` da Missão 19 (parser da Missão 18 + enrichment da
 * Missão 19) — nunca acessa `evidence` bruta.
 *
 * O card em si continua Server Component, só leitura. As três ações humanas (Missão 28) vivem
 * isoladas em `PlateConflictActions` (Client Component), renderizadas só quando `!decided` — as
 * ações genéricas da fila antiga (`keepSeparateAction`/`deferReviewAction`/`reopenReviewAction`)
 * têm semântica pensada para ambiguidade de nome de cliente, nunca reaproveitadas aqui (ver
 * checkpoint da Missão 20, item 10).
 */

const CONFLICT_TYPE_LABEL: Record<PlateConflictType, string> = {
  manual_jumppark: "Veículo agendado/manual × veículo recebido do JumpPark",
  jumppark_jumppark: "Conflito entre registros do JumpPark",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Cadastrado no Atendimento/Planejamento",
  jumppark: "Sincronizado do JumpPark",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  kept_separate: "Mantido separado",
  deferred: "Revisar depois",
  linked: "Vinculado (mesmo veículo)",
};

const REVIEW_STATUS_VARIANT: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  pending: "warning",
  kept_separate: "positive",
  deferred: "outline",
  linked: "positive",
};

function ExistingVehicleBlock({ vehicle }: { vehicle: EnrichedExistingVehicle }) {
  if (vehicle.unavailable) {
    return (
      <div className="rounded-lg border border-border-subtle p-3">
        <p className="text-xs text-foreground-subtle">Este veículo não foi encontrado (removido, ou id inconsistente) — nenhum dado pode ser exibido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-medium text-foreground">{vehicle.plate ?? "Placa não informada"}</p>
        <Badge variant="outline">{vehicle.source ? (SOURCE_LABEL[vehicle.source] ?? vehicle.source) : "Origem desconhecida"}</Badge>
      </div>
      <p className="text-xs text-foreground-muted">
        {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Modelo não informado"}
        {vehicle.color ? ` · ${vehicle.color}` : ""}
      </p>

      {vehicle.customer ? (
        <div className="text-xs text-foreground-muted">
          <p className="font-medium text-foreground">
            {vehicle.customer.id ? (
              <Link href={`/ordens/clientes/${vehicle.customer.id}`} className="hover:text-accent">
                {vehicle.customer.name ?? "Cliente sem nome cadastrado"}
              </Link>
            ) : (
              (vehicle.customer.name ?? "Cliente sem nome cadastrado")
            )}
          </p>
          <p>{vehicle.customer.phone ?? "Telefone não informado"}</p>
        </div>
      ) : (
        <p className="text-xs text-foreground-subtle">Cliente não encontrado.</p>
      )}

      {vehicle.appointment ? (
        <div className="space-y-1 rounded-lg bg-background-elevated p-3">
          <p className="text-xs font-medium text-foreground-subtle">Agendamento relacionado</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground">
              {formatDateBR(vehicle.appointment.scheduledAt)} às {saoPauloTimeHM(new Date(vehicle.appointment.scheduledAt))}
            </p>
            <StatusBadge status={vehicle.appointment.status as AppointmentStatus} />
          </div>
          <p className="text-xs text-foreground-muted">{vehicle.appointment.serviceName}</p>
          <p className="text-xs text-foreground-subtle">Este veículo possui um agendamento vinculado. Nenhuma alteração automática foi realizada.</p>
        </div>
      ) : null}
    </div>
  );
}

function IncomingOrderBlock({ order }: { order: EnrichedIncomingOrder }) {
  if (order.unavailable) {
    return (
      <div className="rounded-lg border border-border-subtle p-3">
        <p className="text-xs text-foreground-subtle">Ordem de origem não encontrada localmente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-medium text-foreground">{order.plateMasked ?? "Placa não informada"}</p>
        <Badge variant="outline">JumpPark</Badge>
      </div>
      <p className="text-xs text-foreground-muted">{order.vehicleModel ?? "Modelo não informado"}</p>
      <p className="text-xs text-foreground-muted">{order.clientName ?? "Cliente não informado"}</p>
      <p className="text-xs text-foreground-muted">{order.clientPhoneMasked ?? "Telefone não informado"}</p>
      {order.externalId ? (
        <p className="text-[11px] text-foreground-subtle">
          Ordem {order.externalId}
          {order.orderDate ? ` — ${formatDateBR(order.orderDate)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function PlateConflictReviewCard({ item, decided }: { item: EnrichedPlateConflictReviewViewModel; decided: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="font-mono text-base">Conflito de placa · {item.displayPlate}</CardTitle>
          <p className="mt-1 text-xs text-foreground-subtle">{CONFLICT_TYPE_LABEL[item.conflictType]}</p>
        </div>
        <Badge variant={REVIEW_STATUS_VARIANT[item.status] ?? "outline"}>{REVIEW_STATUS_LABEL[item.status] ?? item.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-foreground-subtle">
          O sistema não criou outro veículo automaticamente porque esta placa já está associada a um veículo existente. É necessária revisão.
        </p>

        {item.existingVehicles.length > 1 ? <Badge variant="warning">Mais de um veículo encontrado para esta placa</Badge> : null}

        <div>
          <p className="mb-2 text-xs font-medium text-foreground-subtle">Veículo(s) já existente(s) no Santa Monica OS</p>
          {item.existingVehicles.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.existingVehicles.map((vehicle) => (
                <ExistingVehicleBlock key={vehicle.vehicleId} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-foreground-subtle">Nenhum veículo existente identificado nesta evidência.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground-subtle">Dados recebidos do JumpPark</p>
          {item.incomingOrders.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.incomingOrders.map((order) => (
                <IncomingOrderBlock key={order.orderId} order={order} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-foreground-subtle">Nenhum dado incoming disponível para esta ordem.</p>
          )}
        </div>

        {item.decidedNotes ? <p className="text-xs italic text-foreground-subtle">Observação: {item.decidedNotes}</p> : null}

        {!decided ? <PlateConflictActions reviewItemId={item.reviewItemId} /> : null}
      </CardContent>
    </Card>
  );
}
