# Arquitetura Zézinho 5.0 — Diretor de Operações

Documento de arquitetura (sem implementação), preparado em 20/07/2026 para aprovação antes do
início desta fase. Nenhum código foi alterado para produzir este documento.

## 1. Diagnóstico honesto: o que já é real vs. o que é só metadado

Antes de propor qualquer coisa nova, o estado real do que existe hoje — porque o pedido lista
fontes (Google Calendar, Stone, Google Business, Meta Ads, Instagram, WhatsApp) que **não
existem como integração real em nenhum lugar do projeto**:

| Fonte | Status real | Evidência |
| --- | --- | --- |
| JumpPark, Financeiro, Fluxo de Caixa, DRE, CRM, Estoque, Central de Operações, Metas, Contexto Situacional | **Real** | Construídas e testadas nas sprints anteriores, todas já no catálogo de ferramentas do Zézinho (`tools/registry.ts`) |
| Previsão do tempo (OpenWeather) | **Real, em construção** | Chave já cadastrada; camada "Weather Intelligence" (provider abstraction, cache, timeout, logging) foi iniciada na tarefa anterior e ainda não foi concluída — retomo nesta fase (seção 6, checkpoint A1) |
| Agenda | **Mock** | `src/data/mock/schedule.ts` |
| Google Calendar / Google Business / Sheets | **Metadado apenas** — `isGoogleConfigured()` retorna `false` fixo, nenhuma chamada real, nenhum OAuth implementado | `src/lib/integrations/google/index.ts` |
| Stone | **Metadado apenas** — `isStoneConfigured()` retorna `false` fixo | `src/lib/integrations/stone/index.ts` |
| Meta Ads / Instagram | **Metadado apenas** — `isMetaConfigured()` retorna `false` fixo | `src/lib/integrations/meta/index.ts` |
| WhatsApp Business | **Metadado apenas** — `isWhatsappConfigured()` retorna `false` fixo | `src/lib/integrations/whatsapp/index.ts` |

Isso muda a forma de propor esta fase: **não dá para construir "Diretor de Operações completo"
de uma vez**, porque 6 das fontes citadas no pedido não existem como integração nenhuma —
cada uma precisaria de OAuth, credenciais, modelagem de dado e testes próprios, do mesmo
tamanho de esforço que JumpPark, Financeiro ou CRM tiveram (múltiplos checkpoints cada). Proponho
dividir em duas fases distintas (seção 6): a mudança **cognitiva** (como o Zézinho pensa e fala)
usando o que já é real, e a expansão de **sinais externos** (uma integração nova por vez, cada
uma sua própria sequência de checkpoints futura, fora da aprovação de hoje).

## 2. O que muda de verdade (não é feature nova, é maturidade do pipeline já existente)

O pedido não descreve uma arquitetura diferente da 3.0/4.0 — descreve o pipeline de raciocínio
(intenção → objetivo → memória → planner → ferramentas → raciocínio → narrador) **fazendo mais
uso de si mesmo**: montando o contexto de todas as fontes reais disponíveis automaticamente,
formalizando confiança com base declarada, e — a mudança mais importante — **parando de esconder
o raciocínio**.

Isso é uma reversão parcial e deliberada de uma decisão da Sprint 3.0: lá, o raciocínio interno
era propositalmente oculto ("nunca revelar a cadeia de raciocínio interna... mostrar só
conclusão, fatos, limitações, fontes, confiança" — narrator/narrate.ts). O pedido de hoje quer o
oposto para perguntas operacionais: o raciocínio *é* a resposta ("Analisei: histórico das
últimas quintas; quantidade de veículos; ticket médio; meta diária; clima; agenda. Hoje estamos
8% acima do ritmo..."). Vou tratar isso como uma mudança de filosofia explícita e documentada,
não uma inconsistência — "Ver fundamentos" continua existindo para aprofundamento (dados brutos,
fontes, o que faltou), mas deixa de ser o único lugar onde o "porquê" aparece.

## 3. Componentes cognitivos que precisam existir

### 3.1 Modelo formal de Confiança (novo)

Hoje `ReasoningResult.confidence` é um enum solto (`"alta" | "media" | "baixa"`, Sprint 3.0) sem
explicação anexada. Passa a ser uma estrutura:

```
ConfidenceAssessment {
  level: "alta" | "media" | "baixa";
  basis: string[];   // "histórico de 18 segundas-feiras", "clima confirmado", "agenda do dia"...
  gaps: string[];    // "Integração de agenda ainda não configurada" — já existe como Gap (seção 3.3 da 4.0), só passa a alimentar isto também
}
```

`basis` não é texto solto — é derivado dos `factKeys`/`supportingFindingKeys` que já existem em
`Finding`/`Hypothesis`/`Recommendation` desde a Sprint 3.0. Isto é, na prática, **dar nome e
visibilidade a algo que os dados internos já carregam**, não recalcular nada novo.

### 3.2 Montagem de Contexto Operacional (extensão da Camada Situacional 4.0)

Hoje o planner busca só o necessário por objetivo (correto, mantém-se). O que falta: para
perguntas amplas do tipo "como estamos hoje/nesta semana" (`status_check`/`outlook`), o contexto
situacional (estágio do expediente, amostra suficiente) precisa se combinar automaticamente com
**todas** as fontes reais relevantes de uma vez — situacional + histórico + clima + metas +
alertas + caixa — em vez de escolher uma só. Isso é a conclusão dos checkpoints Z2/Z3 da Sprint
4.0 que ainda não foram feitos, ampliada para reconhecer explicitamente o `demand_outlook` como o
objetivo "monte o quadro completo", não um objetivo estreito como os demais.

### 3.3 Narrador com raciocínio explicado + recomendação sempre presente

Duas mudanças na Etapa 5 (`narrator/`):

1. Para `status_check`/`outlook`/`diagnose` (perguntas amplas), a resposta passa a citar
   explicitamente o que foi analisado ("Analisei: X, Y, Z") antes da conclusão — não é um
   template fixo, é montado a partir da lista real de fontes que o `ReasoningResult` carrega
   (`sources`, já existente).
2. **Toda** resposta operacional (não só `recommend`) termina com uma seção prática de próximos
   passos quando o raciocínio produziu pelo menos uma recomendação — mesmo `compare`/`diagnose`/
   `status_check` passam a ter isso, o que hoje só acontece em `recommend`/`evaluate_decision`.

### 3.4 Onde as integrações futuras (Fase B) vão entrar — sem construir nenhuma agora

O catálogo de ferramentas (`tools/`) já é exatamente o mecanismo certo para isso — cada
integração nova vira uma `Tool` a mais, nunca uma tela de exibição direta:

| Fonte (Fase B, futura) |"Sinal" que alimentaria o raciocínio (não a exibição bruta) |
| --- | --- |
| Google Calendar | Disponibilidade de horário (não lista de eventos) |
| Google Business | Tendência de avaliação (não a nota isolada) |
| Meta Ads | Retorno por real investido (não a campanha em si) |
| Instagram | Alcance/engajamento (não curtidas isoladas) |
| Stone | Fluxo/reconciliação (provavelmente convergindo para o Fluxo de Caixa já real, a confirmar quando chegar a vez) |
| WhatsApp | Indício comercial — **só metadado nesta primeira etapa** (mensagens sem resposta, tempo médio de resposta), nunca leitura de conteúdo de conversa sem uma decisão de privacidade explícita à parte (seção 7, pergunta 3) |

## 4. Exemplo de resposta-alvo (para validar o entendimento antes de implementar)

> "Robério, minha avaliação é que o movimento está dentro do esperado para uma quinta-feira às
> 10h. Analisei o histórico das últimas quintas, a quantidade de veículos até agora, o ticket
> médio, a meta diária, o clima e a agenda. Hoje estamos 8% acima do ritmo médio neste horário —
> por isso considero o movimento bom. **Confiança: alta**, baseado em histórico de 18
> quintas-feiras, clima confirmado e operação atual.
>
> O que eu faria agora: 1) ligar para os clientes sem resposta; 2) oferecer vitrificação aos
> carros já agendados; 3) acompanhar o clima às 15h."

Dá para montar isto **hoje**, sem nenhuma integração nova — histórico, ticket, meta, clima e
operação atual já são reais. "Agenda" e "clientes sem resposta" (WhatsApp) são as duas peças que
dependem da Fase B; até lá, a resposta deve honestamente dizer que não tem esse dado, não fingir.

## 5. O que NÃO muda

- Somente leitura, nunca inventar dado, mesmo padrão de honestidade em gaps.
- Planner seletivo continua — "montar o contexto operacional completo" só se aplica a perguntas
  amplas (`status_check`/`outlook`), não a toda pergunta (estoque continua sem puxar clima).
- Nenhuma integração nova desta fase além de concluir o Weather Intelligence já autorizado.
- `intent/`, `objective/`, `planner/`, `tools/` das sprints anteriores não são redesenhados — só
  ganham a extensão de confiança/contexto/narrador descrita acima.

## 6. Checkpoints propostos

**Fase A — Diretor de Operações (fundamentos cognitivos, esta aprovação)**

- **A1**: concluir a camada Weather Intelligence (abstração de provedor, cache, timeout, log,
  testes) e plugar no planner — retoma exatamente de onde a tarefa anterior parou.
- **A2**: Contexto Operacional consolidado — planner monta automaticamente todas as fontes reais
  relevantes para `status_check`/`outlook`/`diagnose` de uma vez (situacional + histórico +
  clima + metas + alertas + caixa), continuando seletivo para as demais intenções.
- **A3**: Modelo formal de Confiança (`ConfidenceAssessment` com `basis`/`gaps` explícitos).
- **A4**: Narrador com raciocínio explicado + recomendação sempre presente + testes da conversa
  do pedido (seção 4) + deploy.

**Fase B — Sinais externos reais (cada uma sua própria sequência de checkpoints, fora desta
aprovação — só inicio quando você aprovar cada uma especificamente, como fizemos com JumpPark/
Financeiro/CRM)**

- B1: Google Calendar (agenda real).
- B2: Google Business Profile (tendência de avaliação).
- B3: Meta Ads + Instagram (retorno de campanha, alcance/engajamento).
- B4: Stone (a definir se soma algo além do Fluxo de Caixa já real).
- B5: WhatsApp — metadados primeiro (nunca conteúdo de conversa sem decisão de privacidade à
  parte).

## 7. Perguntas em aberto

1. Confirma que "Ver fundamentos" continua existindo para aprofundamento, mas o raciocínio
   principal passa a aparecer na resposta em si (não mais só ali)?
2. A Fase A substitui os checkpoints Z2–Z4 da Sprint 4.0 (ainda não feitos) em vez de fazer os
   dois em paralelo — confirma?
3. Para WhatsApp (Fase B, mais à frente): confirma que a primeira etapa deve ser só metadados
   (sem ler conteúdo de mensagem), dado que envolve conversas de clientes?
4. Ordem de prioridade da Fase B — qual integração externa você quer primeiro depois da Fase A?

Nenhuma implementação foi iniciada. Aguardando aprovação da Fase A (seção 6) para começar pelo
checkpoint A1.
