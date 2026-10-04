"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { toggleContactActiveAction, toggleProtocolActiveAction, type FormActionState } from "@/app/configuracoes/emergencia/actions";

const initialState: FormActionState = { error: null, success: null };

/** Ativar/desativar contato ou protocolo — nunca exclui (o registro e o histórico em `audit_logs` permanecem). */
export function ToggleActiveForm({ entity, id, active, updatedAt }: { entity: "contact" | "protocol"; id: string; active: boolean; updatedAt: Date }) {
  const [state, formAction, isPending] = useActionState(entity === "contact" ? toggleContactActiveAction : toggleProtocolActiveAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt.toISOString()} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" variant="outline" disabled={isPending} className="h-11">
        {isPending ? "Salvando..." : active ? "Desativar" : "Reativar"}
      </Button>
      {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
      {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
    </form>
  );
}
