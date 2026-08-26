"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, PlusCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/atendimento", label: "Início", icon: Home, exact: true },
  { href: "/atendimento/buscar", label: "Buscar", icon: Search, exact: false },
  { href: "/atendimento/novo", label: "Novo", icon: PlusCircle, exact: false },
  { href: "/atendimento/execucao", label: "Execução", icon: ListChecks, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

/**
 * Navegação inferior — âncora do app mobile. Área de toque grande (56px+), nunca depende de
 * hover. `pb-[env(safe-area-inset-bottom)]` respeita a barra de gestos do iPhone.
 *
 * `lg:hidden` — em desktop (lg+) não faz sentido uma barra de toque fixa no rodapé; a navegação
 * entre as telas do Atendimento em telas grandes continua pelos mesmos links internos da própria
 * página (ex.: botões de ação da Gestão do Dia). Não reativa a sidebar do AppShell (fora do
 * escopo desta correção) — só remove a barra inferior quando ela não faz sentido.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname ?? "", href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
                active ? "text-foreground" : "text-foreground-subtle",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-6 w-6", active && "text-accent")} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
