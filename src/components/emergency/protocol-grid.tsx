import Link from "next/link";
import { BreakableText } from "@/components/emergency/breakable-text";
import { ProtocolIcon } from "@/components/emergency/protocol-icon";
import { cn } from "@/lib/utils/cn";
import type { EmergencyProtocol } from "@/lib/emergency/types";

/** "O que aconteceu?" — um card grande por protocolo ativo, na ordem configurada. Duas colunas no celular. */
export function ProtocolGrid({ protocols }: { protocols: EmergencyProtocol[] }) {
  return (
    <section aria-labelledby="emergencia-o-que-aconteceu" className="space-y-3">
      <h2 id="emergencia-o-que-aconteceu" className="text-lg font-semibold text-foreground">
        O que aconteceu?
      </h2>
      {protocols.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nenhum protocolo ativo cadastrado.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {protocols.map((protocol) => {
            const critical = protocol.priority === "critica";
            return (
              <li key={protocol.id} className="min-w-0">
                <Link
                  href={`/emergencia/protocolo/${protocol.slug}`}
                  className={cn(
                    "flex min-h-28 h-full flex-col justify-between gap-3 rounded-2xl border p-4 transition-transform active:scale-[0.98]",
                    critical ? "border-critical/50 bg-critical-bg" : "border-border bg-background-panel",
                  )}
                >
                  <ProtocolIcon slug={protocol.slug} className={cn("h-7 w-7", critical ? "text-critical" : "text-foreground-muted")} />
                  <span className="text-base font-semibold leading-tight text-foreground wrap-break-word">
                    <BreakableText text={protocol.title} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
