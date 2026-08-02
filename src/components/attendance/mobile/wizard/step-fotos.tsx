"use client";

import { useTransition } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { addPhotoAction } from "@/app/atendimento/actions";
import { PHOTO_STAGES, PHOTO_STAGE_LABELS, type DiagnosticPhoto, type PhotoStage } from "@/lib/attendance/types";

/**
 * "Estrutura preparada" — cada toque grava metadado real (`diagnosticId`+`stage`) no banco, mas
 * `url` é sempre `null`: sem upload de arquivo real nesta sprint (decisão de escopo).
 */
export function StepFotos({ diagnosticId, photos, onPhotoAdded }: { diagnosticId: string; photos: DiagnosticPhoto[]; onPhotoAdded: (photo: DiagnosticPhoto) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-subtle">Registre o momento de cada etapa. As fotos ficam anexadas a este atendimento.</p>
      {PHOTO_STAGES.map((stage) => (
        <PhotoStageButton key={stage} stage={stage} diagnosticId={diagnosticId} count={photos.filter((p) => p.stage === stage).length} onPhotoAdded={onPhotoAdded} />
      ))}
    </div>
  );
}

function PhotoStageButton({
  stage,
  diagnosticId,
  count,
  onPhotoAdded,
}: {
  stage: PhotoStage;
  diagnosticId: string;
  count: number;
  onPhotoAdded: (photo: DiagnosticPhoto) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCapture() {
    startTransition(async () => {
      const photo = await addPhotoAction(diagnosticId, stage);
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
        <p className="text-base font-medium text-foreground">{PHOTO_STAGE_LABELS[stage]}</p>
        <p className="text-xs text-foreground-subtle">{isPending ? "Registrando..." : count > 0 ? `${count} foto${count > 1 ? "s" : ""} registrada${count > 1 ? "s" : ""}` : "Tirar Foto"}</p>
      </div>
    </button>
  );
}
