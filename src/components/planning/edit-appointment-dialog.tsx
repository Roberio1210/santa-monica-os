"use client";

import { useState, useTransition } from "react";
import { assignVehiclePlateAction, updateAppointmentDetailsAction } from "@/app/planejamento/actions";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { DayAppointmentView } from "@/lib/planning/types";
import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";

/**
 * Missão 48 (Partes B/C/D/J) — modal de edição segura, só o wrapper de abrir/fechar. O conteúdo
 * real vive em `EditAppointmentForm` (mesmo arquivo, exportado à parte) para poder ser testado
 * estruturalmente sem depender do `open` do Dialog (o portal do Radix não renderiza fechado).
 */
export function EditAppointmentDialog({ appointment, serviceCatalog }: { appointment: DayAppointmentView; serviceCatalog: ServiceCatalogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="h-8 rounded-full border border-border-subtle px-3 text-xs font-medium text-foreground-muted transition-colors active:scale-[0.98]">
        Editar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar agendamento</DialogTitle>
          <DialogDescription>Cliente e veículo não podem ser trocados por aqui.</DialogDescription>
        </DialogHeader>
        <EditAppointmentForm appointment={appointment} serviceCatalog={serviceCatalog} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cliente/telefone/veículo são SEMPRE somente leitura (Parte K — trocar `customerId`/`vehicleId`
 * fica fora desta missão, implicações de identidade/JumpPark). Placa nunca entra no UPDATE do
 * appointment — é atributo do veículo (Parte J), preenchida só via `assignVehiclePlateAction`
 * (`assignPlateToVehicle` já auditado), nunca substituída automaticamente quando já existe.
 * Duração não é um campo do formulário: o backend sempre recalcula a partir do serviço escolhido
 * (Parte C) — nunca confia num valor vindo do browser.
 */
export function EditAppointmentForm({
  appointment,
  serviceCatalog,
  onSaved,
}: {
  appointment: DayAppointmentView;
  serviceCatalog: ServiceCatalogEntry[];
  onSaved: () => void;
}) {
  const [serviceId, setServiceId] = useState(appointment.serviceId);
  const [date, setDate] = useState(saoPauloDateISO(new Date(appointment.scheduledAt)));
  const [time, setTime] = useState(saoPauloTimeHM(new Date(appointment.scheduledAt)));
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [currentPlate, setCurrentPlate] = useState(appointment.plate);
  const [plateInput, setPlateInput] = useState("");
  const [plateError, setPlateError] = useState<string | null>(null);
  const [isPlatePending, startPlateTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentDetailsAction({
        appointmentId: appointment.id,
        serviceId,
        date,
        time,
        notes: notes.trim() ? notes.trim() : null,
        expectedUpdatedAt: appointment.updatedAt,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  function handleAssignPlate() {
    setPlateError(null);
    const normalized = plateInput.trim().toUpperCase();
    if (!normalized) return;
    startPlateTransition(async () => {
      const result = await assignVehiclePlateAction(appointment.vehicleId, normalized);
      if (result.error) {
        setPlateError(result.error);
        return;
      }
      setCurrentPlate(normalized);
      setPlateInput("");
    });
  }

  return (
    <DialogBody className="space-y-3">
      <ReadOnlyField label="Cliente" value={appointment.customerName ?? "Cliente sem nome cadastrado"} />
      <ReadOnlyField label="Telefone" value={appointment.phone ?? "Não informado"} />
      <ReadOnlyField label="Veículo" value={appointment.vehicleLabel} />

      <div>
        <p className="text-xs text-foreground-subtle">Placa</p>
        {currentPlate ? (
          <p className="text-sm text-foreground">{currentPlate}</p>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <input
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              placeholder="Placa não informada"
              className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={handleAssignPlate}
              disabled={isPlatePending || plateInput.trim().length === 0}
              className="h-9 shrink-0 rounded-lg border border-accent px-3 text-xs font-medium text-accent disabled:opacity-50"
            >
              {isPlatePending ? "Salvando..." : "Informar placa"}
            </button>
          </div>
        )}
        {plateError ? <p className="mt-1 text-xs text-critical">{plateError}</p> : null}
      </div>

      <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
        Serviço
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
          {serviceCatalog.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
          Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
          Horário
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-foreground-subtle">
        Observações
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
      </label>

      {error ? <p className="text-sm text-critical">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        <DialogClose asChild>
          <button type="button" className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground-muted" disabled={isPending}>
            Voltar
          </button>
        </DialogClose>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="h-9 rounded-lg border border-accent bg-accent/10 px-3 text-xs font-medium text-accent disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </DialogBody>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
