"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { askZezinhoAction, type AskZezinhoState } from "@/app/zezinho/actions";
import type { ZezinhoQuestion } from "@/lib/zezinho/service";

const initialState: AskZezinhoState = { question: null, answer: null, error: null };

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Somente leitura: as respostas vêm de services reais (ver lib/zezinho/service.ts) — nunca cria,
 * altera, paga ou exclui nada.
 */
export function ZezinhoConversation({ questions }: { questions: ZezinhoQuestion[] }) {
  const [state, formAction, isPending] = useActionState(askZezinhoAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perguntas rápidas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap gap-2">
          {questions.map((q) => (
            <form key={q.id} action={formAction}>
              <input type="hidden" name="questionId" value={q.id} />
              <button
                type="submit"
                className="rounded-full border border-border bg-background-elevated px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                disabled={isPending}
              >
                {q.label}
              </button>
            </form>
          ))}
        </div>

        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="questionId" value="" />
          <input name="freeText" type="text" placeholder="Ou digite sua pergunta..." className={fieldClasses} aria-label="Pergunta livre para o Zézinho" />
          <Button type="submit" disabled={isPending} aria-label="Enviar pergunta">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {isPending ? <p className="text-sm text-foreground-subtle">Consultando os dados...</p> : null}

        {state.question || state.answer || state.error ? (
          <div className="space-y-2 rounded-lg border border-border-subtle bg-background-elevated p-3">
            {state.question ? <p className="text-xs font-medium text-foreground-subtle">Você perguntou: {state.question}</p> : null}
            {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
            {state.answer ? (
              <>
                <p className="text-sm text-foreground">{state.answer.text}</p>
                {state.answer.links.length > 0 ? (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {state.answer.links.map((link) => (
                      <Link key={link.href} href={link.href} className="text-xs text-accent hover:underline">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
