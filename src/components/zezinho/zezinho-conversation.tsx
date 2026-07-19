"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Send, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { ZezinhoAnswer, ZezinhoContext, ZezinhoLink } from "@/lib/zezinho/types";

const EMPTY_CONTEXT: ZezinhoContext = { lastPeriodA: null, lastPeriodB: null, lastKindFilter: null, lastTopic: null };

const SUGGESTED_QUESTIONS = [
  "Como está a empresa hoje?",
  "Compare este mês com o mês passado.",
  "O que está precisando da minha atenção?",
  "Quais serviços mais venderam?",
  "Como está o caixa?",
  "Quais produtos estão acabando?",
  "Quais clientes deveriam retornar?",
  "Qual foi nosso melhor dia do mês?",
];

const LOADING_STAGES = ["Entendendo sua pergunta…", "Consultando movimentações…", "Comparando os períodos…", "Preparando a resposta…"];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  links?: ZezinhoLink[];
  sources?: string[];
  isError?: boolean;
  durationMs?: number;
  /** Só em mensagens do Zézinho: a pergunta do usuário que originou esta resposta ("Refazer análise"). */
  question?: string;
}

function fieldId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Chat do Zézinho — fala com /api/zezinho/ask (nunca acessa banco, token ou variável de ambiente
 * diretamente). Contexto conversacional (últimos períodos/filtro) é mantido só no cliente,
 * nunca persistido no servidor. Cancelamento real via AbortController.
 */
export function ZezinhoConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});
  const contextRef = useRef<ZezinhoContext>(EMPTY_CONTEXT);
  const abortRef = useRef<AbortController | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopStageTimer() {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const userMessage: ChatMessage = { id: fieldId(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setPending(true);
    setStageIndex(0);

    stageTimerRef.current = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 900);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/zezinho/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeText: trimmed, context: contextRef.current }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        setMessages((prev) => [...prev, { id: fieldId(), role: "assistant", text: data.error ?? "Falha ao consultar os dados.", isError: true, question: trimmed }]);
        return;
      }
      const answer = data.answer as ZezinhoAnswer;
      contextRef.current = data.nextContext as ZezinhoContext;
      setMessages((prev) => [...prev, { id: fieldId(), role: "assistant", text: answer.text, links: answer.links, sources: answer.sources, durationMs: data.durationMs, question: trimmed }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => [...prev, { id: fieldId(), role: "assistant", text: "Análise cancelada.", isError: false, question: trimmed }]);
      } else {
        setMessages((prev) => [...prev, { id: fieldId(), role: "assistant", text: "Não consegui me conectar aos dados agora. Tente novamente em instantes.", isError: true, question: trimmed }]);
      }
    } finally {
      stopStageTimer();
      setPending(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function refazer(text: string) {
    void send(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Converse com o Zézinho</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              disabled={pending}
              className="rounded-full border border-border bg-background-elevated px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("rounded-lg p-3 text-sm", m.role === "user" ? "ml-8 bg-accent/10 text-foreground" : "mr-4 border border-border-subtle bg-background-elevated")}>
                {m.role === "user" ? (
                  <p className="font-medium">{m.text}</p>
                ) : (
                  <div className="space-y-2">
                    <p className={cn("whitespace-pre-wrap", m.isError ? "text-critical" : "text-foreground")}>{m.text}</p>
                    {m.links && m.links.length > 0 ? (
                      <div className="flex flex-wrap gap-3 pt-1">
                        {m.links.map((link) => (
                          <Link key={link.href} href={link.href} className="text-xs text-accent hover:underline">
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {!m.isError && m.question ? (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-foreground-subtle">
                        <button type="button" onClick={() => refazer(m.question!)} className="hover:underline">
                          Refazer análise
                        </button>
                        {m.sources && m.sources.length > 0 ? (
                          <button type="button" onClick={() => setOpenSources((prev) => ({ ...prev, [m.id]: !prev[m.id] }))} className="hover:underline">
                            {openSources[m.id] ? "Ocultar dados utilizados" : "Ver dados utilizados"}
                          </button>
                        ) : null}
                        {m.durationMs !== undefined ? <span>{(m.durationMs / 1000).toFixed(1)}s</span> : null}
                      </div>
                    ) : null}
                    {openSources[m.id] && m.sources ? (
                      <ul className="space-y-0.5 rounded border border-border-subtle bg-background p-2 text-xs text-foreground-subtle">
                        {m.sources.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {pending ? (
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-background-elevated p-3">
            <p className="text-sm text-foreground-subtle">{LOADING_STAGES[stageIndex]}</p>
            <Button type="button" variant="outline" size="sm" onClick={cancel}>
              <X className="h-3 w-3" />
              Cancelar
            </Button>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            name="freeText"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte alguma coisa ao Zézinho..."
            className="h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Pergunta livre para o Zézinho"
            disabled={pending}
          />
          <Button type="submit" disabled={pending || !input.trim()} aria-label="Enviar pergunta">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
