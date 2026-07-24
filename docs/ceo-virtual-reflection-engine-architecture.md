# Santa Monica OS — Executive Reflection Engine (Sprint 6, nova camada obrigatória)

Documento de arquitetura — **sem implementação**. Nenhum código foi alterado para produzir isto.
Preparado em 24/07/2026. Retomando do commit `c23e302` (Personalidade Executiva, aprovação
pendente).

## 0. Relação com os dois documentos anteriores da Sprint 6

O usuário identificou um problema conceitual nos dois documentos anteriores: ambos faziam o CEO
Virtual "pensar" só quando uma pergunta chegava, lendo `ConsolidatedReport`/`organizationalMemory`
diretamente no momento da pergunta. Isso não é como um executivo real funciona — ele já chega
sabendo o estado da empresa antes de qualquer pergunta.

Este documento insere uma camada nova, **obrigatória**, entre a Diretoria e a Personalidade
Executiva: o **Executive Reflection Engine**, que mantém o **Executive State** — o "estado mental"
da empresa, sempre pronto, nunca calculado só na hora da pergunta.

**O que muda em cada documento anterior:**

- `docs/ceo-virtual-architecture.md` (Objective/Mission/ExecutivePlan/ExecutiveScore/
  ExecutiveJournal, pausado): quando retomado, `ExecutivePlan`/`ExecutiveScore` vão consumir o
  `ExecutiveState` (este documento) em vez de filtrar `ConsolidatedReport` diretamente — é uma
  generalização, não uma contradição (seção 6.3, "Prioridades", já é uma superset do
  `ExecutivePlan.today.priorities` original).
- `docs/ceo-virtual-personality-architecture.md` (Personalidade Executiva, Z1-Z4 proposto, não
  iniciado): a seção 6 daquele documento ("Fluxo completo") e o passo 1 da seção 5 ("Reunir fatos
  relevantes") são **substituídos** — `service.ts:askExecutiveOpinion` não chama mais
  `runDiretoria()` nem lê `ConsolidatedReport`/`organizationalMemory` diretamente; ele consulta
  exclusivamente o `ExecutiveState` já produzido (seção 9 abaixo). Nenhum dos tipos
  (`ManagementPhilosophy`, `ExecutiveOpinion`, `OpinionQuestionType`) muda.

Nenhum dos dois documentos anteriores é descartado — ambos ficam pausados até este componente
existir, porque ambos dependem dele agora.

## 1. A virada conceitual

> "Um CEO não começa a pensar quando alguém faz uma pergunta... A pergunta apenas acessa esse
> estado mental." — usuário

```
ANTES (documentos anteriores):
Pergunta → CEO Virtual → lê ConsolidatedReport/organizationalMemory na hora → responde

AGORA (este documento):
Diretoria roda (com ou sem pergunta) → Executive Reflection Engine → Executive State (sempre
pronto) → Pergunta (quando existir) → CEO Virtual só consulta o Executive State → responde
```

O `ExecutiveState` existe **independente de qualquer pergunta** — é isso que permite ao sistema
responder "como estamos?" instantaneamente, e é isso que faz o sistema parecer "um CEO que já
estava pensando na empresa", não um mecanismo de busca acionado por pergunta.

## 2. Auditoria — cada um dos 7 outputs pedidos, mapeado ao que já existe

Esta é a parte central do pedido ("não duplique lógica existente"). Cada item abaixo já tem, hoje,
toda ou quase toda a base de dados/cálculo pronta — o Reflection Engine principalmente **agrega,
nomeia e explica**, raramente calcula algo do zero.

| # | Output pedido | O que já existe (reaproveitado sem alteração) | O que é genuinamente novo |
|---|---|---|---|
| 1 | **Executive Facts** | `DirectorReport.facts: Fact[]` (todo Diretor já produz, `reasoning/facts.ts`) — sem interpretação, exatamente como pedido | Só a agregação (`reports.flatMap(r => r.facts)`) — zero cálculo novo, chaves de fato não se repetem entre Diretores (cada uma pertence a uma capacidade) |
| 2 | **Executive Risks** | `ConsolidatedReport.risks: EvidencedClaim[]` (já agregado desde o Z1) | Nada — reuso direto |
| 3 | **Executive Opportunities** | `ConsolidatedReport.opportunities: EvidencedClaim[]` (já agregado desde o Z1) | Nada — reuso direto |
| 4 | **Executive Conflicts** | O *padrão* de detecção já existe: `detectCrossDirectorHypotheses`/`PATTERN_DETECTORS` (`directors/estrategico.ts`, Z2) — detectores nomeados, exigindo evidência real de 2+ Diretores, nunca "IA arbitrando" | O *alvo* é novo: hoje os detectores existentes comparam **hipóteses** (interpretações); Conflitos comparam **recomendações/ações** (ex.: "reduzir gastos" vs. "contratar") — mesmo padrão arquitetural, aplicado a um material diferente (seção 4) |
| 5 | **Executive Priorities** | `computeImpact`/`computePriority` (`directors/priority.ts`, Z2 — staged, explicável, nunca uma pontuação arbitrária); `ConsolidatedReport.decisions.whatDeservesAttentionToday` já é uma amostra top-3 disso | Compor a explicação legível por item a partir do `ImpactAssessment` já calculado (nunca um novo critério de prioridade — só torna visível o que já é decidido) |
| 6 | **Executive Attention** | `ConsolidatedReport.decisions.whatCanWait` (Z2, "prioridade baixa, explicitamente despriorizada") + `Learning` com `status: "observacao"` (Z3B, "ainda sendo observado, não confirmado") — as duas categorias já existentes que significam exatamente "acompanhar, não necessariamente agir" | Só a composição das duas fontes numa lista única |
| 7 | **Executive Focus** | `classifyDomainImpact`/`FINANCIAL_FACT_KEYS`/`OPERATIONAL_FACT_KEYS` (`directors/priority.ts`, hoje privados — precisam só ser exportados, zero mudança de comportamento); histórico real via `DirectorDailySnapshot` (Z3B) | A comparação "domínio dominante hoje vs. janela recente" é novo — mas construído inteiramente sobre dado e classificação já existentes |

**Conclusão da auditoria**: não existe nenhum componente redundante sendo criado. O Reflection
Engine é, em grande parte, uma camada de **agregação, nomeação e explicação** sobre cálculos que a
Diretoria já faz — coerente com o pedido "não duplique lógica existente" e "não mova
responsabilidades desnecessariamente" (a Diretoria continua calculando tudo que já calculava; o
Reflection Engine não recalcula nada, só organiza).

### 2.1 "Mudanças" — a única peça que precisa de um pouco mais de dado

`recentLearnings`/`activeBeliefs`/`strategicItems` (já em `OrganizationalMemorySnapshot`, Z3B) não
incluem o histórico bruto de leituras diárias por Diretor (`DirectorDailySnapshot[]`) — só o
`memoryNote` já resumido em texto por Diretor. Para "Executive Focus" (comparar hoje contra uma
janela) e "mudanças desde ontem" (diff real), o Reflection Engine precisa dessa história agregada
em nível de empresa, não só por Diretor.

**Proposta**: estender `OrganizationalMemorySnapshot` (tipo já existente,
`directors/organizationalMemory/types.ts`) com um campo novo, aditivo:

```
OrganizationalMemorySnapshot {
  ...campos já existentes, inalterados...
  recentSnapshots: DirectorDailySnapshot[]   // NOVO — janela recente (ex.: 14 dias), todos os Diretores
}
```

Preenchido dentro de `recordDiretoriaRun` (`organizationalMemory/service.ts`, já o único ponto de
I/O da Memória Organizacional — nenhum I/O novo nasce em outro lugar) chamando
`repo.getRecentSnapshots` (já existe, já testado) para cada Diretor. Nenhuma tabela nova, nenhuma
query nova — só devolver um dado que o repositório já sabe buscar.

## 3. Executive State — a estrutura central

```
ExecutiveState {
  generatedAt

  facts: Fact[]                          // 1. Executive Facts — sem interpretação
  risks: EvidencedClaim[]                // 2. Executive Risks
  opportunities: EvidencedClaim[]        // 3. Executive Opportunities
  conflicts: ExecutiveConflict[]         // 4. Executive Conflicts
  priorities: ExecutivePriorityItem[]    // 5. Executive Priorities — lista completa, explicada
  attention: ExecutiveAttentionItem[]    // 6. Executive Attention
  focus: ExecutiveFocus                  // 7. Executive Focus

  limitations: string[]                  // nunca omitido — inclui as limitações já herdadas de cada relatório de Diretor
}
```

### 3.1 `ExecutiveConflict`

```
ExecutiveConflict {
  directors: DirectorId[]                // sempre 2+, nunca 1 — senão não é conflito, é uma opinião isolada
  domain: string                         // rótulo legível (basisLabelsFor, já existe)
  positions: { director: DirectorId; statement: string; evidenceFactKeys: string[] }[]
  evidenceFactKeys: string[]
  confidenceLevel: ConfidenceLevel
  limitations: string[]                  // sempre declara que a detecção é por palavra-chave/domínio, nunca semântica plena
}
```

Nunca escondido (regra explícita do usuário) — todo `ExecutiveConflict` detectado entra no
`ExecutiveState` e permanece visível até a evidência que o originou deixar de existir (não há
"resolver" um conflito manualmente nesta arquitetura; ele desaparece quando os dados mudarem).

### 3.2 `ExecutivePriorityItem`

```
ExecutivePriorityItem {
  claim: EvidencedClaim                  // o risco/oportunidade/conflito priorizado
  priority: PriorityLevel                // computePriority, inalterado
  impact: ImpactAssessment               // computeImpact, inalterado
  explanation: string                    // NOVO — composição determinística sobre os campos de impact acima, nunca um novo critério
}
```

`explanation` é montada por interpolação de template sobre `ImpactAssessment` já calculado (mesma
técnica de `computeExecutiveAdvice`) — ex.: `"Prioridade alta: impacto financeiro alto, 2
Diretores envolvidos, confiança média."` — nunca uma frase criativa, sempre os mesmos campos reais
na mesma ordem.

### 3.3 `ExecutiveAttentionItem`

```
ExecutiveAttentionItem {
  statement: string
  source: "prioridade_baixa" | "aprendizado_em_observacao"
  evidenceFactKeys: string[]
  confidenceLevel: ConfidenceLevel
}
```

### 3.4 `ExecutiveFocus`

```
ExecutiveFocus {
  currentDominantDomain: "financeiro" | "operacional" | "indeterminado"
  previousDominantDomain: "financeiro" | "operacional" | "indeterminado" | null
  changed: boolean
  evidence: string[]
  insufficientHistory: boolean           // true → changed sempre false, nunca uma mudança inventada por falta de dado
}
```

Honestidade explícita: sem pelo menos alguns dias de `recentSnapshots` reais, `insufficientHistory:
true` e `changed: false` — nunca uma alegação de mudança de foco sem base comparativa real (mesma
disciplina de `computeTrends`, Z3A, e `computeMemoryNote`, Z3B).

## 4. Executive Conflicts — como a detecção funciona, em detalhe

Mesmo padrão arquitetural de `directors/estrategico.ts:PATTERN_DETECTORS` (Z2) — uma lista de
detectores nomeados, cada um exigindo evidência real de 2+ Diretores — aplicado a
`ConsolidatedReport.recommendations` em vez de hipóteses:

```
function detectCostVsHiringConflict(reports: DirectorReport[]): ExecutiveConflict | null {
  // Financeiro recomenda reduzir custo (evidenciado por goal_progress/cashResultado) E
  // Operações recomenda contratar/reforçar equipe (evidenciado por staffing_capacity) NO MESMO
  // PERÍODO → conflito real. Sem as duas recomendações reais simultaneamente, null.
}
```

Detecção por sobreposição de **domínio + direção oposta de ação**, usando uma tabela pequena e
explícita de pares de ação conhecidos (ex.: "reduzir"/"cortar" vs. "contratar"/"investir"/
"aumentar") — nunca uma interpretação semântica livre. Isso é uma limitação real e será sempre
declarada (`limitations`): o detector só encontra os padrões nomeados que existirem na tabela,
nunca reivindica cobertura completa de todo conflito possível — mesma honestidade já usada para
`detectLeadCaptureProblem` (Z2, dormente até Marketing ter dado real).

## 5. Fluxo completo

```
1. runDiretoria() roda (inalterado) — devolve DiretoriaRunResult { consolidated,
   organizationalMemory } (organizationalMemory agora inclui recentSnapshots, seção 2.1)
2. reflect(diretoriaResult, conversationalMemory?) — FUNÇÃO PURA, zero I/O — produz ExecutiveState
   a. facts/risks/opportunities — agregação direta (seção 2)
   b. conflicts — detectores nomeados sobre recommendations (seção 4)
   c. priorities — computeImpact/computePriority + explicação (seção 3.2)
   d. attention — whatCanWait + Learnings em observação (seção 3.3)
   e. focus — classifyDomainImpact hoje vs. recentSnapshots (seção 3.4)
3. runExecutiveReflection() — orquestrador fino que só chama runDiretoria() + reflect() em
   sequência, para quem quiser tudo de uma vez
4. ExecutiveState fica pronto — existe INDEPENDENTE de qualquer pergunta
5. (Documento da Personalidade Executiva) CEO Virtual, ao receber uma pergunta, consulta só o
   ExecutiveState — nunca a Diretoria/Memória Organizacional diretamente
6. "Como estamos?" → sem processamento novo, o ExecutiveState já É a resposta estrutural (a prosa
   final continua sendo trabalho do narrador, fora do escopo, mesma divisão de sempre)
```

`reflect()` é **pura**, no mesmo espírito de `consolidate()` (Estratégico, Z1) — nenhum I/O nasce
aqui. Isso preserva a disciplina já estabelecida de "quem faz I/O": ferramentas buscam dado,
`organizationalMemory/service.ts` lê/grava memória, e agora `reflect()` só transforma o que já foi
buscado — nenhuma camada nova de I/O é criada.

## 6. Responsabilidades por camada (atualizada)

| Camada | Responsabilidade | Muda nesta sprint? |
|---|---|---|
| Ferramentas → Diretores → Diretor Estratégico | Igual a sempre (Sprint 5.0, inalterada) | Não |
| Memória Organizacional | Igual, + expõe `recentSnapshots` (aditivo, seção 2.1) | Só a extensão aditiva |
| **Executive Reflection Engine (novo)** | Transformar `DiretoriaRunResult` em `ExecutiveState` — nunca responde perguntas, só mantém o estado atualizado | **Sim — camada inteira nova** |
| Personalidade Executiva (documento anterior, pausado) | Consultar só o `ExecutiveState`, nunca a Diretoria/Memória diretamente | Redesenho do ponto de entrada (seção 0), tipos inalterados |
| Executive Briefing (futuro) | Narrar o `ExecutiveState` em prosa | Ainda não implementado |

## 7. Disciplina de honestidade — reforços explícitos desta camada

Tudo que já valia desde a Sprint 4/5 continua valendo, sem exceção. Três reforços específicos
pedidos agora:

- **Nunca gerar opinião sem evidência** — `reflect()` não gera opinião nenhuma; ela só organiza
  fato/risco/oportunidade/conflito/prioridade/atenção/foco. Opinião (`ExecutiveOpinion`) continua
  sendo responsabilidade exclusiva da Personalidade Executiva, e só nasce depois de consultar o
  `ExecutiveState` já honesto.
- **Nunca inventar fatos** — `facts` é agregação direta de `Fact[]` já calculado; nenhum fato é
  sintetizado no Reflection Engine.
- **Nunca esconder conflitos entre Diretores** — todo `ExecutiveConflict` detectado é sempre
  incluído em `ExecutiveState.conflicts`, nunca filtrado por "incomodar" ou por prioridade baixa.

## 8. Onde isso entra no código (proposta de organização, não travada)

```
src/lib/zezinho/reflection/
  types.ts        // ExecutiveState e sub-tipos
  facts.ts        // agregação de facts (trivial)
  conflicts.ts     // detectores nomeados (mesmo padrão de estrategico.ts:PATTERN_DETECTORS)
  priorities.ts    // explicação sobre ImpactAssessment já calculado
  attention.ts      // composição whatCanWait + Learnings em observação
  focus.ts          // comparação de domínio dominante via recentSnapshots
  reflect.ts         // função pura que compõe tudo acima em ExecutiveState
  index.ts            // runExecutiveReflection() — orquestrador fino (runDiretoria + reflect)
```

Módulo irmão de `directors/` e do futuro `ceo/` (Personalidade Executiva) — não fica dentro de
nenhum dos dois, porque estruturalmente fica **entre** eles, exatamente como pedido.

## 9. Roadmap proposto — Sprint 6 (Reflection Engine)

- **Z1 — Fundação + Facts/Risks/Opportunities**: `reflection/types.ts`, extensão aditiva de
  `OrganizationalMemorySnapshot.recentSnapshots` (seção 2.1), `reflection/facts.ts`,
  `reflect()` produzindo só as 3 primeiras seções do `ExecutiveState` (as puramente agregadas).
  Testes.
- **Z2 — Executive Conflicts + Executive Priorities**: `reflection/conflicts.ts` (1-2 detectores
  nomeados iniciais, evidência-gated, mesmo padrão de `PATTERN_DETECTORS`),
  `reflection/priorities.ts` (explicação sobre `ImpactAssessment`, exportar `classifyDomainImpact`
  de `priority.ts` sem alterar comportamento). Testes, incluindo "conflito nunca aparece sem
  evidência dupla real".
- **Z3 — Executive Attention + Executive Focus**: `reflection/attention.ts`,
  `reflection/focus.ts` (comparação real via `recentSnapshots`, honestidade sobre histórico
  insuficiente). Testes.
- **Z4 — Integração final + "mudanças"**: `runExecutiveReflection()` completo,
  "mudanças desde ontem" (diff sobre `recentSnapshots`/`recentLearnings`) e "mudanças desde a
  última conversa" (reaproveitando `computeChanges`/`ExecutiveTimeline`, Z3A, sem duplicar),
  atualização dos dois documentos anteriores (seção 0), quality gate completo, validação no Neon
  (só pela extensão aditiva de `recentSnapshots`, nenhuma tabela nova), commit, push. Ainda sem
  conexão ao chat vivo/UI.

Depois de aprovado e validado — a Personalidade Executiva (documento anterior) é retomada já
consumindo o `ExecutiveState` desde o seu próprio Z1.

## 10. Decisões que preciso da sua confirmação antes de começar

1. **Tamanho da janela de `recentSnapshots`** (seção 2.1) — proponho 14 dias (suficiente para
   Focus e Aprendizados recentes sem crescer demais). Confirma, ou prefere outra janela?
2. **Detectores iniciais de `ExecutiveConflicts`** (Z2) — proponho começar só com o exemplo que
   você deu (Financeiro "reduzir custo" vs. Operações "contratar/reforçar equipe") mais um segundo
   padrão simétrico ainda a definir (ex.: Marketing "investir em captação" vs. Financeiro "reduzir
   despesas", hoje dormente por falta de dado real de Marketing — mesma honestidade de
   `detectLeadCaptureProblem`). Confirma esse escopo inicial, ou já tem outros pares de conflito
   reais em mente?
3. **`runExecutiveReflection()` roda sempre a Diretoria inteira** (nunca um subconjunto) — mesma
   regra já assumida para o CEO Virtual no documento anterior. Confirma que isso vale também para
   o Reflection Engine (ele nunca reflete sobre um recorte parcial da empresa)?

Nenhuma implementação foi iniciada. Aguardando sua aprovação desta arquitetura (e das decisões
acima) para começar pelo checkpoint Z1.
