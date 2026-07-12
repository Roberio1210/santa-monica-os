"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { informAccountBalanceAction } from "@/app/financeiro/fluxo-de-caixa/actions";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface InformBalanceFormProps {
  financialAccountId: string;
  currentBalance: number;
}

export function InformBalanceForm({ financialAccountId, currentBalance }: InformBalanceFormProps) {
  const [state, formAction, isPending] = useActionState(informAccountBalanceAction, { error: null });

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="financialAccountId" value={financialAccountId} />
      <input
        name="informedBalance"
        type="text"
        inputMode="decimal"
        defaultValue={currentBalance}
        className={fieldClasses}
        placeholder="Saldo conferido"
        aria-label="Saldo conferido"
      />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "..." : "Conferir"}
      </Button>
      {state.error ? <span className="text-xs text-critical">{state.error}</span> : null}
    </form>
  );
}
