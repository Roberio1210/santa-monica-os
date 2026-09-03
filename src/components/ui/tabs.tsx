import { cn } from "@/lib/utils/cn";

export interface TabItem {
  value: string;
  label: string;
}

/**
 * Missão Financeiro 5B — primitive de abas simples. Missão Financeiro 5D.5 — trocado de `<Link>`
 * (Next.js Client Component, exige hidratação) para `<a href>` puro: navegação garantida por
 * clique, sem depender de nenhum JS de cliente carregar/hidratar antes. Cada aba é sempre uma URL
 * real (`hrefFor(value)`), recarregamento de página inteira é aceitável aqui — não precisamos de
 * transição SPA. Teclado funciona nativamente (âncoras são focáveis via Tab, ativáveis via Enter).
 */
export function Tabs({ items, active, hrefFor }: { items: TabItem[]; active: string; hrefFor: (value: string) => string }) {
  return (
    <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map((item) => {
        const isActive = item.value === active;
        return (
          <a
            key={item.value}
            href={hrefFor(item.value)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:border-border hover:text-foreground",
            )}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
}
