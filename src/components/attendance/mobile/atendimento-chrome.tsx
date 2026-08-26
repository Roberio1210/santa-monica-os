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
      {/*
       * Mobile (padrão): coluna de largura de app (max-w-md) com bordas verticais, como antes.
       * Desktop (lg+): a moldura de "app de celular" some — largura confortável de leitura, sem
       * bordas artificiais — só a navegação inferior (pensada para toque) continua escondida em
       * telas grandes (ver `bottom-nav.tsx`, `lg:hidden`).
       */}
      <div className={cn("mx-auto min-h-screen max-w-md border-x border-border-subtle/60 lg:max-w-5xl lg:border-x-0 lg:px-6", !fullScreen && "pb-20 lg:pb-6")}>{children}</div>
      {!fullScreen ? <BottomNav /> : null}
    </div>
  );
}
