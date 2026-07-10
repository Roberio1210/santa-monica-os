import { cn } from "@/lib/utils/cn";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "positive" | "critical" | "warning" | "info" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-background-elevated text-foreground border-border",
  positive: "bg-positive-bg text-positive border-positive/30",
  critical: "bg-critical-bg text-critical border-critical/30",
  warning: "bg-warning-bg text-warning border-warning/30",
  info: "bg-info-bg text-info border-info/30",
  outline: "bg-transparent text-foreground-muted border-border",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
