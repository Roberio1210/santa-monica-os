import type { ClientSignal } from "@/lib/planning/types";

export function ClientSignalBadges({ signals }: { signals: ClientSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {signals.map((signal) => (
        <span key={signal.id} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
          {signal.label}
        </span>
      ))}
    </div>
  );
}
