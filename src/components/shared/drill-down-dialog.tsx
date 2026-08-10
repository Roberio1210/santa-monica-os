"use client";

import type { ReactNode } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

/**
 * Missão 29 (sistema gerencial completo) — padrão "Ver detalhes" pedido para todo número exibido
 * no sistema: clicar abre os registros reais que compõem aquele total. `trigger` é o próprio
 * valor renderizado como gatilho clicável; `children` é o conteúdo do modal — deliberadamente
 * `ReactNode` livre (tabela, lista, o que fizer sentido) em vez de um formato genérico de linhas/
 * colunas, porque os dados por trás de cada número (ordens, despesas, compras, clientes...) têm
 * formatos reais muito diferentes entre si. `children` pode ser conteúdo já resolvido no servidor
 * (Server Component pai) — este componente só cuida da mecânica de abrir/fechar.
 */
export function DrillDownDialog({
  trigger,
  title,
  description,
  children,
  triggerClassName,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  /** Sobrescreve o estilo padrão (sublinhado pontilhado, pensado para texto inline em tabelas) — ex.: números grandes de StatCard preferem só um hover sutil, sem sublinhar o valor inteiro. */
  triggerClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-pointer text-left underline decoration-dotted decoration-foreground-subtle underline-offset-4 hover:decoration-accent hover:text-accent",
            triggerClassName,
          )}
        >
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
