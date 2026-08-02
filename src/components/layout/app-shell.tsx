"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

/**
 * O módulo Atendimento (`/atendimento/**`) é mobile-first, pensado como um app nativo — tem sua
 * própria casca (`src/app/atendimento/layout.tsx`, navegação inferior, sem sidebar/header de
 * desktop). O AppShell global desliga sua própria chrome para essas rotas, em vez de forçar as
 * duas cascas uma dentro da outra.
 */
function isMobileFirstRoute(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/atendimento");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isMobileFirstRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 space-y-6 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
