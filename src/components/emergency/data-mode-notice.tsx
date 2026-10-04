import { TriangleAlert } from "lucide-react";
import type { EmergencyDataMode } from "@/lib/emergency/service";

const MESSAGES: Record<Exclude<EmergencyDataMode, "normal">, string> = {
  contingencia: "Modo de contingência: o banco de dados não respondeu. Exibindo o conteúdo inicial da Central — contatos e protocolos podem estar desatualizados.",
  nao_inicializado: "A Central ainda não foi carregada no banco de dados. Exibindo o conteúdo inicial — peça ao administrador para concluir a configuração.",
};

export function DataModeNotice({ mode }: { mode: EmergencyDataMode }) {
  if (mode === "normal") return null;
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-warning-bg p-3 text-sm text-foreground">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <p>{MESSAGES[mode]}</p>
    </div>
  );
}
