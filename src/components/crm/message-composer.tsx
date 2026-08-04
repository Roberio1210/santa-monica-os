"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MESSAGE_TYPE_LABEL, type MessageType, type GeneratedMessage } from "@/lib/crm-intelligente/messages";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Gera mensagem para revisão (Missão 25, seção 9) — nunca envia nada. `messages` já vem
 * pré-calculado do servidor (função pura, sem I/O); este componente só troca o tipo selecionado,
 * permite editar o texto antes de copiar, e mostra os avisos honestos gerados junto com o texto.
 */
export function MessageComposer({ messages }: { messages: Record<MessageType, GeneratedMessage> }) {
  const types = Object.keys(messages) as MessageType[];
  const [selected, setSelected] = useState<MessageType>(types[0]);
  const [text, setText] = useState(messages[types[0]].text);
  const [copied, setCopied] = useState(false);

  function handleTypeChange(type: MessageType) {
    setSelected(type);
    setText(messages[type].text);
    setCopied(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ambiente sem clipboard (ex.: sem HTTPS) — usuário copia manualmente do campo de texto.
    }
  }

  const current = messages[selected];

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={selected} onChange={(e) => handleTypeChange(e.target.value as MessageType)} className={fieldClasses} aria-label="Tipo de mensagem">
          {types.map((t) => (
            <option key={t} value={t}>
              {MESSAGE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copiado!" : "Copiar texto"}
        </Button>
      </div>

      {current.warnings.length > 0 && (
        <div className="space-y-1">
          {current.warnings.map((w) => (
            <Badge key={w} variant="warning" className="mr-1">
              {w}
            </Badge>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-border bg-background-elevated p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
        aria-label="Texto da mensagem (revisável antes de enviar manualmente)"
      />
      <p className="text-xs text-foreground-subtle">Rascunho para revisão — nada é enviado automaticamente. Copie e envie manualmente pelo canal que preferir.</p>
    </div>
  );
}
