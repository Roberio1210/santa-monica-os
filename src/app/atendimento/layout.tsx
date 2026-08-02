import type { ReactNode } from "react";
import { AtendimentoChrome } from "@/components/attendance/mobile/atendimento-chrome";

/**
 * Casca mobile-first do Atendimento Inteligente — pensada como app nativo, não como o desktop
 * adaptado. Sem sidebar, sem header de gestão geral: só o conteúdo da página + navegação
 * inferior fixa. Em telas largas, o conteúdo fica centralizado numa coluna de largura de app
 * (max-w-md) — desktop é secundário, nunca o alvo principal do layout.
 */
export default function AtendimentoLayout({ children }: { children: ReactNode }) {
  return <AtendimentoChrome>{children}</AtendimentoChrome>;
}
