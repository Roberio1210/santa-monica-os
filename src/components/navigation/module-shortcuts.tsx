import Link from "next/link";
import type { ModuleShortcut } from "@/components/navigation/app-modules";

/**
 * Missão UX/Navegação 3 — atalhos para as rotas que antes tinham item próprio na lateral. Usado
 * nas páginas-hub de cada módulo (Central de Operações, Financeiro, Estoque, Configurações) para
 * preservar acesso de um clique, sem reintroduzir dezenas de itens na navegação principal.
 * Renderiza nada quando `shortcuts` está vazio (módulos de rota única, ex.: Marketing/Zézinho).
 *
 * Missão UX/Navegação 4B — `title` opcional adiciona um cabeçalho visível acima da lista, para
 * módulos que precisam de hierarquia entre grupos (ex.: "Operação" / "Gestão" na Central de
 * Operações, em vez de uma fileira única de botões idênticos). Sem `title`, comportamento
 * idêntico ao de antes (lista simples, só com `aria-label`).
 */
export function ModuleShortcuts({ shortcuts, label = "Acesso rápido", title }: { shortcuts: ModuleShortcut[]; label?: string; title?: string }) {
  if (shortcuts.length === 0) return null;
  return (
    <div>
      {title ? <h3 className="mb-2 text-xs font-medium text-foreground-muted">{title}</h3> : null}
      <nav aria-label={title ?? label} className="flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background-elevated px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/40 hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{shortcut.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
