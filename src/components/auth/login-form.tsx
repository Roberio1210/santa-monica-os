"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/app/login/actions";

const fieldClasses =
  "h-10 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: LoginFormState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="email" className="text-xs font-medium text-foreground-muted">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className={fieldClasses} />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-xs font-medium text-foreground-muted">
          Senha
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={fieldClasses} />
      </div>
      {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
