# Santa Monica OS — Executive Observer (Sprint 6, passo anterior ao Reflection Engine)

Documento de arquitetura — **sem implementação**. Nenhum código foi alterado para produzir isto.
Preparado em 24/07/2026. Retomando do commit `bf825d0` (Executive Reflection Engine, aprovado).

## 0. O que este documento resolve

O Reflection Engine (aprovado) só roda quando a Diretoria roda. O usuário quer um passo anterior:
o **Executive Observer**, que detecta fatos relevantes da operação — nunca interpreta, nunca
responde, nunca gera texto, nunca cria opinião. Só observa e empacota.

## 1. Auditoria — a descoberta central deste documento

Antes de propor qualquer coisa nova, mapeei os 11 exemplos do usuário contra o que já existe. O
resultado muda a forma de pensar este componente: **quase todo "evento" que o usuário quer
observar já é calculado por algo que existe hoje** — o Observer não é um motor de detecção novo,
é uma camada de **seleção e empacotamento** sobre sinais que a Diretoria já produz.

| Exemplo do usuário | Já existe hoje, sem alteração | Onde |
|---|---|---|
| Mudança relevante de faturamento | `Fact` com `direction: "aumento"/"queda"` (`cashResultado`, `revenue`, `avgTicket`...) | `reasoning/facts.ts` |
| Alteração na agenda | Fact da capacidade `agenda_summary` | `reasoning/facts.ts` (Operações) |
| Novo recebimento Stone | **Fora de escopo** — nenhuma integração Stone existe (decisão explícita desde o início da Sprint 6: "não implementar Stone/WhatsApp/Calendar/Meta/Instagram/Business"). O Observer é desenhado para reconhecer o *tipo* de evento (recebimento financeiro) via `accounts_receivable`/`cash_ledger_totals` já reais hoje — o gatilho Stone específico só existe quando essa integração for aprovada, fora desta sprint | — |
| Entrada/saída de veículos | Fact de `jumppark_period_summary`/`situational_context` | `reasoning/facts.ts` (Operações) |
| Mudança climática | Fact de `weather_forecast`/`weather_current` | `reasoning/facts.ts` (Inteligência) |
| Novos leads | Fact de `crm_summary`/`unanswered_clients` (real, Comercial); Marketing continua honestamente sem fonte real | `reasoning/facts.ts` |
| Estoque crítico | Fact `inventory_near_empty` (já mapeado até em `basisLabelsFor`, `hypotheses.ts`) | `reasoning/facts.ts` (Estoque) |
| Meta atingida | Fact `goal_progress`, `direction` já calculada pelo ritmo real (`pace`) | `reasoning/facts.ts` (Financeiro) |
| Queda de conversão | Já é o insumo real de `detectConversionBottleneck` (`estrategico.ts`, Z2) — risco `goal_progress`/`historical_pattern` + oportunidade `crm_at_risk_count` | `reasoning/risksAndOpportunities.ts` |
| **Padrão recorrente** | É literalmente `Learning` promovido a `"aprendizado"`/`"conhecimento"` (Z3B) — a Memória Organizacional já existe exatamente para isto | `directors/organizationalMemory/learnings.ts` |
| **Comportamento inesperado** | Fact `historical_pattern` — "movimento abaixo/acima do padrão histórico" já É a definição operacional de comportamento inesperado usada em todo o sistema desde a Sprint 4.0 | `reasoning/risksAndOpportunities.ts` |

**Conclusão**: dos 11 exemplos, 10 já têm o dado-fonte pronto hoje (o 11º, Stone, está fora de
escopo por integração externa, não por arquitetura). Isso confirma o pedido do usuário — "não deve
haver duplicação de lógica existente" — de forma muito mais literal do que eu esperava: o Observer
**não detecta nada que a Diretoria já não detecte**. Ele responde a uma pergunta diferente: *"das
muitas coisas que a Diretoria já sabe, quais merecem virar um registro de observação
independente da pergunta de alguém?"*

## 2. O que é genuinamente novo

Só três coisas, todas leves:

1. **`Observation`** — um formato único que empacota Fact/Risco/Oportunidade/Aprendizado-
   confirmado nos 7 campos pedidos pelo usuário (tipo, origem, momento, evidências, impacto
   inicial, confiança, domínio) — nunca um novo cálculo, sempre uma reformatação do que já existe.
2. **Um filtro de relevância explícito** — nem todo `Fact` vira uma `Observation` (um fato
   `"estavel"`/`"indisponivel"` não é um evento, é a ausência de um). Critério determinístico,
   documentado na seção 3.2 — não uma heurística nova de "importância".
3. **Exposição da transição de status de `Learning`** — hoje `organizationalMemory/service.ts:
   recordDiretoriaRun` sabe internamente quando cria vs. reforça vs. promove um `Learning`, mas
   essa informação não sai da função. Proponho só **expor o que já é calculado**, nunca recalcular
   (seção 4.3).

## 3. `Observation` — a estrutura

```
ObservationType =
  | "fato_direcional"          // Fact com direction "aumento"/"queda" real
  | "risco"                    // EvidencedClaim de risco já detectado
  | "oportunidade"              // EvidencedClaim de oportunidade já detectada
  | "aprendizado_confirmado"    // Learning que mudou de status nesta execução (Z3B)

Observation {
  id
  type: ObservationType
  origin: DirectorId             // quem produziu o sinal de origem — nunca "o sistema", sempre rastreável
  observedAt: string             // herdado de DirectorReport.generatedAt — nenhum timestamp novo inventado
  statement: string              // a frase já existente na origem (fact.statement / claim.statement) — nunca gerado
  evidenceFactKeys: string[]
  initialImpact: "alto" | "medio" | "baixo" | "indeterminado"   // classificação PRELIMINAR (seção 3.3), nunca a prioridade final
  confidenceLevel: ConfidenceLevel
  domain: string                 // basisLabelsFor, já existe
}
```

### 3.1 Por que "impacto inicial" é preliminar, não a prioridade final

`computeImpact`/`computePriority` (`directors/priority.ts`, Z2, inalterados) continuam sendo a
**única** fonte de prioridade real — eles exigem `directorsInvolved`, um dado que só existe depois
que vários Diretores já rodaram e o Estratégico já cruzou os relatórios. O Observer roda mais cedo
e não tem essa visão cruzada ainda. Por isso `initialImpact` usa só `classifyDomainImpact` (já
existe em `priority.ts`, hoje privada — precisa só ser exportada, zero mudança de comportamento,
mesma proposta já feita no documento do Reflection Engine) aplicada à evidência de uma única
observação — uma prévia honesta, nunca a palavra final. `ExecutivePriorityItem` (Reflection Engine)
continua sendo quem decide a prioridade real, com a visão completa.

### 3.2 Filtro de relevância — critério explícito, não uma heurística nova

Uma `Observation` só nasce quando:

- **`fato_direcional`**: `Fact.direction === "aumento"` ou `"queda"` (nunca `"estavel"`/
  `"indisponivel"` — ausência de mudança não é um evento a observar, é o estado normal).
- **`risco`/`oportunidade`**: sempre — já são evidence-gated pela própria `risksAndOpportunities.ts`
  (nunca um risco/oportunidade existe sem evidência real, regra desde o Z1).
- **`aprendizado_confirmado`**: só quando o `status` do `Learning` **mudou** nesta execução (uma
  observação recém-criada em `"observacao"` não é ainda um "padrão recorrente" — só quando ele é
  promovido a `"aprendizado"`/`"conhecimento"`, ou quando uma observação existente é reforçada mas
  o status não muda, **não** gera uma nova `Observation` a cada dia — senão o mesmo padrão geraria
  ruído repetido).

## 4. Onde isso entra no fluxo real

O diagrama do usuário ("Eventos reais → Executive Observer → Executive Reflection → Executive
State") descreve a **intenção** (observação contínua, antes de qualquer pergunta). Na
implementação, isso precisa respeitar uma regra que já vale para todo o resto do sistema desde a
Sprint 5.0: **só ferramentas/Diretores tocam dado bruto** — o Observer, como o Reflection Engine e
o CEO Virtual, nunca consulta JumpPark/clima/banco diretamente. Ele lê o que os Diretores já
calcularam.

```
runDiretoria() [inalterado] → DiretoriaRunResult { consolidated, organizationalMemory }
        ↓
observe(diretoriaResult) → Observation[]     // NOVO, puro, sem I/O — lê DirectorReport[] já prontos
        ↓
reflect(diretoriaResult, observations, conversationalMemory?) → ExecutiveState
        // reflect() ganha um parâmetro novo — continua puro, continua sem I/O
        ↓
CEO Virtual consulta ExecutiveState (documento anterior, inalterado)
```

**Isto é uma proposta de resolução, não uma decisão travada** — o Observer roda tecnicamente
*depois* que os Diretores calculam os fatos (porque é o único jeito de não duplicar a lógica de
extração de fato), mesmo aparecendo *antes* do Reflection Engine no fluxo conceitual do usuário.
Pergunta 1 da seção 7 pede sua confirmação explícita disso.

### 4.1 Sobre "observar continuamente"

Importante ser honesto aqui: este documento entrega o **mecanismo** — uma função pura,
determinística, testável, chamável quantas vezes quiser. Ele **não** entrega um agendador/cron que
chama isso a cada N minutos sozinho — essa infraestrutura não existe hoje em nenhuma parte do
sistema (mesma decisão já tomada para o Briefing automático, seção 7.2 de
`docs/diretoria-inteligente-architecture.md`, e para `pruneSnapshotsOlderThan`, Z3B: "a mecânica
existe, o gatilho fica para quando houver agendamento real no produto"). O Observer é desenhado
para ser seguro de rodar repetidamente (idempotente, sem efeito colateral, sem duplicar
observações do mesmo evento) — pronto para ganhar um gatilho automático quando essa infraestrutura
existir, sem precisar de redesenho.

### 4.2 Observação não é persistida como entidade própria

Diferente de `ExecutiveOpinion` (documento da Personalidade Executiva, que precisa de histórico
para nunca se contradizer), `Observation` não ganha tabela própria nesta arquitetura — ela é uma
projeção calculada na hora, sempre a partir de dado que já é persistido onde precisa ser
(`DirectorDailySnapshot`/`Learning`, Z3B). Registrar um log permanente de "toda observação que já
existiu" é um componente separável e razoável para o futuro, mas não é pedido aqui e adicionaria
uma tabela sem uso definido ainda — decisão de manter o escopo enxuto.

### 4.3 Exposição da transição de `Learning`

`organizationalMemory/service.ts:recordDiretoriaRun` (Z3B) já sabe, internamente, se cada
`Learning` tocado nesta execução foi **criado** (`observacao` nova), **reforçado sem mudar status**,
ou **promovido** (`observacao→aprendizado`, `aprendizado→conhecimento`) — essa é exatamente a
informação de que `aprendizado_confirmado` precisa. Proposta aditiva: a função passa a devolver
também `learningTransitions: { learning: Learning; previousStatus: LearningStatus | null }[]` junto
do que já devolve — nenhum cálculo novo, só não descartar uma informação que a função já tem em
mãos.

## 5. Responsabilidades (atualizado)

| Camada | Responsabilidade | Muda nesta sprint? |
|---|---|---|
| Ferramentas → Diretores → Diretor Estratégico | Inalterado | Não |
| Memória Organizacional | + expõe `learningTransitions` (aditivo, seção 4.3) | Só a extensão |
| **Executive Observer (novo)** | Selecionar e empacotar sinais já calculados como `Observation[]` — nunca interpreta, nunca decide prioridade final, nunca gera texto | **Sim — camada nova, mas fina** |
| Executive Reflection Engine | Interpreta e consolida — agora recebendo `Observation[]` como insumo adicional (documento anterior, `reflect()` ganha um parâmetro) | Assinatura estendida, lógica interna inalterada |
| Personalidade Executiva | Inalterada | Não |

## 6. Roadmap proposto — Sprint 6 (Executive Observer)

- **Z1 — Fundação + `fato_direcional`**: `reflection/observer/types.ts` (`Observation`,
  `ObservationType`), `reflection/observer/observeFacts.ts` (filtro de `Fact.direction`, seção
  3.2). Testes.
- **Z2 — `risco`/`oportunidade`**: `reflection/observer/observeSignals.ts` (mapeamento direto de
  `EvidencedClaim`, sem filtro adicional — já evidence-gated). Testes.
- **Z3 — `aprendizado_confirmado`**: extensão aditiva de `recordDiretoriaRun`
  (`learningTransitions`, seção 4.3), `reflection/observer/observeLearnings.ts` (só quando o status
  mudou, nunca a cada reforço). Testes, incluindo "reforço sem promoção não gera Observation
  repetida".
- **Z4 — Integração final**: `observe()` orquestrador (junta as 3 fontes, exporta
  `classifyDomainImpact` de `priority.ts` para `initialImpact`), `reflect()` passa a aceitar
  `Observation[]`, testes de integração, quality gate completo, documentação (cross-referência nos
  3 documentos da sprint), validação no Neon (só pela extensão aditiva da seção 4.3, nenhuma
  tabela nova), commit, push. Ainda sem agendador/cron — mecanismo pronto, gatilho fica para
  depois (seção 4.1).

## 7. Decisões que preciso da sua confirmação antes de começar

1. **Ordem real de execução** (seção 4): confirmo que o Observer roda logo depois de
   `runDiretoria()` (lendo o que os Diretores já calcularam), nunca antes/em paralelo a eles — é o
   único jeito de não duplicar a extração de fatos. O diagrama conceitual (observação antes de
   qualquer pergunta) continua verdadeiro porque tudo isso roda antes do CEO Virtual ser
   consultado, só não antes da própria Diretoria.
2. **Sem tabela de observações** (seção 4.2) — confirma que não precisamos de um log histórico
   permanente de observações nesta sprint, ou você já enxerga uma necessidade real para isso
   (ex.: auditoria externa, "mostrar tudo que o sistema notou este mês")?
3. **Sem agendador/cron nesta sprint** (seção 4.1) — o Observer fica pronto para rodar
   continuamente, mas o gatilho automático (quem chama isso a cada N minutos) fica para uma sprint
   futura, mesma disciplina já usada para o Briefing automático e a limpeza de observações
   expiradas. Confirma?

Nenhuma implementação foi iniciada. Aguardando sua aprovação desta arquitetura (e das decisões
acima) para começar pelo checkpoint Z1.
