import { Info } from "lucide-react";
import { INSURANCE_DISCLAIMER } from "@/lib/emergency/insurance";

/** Ressalva obrigatória sobre seguro — fonte única do texto (`INSURANCE_DISCLAIMER`). Sempre visível, nunca recolhida. */
export function CoverageDisclaimer() {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-warning/40 bg-warning-bg p-3 text-sm text-foreground">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        {INSURANCE_DISCLAIMER.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
