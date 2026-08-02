"use client";

import { useTransition } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { addPhotoAction } from "@/app/atendimento/actions";
import { DIAGNOSTIC_AREAS, DIAGNOSTIC_AREA_LABELS, type DiagnosticArea, type DiagnosticPhoto } from "@/lib/attendance/types";

/**
 * "Estrutura preparada" — cada toque grava metadado real (`diagnosticId`+`area`) no banco, mas
 * `url` é sempre `null`: sem upload de arquivo real nesta sprint (decisão de escopo). Uma área
 * por etapa do diagnóstico (Pintura, Rodas, Pneus, Vidros, Motor, Interior).
 */
export function StepFotos({ diagnosticId, photos, onPhotoAdded }: { diagnosticId: string; photos: DiagnosticPhoto[]; onPhotoAdded: (photo: DiagnosticPhoto) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-subtle">Anexe fotos de cada etapa do diagnóstico. As fotos ficam anexadas a este atendimento.</p>
      {DIAGNOSTIC_AREAS.map((area) => (
        <PhotoAreaButton key={area} area={area} diagnosticId={diagnosticId} count={photos.filter((p) => p.area === area).length} onPhotoAdded={onPhotoAdded} />
      ))}
    </div>
  );
}

function PhotoAreaButton({
  area,
  diagnosticId,
  count,
  onPhotoAdded,
}: {
  area: DiagnosticArea;
  diagnosticId: string;
  count: number;
  onPhotoAdded: (photo: DiagnosticPhoto) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCapture() {
    startTransition(async () => {
      const photo = await addPhotoAction(diagnosticId, area);
      onPhotoAdded(photo);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCapture}
      disabled={isPending}
      className={cn(
        "flex h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60",
        count > 0 ? "border-accent/40 bg-background-panel" : "border-dashed border-border-subtle",
      )}
    >
      {count > 0 ? <CheckCircle2 className="h-6 w-6 shrink-0 text-accent" /> : <Camera className="h-6 w-6 shrink-0 text-foreground-subtle" />}
      <div className="flex-1">
        <p className="text-base font-medium text-foreground">{DIAGNOSTIC_AREA_LABELS[area]}</p>
        <p className="text-xs text-foreground-subtle">{isPending ? "Registrando..." : count > 0 ? `${count} foto${count > 1 ? "s" : ""} registrada${count > 1 ? "s" : ""}` : "Tirar Foto"}</p>
      </div>
    </button>
  );
}
