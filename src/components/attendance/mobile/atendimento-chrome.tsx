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
       * Desktop (lg+): `lg:max-w-none` remove o teto de largura por completo — mesmo padrão do
       * `<main>` do AppShell (`app-shell.tsx`), que também nunca usa max-width, só padding.
       * Um teto fixo (ex.: max-w-5xl) ainda deixaria metade da tela vazia em monitores comuns
       * (1440px/1920px) — o objetivo é ocupar a largura real do viewport, não outro valor fixo.
       */}
      <div className={cn("mx-auto min-h-screen max-w-md border-x border-border-subtle/60 lg:max-w-none lg:border-x-0 lg:px-6", !fullScreen && "pb-20 lg:pb-6")}>{children}</div>
      {!fullScreen ? <BottomNav /> : null}
    </div>
  );
}
