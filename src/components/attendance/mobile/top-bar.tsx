"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Barra superior mínima — título + voltar quando faz sentido navegar para trás. Nunca a
 * saudação/relógio global (isso é só da Home). `pt-[env(safe-area-inset-top)]` respeita o notch.
 */
export function MobileTopBar({ title, showBack = false, action }: { title: string; showBack?: boolean; action?: ReactNode }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border-subtle bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 flex-1 items-center gap-1">
        {showBack ? (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Voltar"
            className="-ml-2 flex h-11 w-11 items-center justify-center text-foreground-muted active:text-foreground"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
      </div>
      {action ? <div className="flex h-14 items-center">{action}</div> : null}
    </header>
  );
}
