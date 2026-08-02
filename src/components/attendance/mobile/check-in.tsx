"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, X } from "lucide-react";
import { useCustomerSearch } from "@/components/attendance/mobile/use-customer-search";
import { checkInArrivalAction } from "@/app/atendimento/actions";
import type { SearchResult } from "@/lib/attendance/service";

/**
 * "Cliente Chegou" — check-in rápido sem telas intermediárias: busca inline (mesma lógica de
 * `/atendimento/buscar`), 1 toque registra a chegada (visita + ordem em `recebido`, horário
 * real de agora) e a entrada aparece na lista "Entradas" da própria tela. Diagnóstico e demais
 * etapas ficam para depois, quando o gerente abrir a ordem — este botão só resolve "o carro
 * chegou agora".
 */
export function CheckIn() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { isSearchable, isLoading, isNotFound, results } = useCustomerSearch(query);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setQuery("");
  }

  function handleArrival(customerId: string, vehicleId: string) {
    startTransition(async () => {
      await checkInArrivalAction(customerId, vehicleId);
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-medium text-accent-foreground transition-transform active:scale-[0.98]"
      >
        <UserCheck className="h-5 w-5" />
        Cliente Chegou
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-accent/40 bg-background-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Cliente Chegou</p>
        <button type="button" onClick={reset} aria-label="Fechar" className="text-foreground-subtle active:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <input
        type="text"
        inputMode="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Telefone, placa ou nome do cliente"
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
      />

      {isLoading ? <p className="text-sm text-foreground-subtle">Buscando...</p> : null}
      {!isLoading && isNotFound ? <p className="text-sm text-foreground-subtle">Cliente não encontrado — use Novo Atendimento para cadastrar.</p> : null}

      {!isLoading && isSearchable && results.length > 0 ? (
        <div className="space-y-2">
          {results.map((result) => (
            <CheckInResultRow key={result.customer.id} result={result} pending={isPending} onArrive={handleArrival} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckInResultRow({ result, pending, onArrive }: { result: SearchResult; pending: boolean; onArrive: (customerId: string, vehicleId: string) => void }) {
  const vehicles = result.history.vehicles;
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(result.matchedVehicleId ?? (vehicles.length === 1 ? vehicles[0].id : null));

  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-sm font-medium text-foreground">{result.customer.name ?? "Cliente sem nome cadastrado"}</p>
      <p className="text-xs text-foreground-subtle">{result.customer.phone ?? "Sem telefone cadastrado"}</p>

      {vehicles.length === 0 ? (
        <p className="mt-2 text-xs text-foreground-subtle">Sem veículo cadastrado — use Novo Atendimento para cadastrar o veículo.</p>
      ) : vehicles.length > 1 && !selectedVehicleId ? (
        <div className="mt-2 space-y-1.5">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => setSelectedVehicleId(vehicle.id)}
              className="flex h-10 w-full items-center rounded-lg border border-border-subtle px-3 text-left text-sm text-foreground active:opacity-70"
            >
              {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}
              {vehicle.plate ? ` · ${vehicle.plate}` : ""}
            </button>
          ))}
        </div>
      ) : selectedVehicleId ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onArrive(result.customer.id, selectedVehicleId)}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Registrando..." : "Confirmar chegada"}
        </button>
      ) : null}
    </div>
  );
}
