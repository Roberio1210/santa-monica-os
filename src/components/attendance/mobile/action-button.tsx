import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Botão de ação grande — área de toque generosa (64px), nunca depende de hover. `active:scale-*`
 * dá o único feedback de toque, discreto, sem exagero de animação.
 */
export function ActionButton({
  href,
  icon: Icon,
  label,
  variant = "outline",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  variant?: "primary" | "outline";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-16 items-center gap-3 rounded-2xl border px-4 text-base font-medium transition-transform active:scale-[0.98]",
        variant === "primary" ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background-panel text-foreground",
      )}
    >
      <Icon className="h-6 w-6 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight className={cn("h-5 w-5 shrink-0", variant === "primary" ? "text-accent-foreground/60" : "text-foreground-subtle")} />
    </Link>
  );
}
