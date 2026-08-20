"use client";

import { useActionState } from "react";
import { setPasswordAction, type SetPasswordFormState } from "@/app/definir-senha/actions";

const fieldClasses =
  "h-10 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: SetPasswordFormState = { error: null };

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPasswordAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1">
        <label htmlFor="password" className="text-xs font-medium text-foreground-muted">
          Nova senha (mínimo 8 caracteres)
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={fieldClasses} />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="text-xs font-medium text-foreground-muted">
          Confirmar senha
        </label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className={fieldClasses} />
      </div>
      {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Definir senha e entrar"}
      </button>
    </form>
  );
}
