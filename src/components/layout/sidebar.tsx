"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight, Sparkles, X } from "lucide-react";
import { APP_MODULES, resolveActiveModuleId, resolveModuleLinkHref } from "@/components/navigation/app-modules";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/lib/auth/roles";

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** `null` = sem sessão individual (estado de hoje) — menu completo, sem filtro, igual sempre foi. */
  role: UserRole | null;
}

/**
 * Missão UX/Navegação 3 — navegação principal reduzida a ~9 módulos (`APP_MODULES`), no lugar dos
 * 48 itens antigos (`nav-items.ts`, mantido só como referência histórica). Nenhuma rota antiga foi
 * apagada: as que antes tinham item próprio na lateral agora são atalhos dentro da página de cada
 * módulo (`ModuleShortcuts`) — ver `app-modules.ts` para a tabela completa rota antiga → módulo.
 */
export function Sidebar({ mobileOpen, onCloseMobile, role }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const activeModuleId = resolveActiveModuleId(pathname);
  const visibleItems = APP_MODULES.map((module) => ({ module, href: resolveModuleLinkHref(module, role) })).filter(
    (entry): entry is { module: (typeof APP_MODULES)[number]; href: string } => entry.href !== null,
  );

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-border bg-background-panel transition-all duration-200 lg:sticky lg:top-0 lg:translate-x-0",
          collapsed ? "w-[76px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            {!collapsed ? (
              <span className="truncate text-sm font-semibold tracking-tight">Santa Monica OS</span>
            ) : null}
          </div>
          <button
            type="button"
            className="text-foreground-subtle hover:text-foreground lg:hidden"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {visibleItems.map(({ module, href }) => {
            const active = module.id === activeModuleId;
            const Icon = module.icon;
            return (
              <Link
                key={module.id}
                href={href}
                onClick={onCloseMobile}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "text-foreground-muted hover:bg-background-elevated hover:text-foreground border border-transparent",
                )}
                title={collapsed ? module.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="truncate">{module.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle p-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-foreground-muted hover:bg-background-elevated hover:text-foreground lg:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed ? "Recolher menu" : null}
          </button>
        </div>
      </aside>
    </>
  );
}
