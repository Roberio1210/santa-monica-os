"use client";

import { useEffect, useState } from "react";
import { Menu, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/login/actions";
import { userRoleLabels } from "@/lib/auth/roles";
import { situationMeta, type SituationLevel } from "@/lib/operations/situation";
import type { CurrentUserSummary } from "@/components/layout/app-shell";

function getGreeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function Header({
  onOpenMobileMenu,
  currentUser,
  situation,
}: {
  onOpenMobileMenu: () => void;
  currentUser: CurrentUserSummary | null;
  /** Missão UX/Navegação 4B — calculado uma vez no layout raiz (`computeSituation`, mesma fonte da Central de Operações), nunca mais um texto fixo. `null` só se o cálculo falhar (ex.: banco fora do ar) — nesse caso o badge simplesmente não aparece, nunca mostra "normal" sem ter certeza. */
  situation: SituationLevel | null;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const SituationIcon = situation ? situationMeta[situation].icon : null;

  useEffect(() => {
    // Client-only initialization to avoid SSR/client hydration mismatch on time-based values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    setLastUpdated(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date());
      setRefreshing(false);
    }, 600);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="text-foreground-muted hover:text-foreground lg:hidden"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {now ? `${getGreeting(now.getHours())}, ${currentUser?.name ?? "Robério"}` : `Bom dia, ${currentUser?.name ?? "Robério"}`}
          </p>
          <p className="truncate text-xs text-foreground-subtle capitalize">
            {now ? dateFormatter.format(now) : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {currentUser ? (
          <Badge variant="outline" className="hidden sm:inline-flex">
            {userRoleLabels[currentUser.role]}
          </Badge>
        ) : null}
        {situation && SituationIcon ? (
          <Badge variant={situationMeta[situation].variant} className="hidden sm:inline-flex">
            <SituationIcon className="h-3 w-3" />
            {situationMeta[situation].label}
          </Badge>
        ) : null}
        <span className="hidden text-xs text-foreground-subtle sm:inline">
          {lastUpdated ? `Atualizado às ${timeFormatter.format(lastUpdated)}` : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
        {currentUser ? (
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </Button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
