import { AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";

/**
 * Missão UX/Navegação 4B — fonte ÚNICA do nível de situação e de como ele é rotulado/estilizado,
 * importável tanto por componentes de servidor (`central-header.tsx`) quanto pelo cabeçalho global
 * client (`header.tsx`, `layout.tsx`). Antes desta missão, o cabeçalho global tinha um texto FIXO
 * ("Situação geral: normal"), nunca calculado — nunca havia duas lógicas divergentes, só um
 * placeholder nunca conectado à fonte real. Este arquivo garante que os dois lugares usem
 * exatamente o mesmo tipo/rótulo, para essa divergência nunca poder acontecer de novo por
 * duplicação de código. Sem "server-only": não faz nenhuma leitura de dado, só tipos/rótulos.
 */
export type SituationLevel = "normal" | "atencao" | "critica";

export interface SituationMeta {
  label: string;
  variant: "positive" | "warning" | "critical";
  icon: LucideIcon;
}

export const situationMeta: Record<SituationLevel, SituationMeta> = {
  normal: { label: "Situação normal", variant: "positive", icon: CheckCircle2 },
  atencao: { label: "Requer atenção", variant: "warning", icon: AlertTriangle },
  critica: { label: "Situação crítica", variant: "critical", icon: AlertTriangle },
};
