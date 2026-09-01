"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import type { UserRole } from "@/lib/auth/roles";
import type { SituationLevel } from "@/lib/operations/situation";

export interface CurrentUserSummary {
  name: string;
  role: UserRole;
}

/**
 * O módulo Atendimento (`/atendimento/**`) é mobile-first, pensado como um app nativo — tem sua
 * própria casca (`src/app/atendimento/layout.tsx`, navegação inferior, sem sidebar/header de
 * desktop). O AppShell global desliga sua própria chrome para essas rotas, em vez de forçar as
 * duas cascas uma dentro da outra.
 */
function isMobileFirstRoute(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/atendimento");
}

/**
 * `currentUser` vem do layout raiz (Server Component, `getCurrentUser()`). É `null` sempre que
 * não há sessão individual — que é o estado de hoje (`INDIVIDUAL_AUTH_ENABLED` desligado) e
 * também o de qualquer visita antes do login. Nesse caso Sidebar/Header mantêm exatamente o
 * comportamento anterior a esta missão (menu completo, saudação genérica) — nada muda até a
 * sessão individual estar realmente ativa.
 */
export function AppShell({
  children,
  currentUser,
  situation,
}: {
  children: ReactNode;
  currentUser: CurrentUserSummary | null;
  situation: SituationLevel | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isMobileFirstRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} role={currentUser?.role ?? null} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header onOpenMobileMenu={() => setMobileOpen(true)} currentUser={currentUser} situation={situation} />
        <main className="flex-1 space-y-6 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
