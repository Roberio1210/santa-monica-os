/** Usado quando não há dado confiável disponível — nunca inventar valores. */
export function Unavailable({ label = "Informação indisponível" }: { label?: string }) {
  return <span className="text-sm italic text-foreground-subtle">{label}</span>;
}
