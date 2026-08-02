"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Percent, X } from "lucide-react";
import { registerDiscountAction } from "@/app/assistente-gerente/actions";
import { DISCOUNT_REASONS, DISCOUNT_REASON_LABELS, type DiscountReason } from "@/lib/manager-assistant/types";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Registro de desconto — sem aprovação prévia do proprietário (regra de negócio da missão): o
 * gerente conclui aqui, o proprietário só é informado depois (ver notificações em
 * /assistente-gerente). `originalValue` vem do valor de tabela já calculado da ordem.
 */
export function DiscountForm({ serviceOrderId, originalValue }: { serviceOrderId: string; originalValue: number }) {
  const [open, setOpen] = useState(false);
  const [finalValue, setFinalValue] = useState("");
  const [reason, setReason] = useState<DiscountReason>("negociacao");
  const [appliedBy, setAppliedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background-panel text-sm font-medium text-foreground transition-transform active:scale-[0.98]"
      >
        <Percent className="h-4 w-4" />
        Registrar desconto
      </button>
    );
  }

  function handleSubmit() {
    const finalNumber = Number(finalValue.replace(",", "."));
    if (Number.isNaN(finalNumber) || finalNumber < 0) {
      setError("Informe um valor final válido.");
      return;
    }
    if (finalNumber >= originalValue) {
      setError("O valor final precisa ser menor que o valor original para registrar um desconto.");
      return;
    }
    if (!appliedBy.trim()) {
      setError("Informe quem está aplicando o desconto.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await registerDiscountAction({
        serviceOrderId,
        originalValue,
        finalValue: finalNumber,
        reason,
        appliedBy: appliedBy.trim(),
        notes: notes.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-accent/40 bg-background-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Registrar desconto</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-foreground-subtle active:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="text-xs text-foreground-subtle">Valor de tabela: {formatCurrency(originalValue)}</p>

      <div>
        <label className="text-xs text-foreground-subtle" htmlFor="discount-final-value">
          Valor final
        </label>
        <input
          id="discount-final-value"
          type="text"
          inputMode="decimal"
          value={finalValue}
          onChange={(e) => setFinalValue(e.target.value)}
          placeholder="0,00"
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs text-foreground-subtle" htmlFor="discount-reason">
          Motivo
        </label>
        <select
          id="discount-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as DiscountReason)}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground focus:border-accent focus:outline-none"
        >
          {DISCOUNT_REASONS.map((r) => (
            <option key={r} value={r}>
              {DISCOUNT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-foreground-subtle" htmlFor="discount-applied-by">
          Aplicado por
        </label>
        <input
          id="discount-applied-by"
          type="text"
          value={appliedBy}
          onChange={(e) => setAppliedBy(e.target.value)}
          placeholder="Seu nome"
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs text-foreground-subtle" htmlFor="discount-notes">
          Observações (opcional)
        </label>
        <textarea
          id="discount-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        />
      </div>

      {error ? <p className="text-sm text-critical">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {isPending ? "Registrando..." : "Confirmar desconto"}
      </button>
    </div>
  );
}
