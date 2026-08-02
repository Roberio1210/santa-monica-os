"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/attendance/mobile/bottom-nav";
import { cn } from "@/lib/utils/cn";

/** O wizard de Novo Atendimento é um fluxo full-screen, guiado — a navegação inferior fica escondida para não competir com o rodapé de "Avançar" de cada etapa nem convidar a sair no meio do fluxo. */
function isFullScreenFlow(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/atendimento/novo");
}

export function AtendimentoChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullScreen = isFullScreenFlow(pathname);

  return (
    <div className="min-h-screen bg-background">
      <div className={cn("mx-auto min-h-screen max-w-md border-x border-border-subtle/60", !fullScreen && "pb-20")}>{children}</div>
      {!fullScreen ? <BottomNav /> : null}
    </div>
  );
}
