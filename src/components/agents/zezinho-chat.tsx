"use client";

import { useState } from "react";
import { Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  "Como está a empresa hoje?",
  "Qual foi o faturamento?",
  "Como está a agenda?",
  "Quais clientes devo chamar?",
  "Existe estoque crítico?",
  "Qual campanha merece atenção?",
  "Quais são as prioridades de hoje?",
];

const demoResponses: Record<string, string> = {
  "Como está a empresa hoje?":
    "[Resposta demonstrativa] De forma geral, o dia está dentro do esperado: receita e ocupação em linha com a média das últimas semanas. Nenhum alerta crítico além do estoque de cera de carnaúba.",
  "Qual foi o faturamento?":
    "[Resposta demonstrativa] Faturamento do dia: R$ 5.980 (dado demonstrativo). Faturamento do mês: R$ 128.400, 80,3% da meta mensal.",
  "Como está a agenda?":
    "[Resposta demonstrativa] A agenda está com ocupação moderada (72%). Há um horário disponível às 17:30.",
  "Quais clientes devo chamar?":
    "[Resposta demonstrativa] Rodrigo Vieira está há 58 dias sem visitar — boa oportunidade de reativação.",
  "Existe estoque crítico?":
    "[Resposta demonstrativa] Sim: cera de carnaúba está em nível crítico, com apenas 3 unidades.",
  "Qual campanha merece atenção?":
    "[Resposta demonstrativa] 'Lavagem expressa fim de semana' está com custo por lead acima da média — considerar pausa.",
  "Quais são as prioridades de hoje?":
    "[Resposta demonstrativa] 1) Repor cera de carnaúba. 2) Contatar Rodrigo Vieira. 3) Avaliar aumento de orçamento na campanha de Vitrificação.",
};

const fallbackResponse =
  "[Resposta demonstrativa] O Zézinho ainda não está conectado a um modelo de IA real. Esta é uma resposta ilustrativa para fins de demonstração da interface.";

export function ZezinhoChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Olá, Robério! Eu sou o Zézinho, seu gerente geral. Ainda estou em modo demonstrativo — em breve vou coordenar todos os especialistas para te ajudar na gestão da Sta Monica.",
    },
  ]);
  const [input, setInput] = useState("");

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: demoResponses[text] ?? fallbackResponse,
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
  }

  return (
    <Card className="flex h-[560px] flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden pt-4">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}>
              {message.role === "assistant" ? (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-elevated text-foreground-subtle">
                  <Bot className="h-4 w-4" />
                </div>
              ) : null}
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "bg-background-elevated text-foreground"
                }`}
              >
                {message.content}
              </div>
              {message.role === "user" ? (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-elevated text-foreground-subtle">
                  <User className="h-4 w-4" />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => sendMessage(suggestion)}
              className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:bg-background-elevated hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo ao Zézinho..."
            className="h-9 flex-1 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button type="submit" size="icon" aria-label="Enviar">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
