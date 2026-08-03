"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createImportPreviewAction, type ImportUploadState } from "@/app/estoque/auditoria/actions";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: ImportUploadState = { error: null };

export function ImportUploadForm() {
  const [state, formAction, isPending] = useActionState(createImportPreviewAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="file" type="file" accept=".csv,.json" required className={fieldClasses} aria-label="Arquivo CSV ou JSON" />
        <input name="importedBy" type="text" required placeholder="Responsável pela importação" className={fieldClasses} aria-label="Responsável" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Processando..." : "Gerar prévia"}
        </Button>
        {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
      </div>
    </form>
  );
}
