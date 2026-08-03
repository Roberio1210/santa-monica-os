"use client";

import { useState, useTransition } from "react";
import { setCapacityConfigAction } from "@/app/planejamento/actions";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";

export function CapacityConfigForm() {
  const [open, setOpen] = useState(false);
  const [boxes, setBoxes] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent underline">
        Configurar capacidade
      </button>
    );
  }

  function handleSubmit() {
    const boxesCount = Number(boxes);
    const dailyOperatingMinutes = Number(minutes);
    if (!boxesCount || !dailyOperatingMinutes) {
      setError("Informe boxes disponíveis e minutos de expediente.");
      return;
    }
    startTransition(async () => {
      const result = await setCapacityConfigAction(boxesCount, dailyOperatingMinutes);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-border-subtle bg-background-elevated p-3">
      {error ? <p className="text-xs text-critical">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClasses} htmlFor="capacity-boxes">
            Boxes disponíveis
          </label>
          <input id="capacity-boxes" type="number" min={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} className={fieldClasses} placeholder="Ex.: 3" />
        </div>
        <div>
          <label className={labelClasses} htmlFor="capacity-minutes">
            Minutos de expediente/dia
          </label>
          <input id="capacity-minutes" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={fieldClasses} placeholder="Ex.: 480" />
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="h-9 w-full rounded-lg bg-accent text-xs font-medium text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Salvando..." : "Salvar capacidade"}
      </button>
    </div>
  );
}
