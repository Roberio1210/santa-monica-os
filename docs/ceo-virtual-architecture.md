# Santa Monica OS — CEO Virtual (Sprint 6)

Documento de arquitetura — **sem implementação**. Nenhum código foi alterado para produzir isto.
Preparado em 24/07/2026, para aprovação antes do início da Sprint 6. Retomando exatamente do
commit `c582348` (checkpoint Z3B da Sprint 5.0, aprovado e em produção — Memória Organizacional).

Sprint 5.0 está oficialmente encerrada, por decisão do usuário: "considero encerrada a fase de
fundação da Diretoria Inteligente." A arquitetura entregue (seção 1) é o alicerce sobre o qual a
Sprint 6 é construída — nenhuma peça listada abaixo é redesenhada, só consumida.

## 1. Auditoria da arquitetura atual (Sprint 5.0, encerrada)

### 1.1 O que existe hoje, camada por camada

```
Ferramentas (tools/registry.ts, 17 ferramentas)
        ↓
Motor de raciocínio (reasoning/: facts, findings, diagnose, gaps, recommend, risksAndOpportunities)
        ↓
Diretores (directors/: 8 Diretores — Financeiro, Comercial, Marketing, Operações, Estoque, RH,
Estratégico, Inteligência) — DirectorReport de 8 seções cada
        ↓
Revisão Cruzada (directors/crossReview.ts) → Diretor Estratégico consolida (directors/estrategico.ts)
        ↓
Memória Organizacional (directors/organizationalMemory/service.ts — único ponto de I/O de memória)
        ↓
runDiretoria() devolve DiretoriaRunResult { consolidated, organizationalMemory }
```

`runDiretoria()` (`directors/diretoria.ts`) é hoje o topo da pilha — **sem nenhum caller em
produção** (nem chat, nem UI). Toda a Sprint 5.0 foi fundação pura, exatamente como planejado.

### 1.2 Inventário do que a Sprint 5.0 entregou (o que a Sprint 6 vai consumir)

- **`DiretoriaRunResult`** (`directors/organizationalMemory/types.ts`) — `{ consolidated,
  organizationalMemory }`, devolvido por `runDiretoria()`. É o único objeto que a Sprint 6 vai
  enxergar da Diretoria (seção 3).
- **`ConsolidatedReport`** (`directors/types.ts`) — `reports` (8 `DirectorReport`s completos),
  `risks`/`opportunities`/`recommendations`/`actionPlans` agregados, `correlations` (Diretor de
  Inteligência), `crossDirectorHypotheses` + `reviewedHypotheses` (Contradições + Revisão
  Cruzada), `decisions` (as 3 perguntas: o que merece atenção hoje / o que eu faria primeiro / o
  que pode esperar), `advice` (Executive Advice — "meu conselho para hoje"), `overallPriority`,
  `limitations`, `participatingDirectors`.
- **`OrganizationalMemorySnapshot`** (`directors/organizationalMemory/types.ts`) —
  `recentLearnings` (Aprendizados/Conhecimentos confirmados nos últimos 7 dias),
  `activeBeliefs` (Crenças da Empresa), `strategicItems` (Memória Estratégica — metas reais),
  `expiredObservationsCount`, `limitations`.
- **`DirectorReport.memoryNote`** — nota de tendência real entre dias (Memória Operacional),
  já populada desde o Z3B.
- **Disciplina de honestidade** (vale para toda peça nova da Sprint 6, sem exceção): nunca
  inventar dado; toda hipótese/score/prioridade carrega evidência (`evidenceFactKeys`),
  `confidenceLevel` qualitativo como fonte de verdade, e limitações declaradas explicitamente;
  nunca promover/decidir automaticamente sem evidência real; diretores sem fonte real (RH,
  Marketing) continuam honestos sobre a ausência de dado, nunca inventam um substituto.

### 1.3 O que NÃO existe hoje (relevante para o desenho da Sprint 6)

- Nenhuma conexão ao chat vivo (`service.ts`) ou à UI — `runDiretoria()` roda hoje só em testes.
- Nenhum conceito de "decisão tomada" que sobrevive entre execuções — `ActionPlan` nasce sempre
  `"identificado"` e não persiste (arquitetura pronta desde o Z2, banco fica para uma sprint
  futura — exatamente o vácuo que o `Objective` da Sprint 6 preenche, seção 4).
- Nenhuma noção de "foco estratégico" cross-Diretor além de `StrategicMemoryItem` (só metas reais
  via `goal_progress`) — é o vácuo que a `Mission` preenche.
- Nenhum "placar" executivo — hoje só existe prioridade (`PriorityLevel`) por item individual,
  nunca um indicador agregado por área.
- Nenhum registro histórico diário navegável — `ExecutiveTimeline` (Z3A) é session-scoped, nunca
  persistida; é o vácuo que o `Executive Journal` preenche, de forma permanente.

## 2. A virada conceitual da Sprint 6

Sprint 5.0 respondeu "o que está acontecendo, e o que os especialistas acham disso" (Diretoria +
Sistema Executivo de Decisão). Sprint 6 responde **"o que fazer a respeito"** — não mais
inteligência analítica nova, e sim a camada de **decisão e administração**.

```
Usuário/Sistema
      ↓
CEO Virtual (Sprint 6 — NOVO)
      ↓ chama, sem pular etapas
runDiretoria() (Sprint 5.0 — inalterado)
      ↓
DiretoriaRunResult { consolidated, organizationalMemory }
      ↓ (única entrada de dados do CEO Virtual — nunca uma ferramenta, nunca um Diretor direto)
CEO Virtual interpreta, decide, planeja, registra
      ↓
Objetivos · Missões · Executive Plan · Executive Score · Executive Journal
      ↓ (prosa final, fora do escopo da Sprint 6 — mesma divisão de trabalho desde o Z2)
Executive Briefing narrado (checkpoint futuro)
```

**Regra não-negociável, decisão do usuário**: "o CEO Virtual não consulta dados diretamente." O
CEO Virtual nunca importa `tools/registry.ts`, nunca chama `buildOperationalContext`, nunca lê uma
tabela de um Diretor específico (nem mesmo `director_learnings`/`director_daily_snapshots`
diretamente — ele só vê o que já veio dentro de `organizationalMemory`, devolvido por
`runDiretoria()`). A única exceção são as **próprias tabelas do CEO Virtual** (Objetivos, Missões,
Perfil de Gestão, Diário Executivo — seção 4): ele pode ler seu próprio histórico (ex.: o diário de
ontem, para calcular "o que mudou"), porque isso é memória do próprio CEO, não um atalho para os
dados operacionais dos Diretores.

## 3. Responsabilidades — quem faz o quê

| Camada | Responsabilidade | Muda na Sprint 6? |
|---|---|---|
| Ferramentas | Buscar dado bruto (JumpPark, clima, banco) | Não |
| Motor de raciocínio | Fatos, achados, diagnóstico, hipóteses, riscos/oportunidades, recomendações | Não |
| Diretores | Interpretação especializada por domínio, 8 seções obrigatórias | Não |
| Diretor Estratégico | Consolidação, Contradições, Decisões, Executive Advice | Não |
| Memória Organizacional | Observação→Aprendizado→Conhecimento, Crenças, Memória Estratégica/Operacional | Não |
| **CEO Virtual (novo)** | Transformar o `ConsolidatedReport` em objetivos, plano executivo, placar e diário — **tomada de decisão**, nunca análise nova | **Sim — camada inteira nova** |
| Executive Briefing (futuro) | Narrar em prosa o que o CEO Virtual produziu | Ainda não implementado (Z4 original) |

O princípio do documento anterior continua valendo, um nível acima: **"O Zézinho não sabe tudo.
Ele sabe quem sabe."** Agora: **"A Diretoria sabe o que está acontecendo. O CEO Virtual sabe o que
fazer a respeito."** O CEO Virtual não duplica nenhuma análise que os Diretores já fazem — ele
prioriza, planeja, e lembra.

## 4. Novas entidades

Todas as entidades abaixo são persistidas (schema Drizzle aditivo, uma tabela por entidade,
mesmo padrão de 4 arquivos — `repository.ts`/`static-repository.ts`/`postgres-repository.ts`/
`repository-factory.ts` — já usado desde a Sprint 2). Nenhuma delas é consultada por um Diretor —
o fluxo de dados é sempre `Diretoria → CEO Virtual`, nunca o inverso.

### 4.1 `Objective` (Objetivo)

O equivalente, um nível acima do `ActionPlan` (Z2), de uma decisão que sobrevive entre execuções.
Enquanto um `ActionPlan` é a sugestão pontual de um Diretor ("ligar para clientes"), um `Objective`
é a decisão do CEO Virtual de perseguir aquilo — nasce só quando o CEO Virtual escolhe promover um
sinal real da Diretoria (recomendação, risco, oportunidade, hipótese ou contradição de alta
prioridade) a algo que a empresa vai perseguir de fato.

```
Objective {
  id
  title            // nunca genérico — descreve a ação-alvo real, ex.: "Aumentar ticket médio via vitrificação"
  category         // financeiro | operacional | clientes | marketing | equipe | estoque | estrategico
  reason           // por que existe — sempre ligado a evidência real
  priority         // reaproveita PriorityLevel (directors/priority.ts) — nunca uma escala nova
  origin           // { directors: DirectorId[], sourceType: "recomendacao"|"risco"|"oportunidade"|"hipotese"|"contradicao", evidenceFactKeys: string[] }
  expectedImpact
  responsible      // null até existir dado real de RH/equipe — mesma honestidade do ActionPlan
  progress         // ver 4.1.1 — nunca um número solto sem explicação
  createdAt
  suggestedDeadline // null quando não há base real para estimar — nunca inventado
  status           // Identificado | Planejado | Em andamento | Concluído | Cancelado
  missionId        // null até ser agrupado a uma Missão (seção 4.2)
  confidenceLevel  // herdado da evidência de origem — nunca "alta" por padrão
  limitations
}
```

**Como um `Objective` nasce**: o CEO Virtual varre o `ConsolidatedReport` a cada execução
(recomendações de prioridade alta, riscos/oportunidades recorrentes, contradições, aprendizados já
promovidos a `"conhecimento"` na Memória Organizacional) e propõe um `Objective` novo só quando
esse sinal ainda não tem um `Objective` equivalente aberto — mesma disciplina de deduplicação por
chave normalizada já usada em `directors/organizationalMemory/learnings.ts:deriveSignalKey`,
reaproveitada aqui (nunca duas vezes o mesmo objetivo). Todo `Objective` nasce `"Identificado"` —
as transições seguintes (`Planejado`/`Em andamento`/`Concluído`/`Cancelado`) exigem uma decisão
humana registrada em algum lugar (mesmo texto usado para `ActionPlanStatus` desde o Z2) — o CEO
Virtual nunca promove sozinho um objetivo a "em andamento".

#### 4.1.1 Progresso — honesto, nunca inventado

`progress` só é preenchido quando existe uma métrica real ligada ao objetivo
(`origin.evidenceFactKeys`) com histórico suficiente na Memória Operacional/Organizacional (ex.:
um objetivo nascido de "ticket médio em queda" pode medir progresso comparando o `DirectorDailySnapshot`
mais recente contra o do dia de criação). Sem uma métrica real rastreável, `progress` fica `null`
e o objetivo é acompanhado só por status — nunca uma estimativa de progresso inventada para
preencher a interface.

### 4.2 `Mission` (Missão)

Um foco estratégico que agrupa vários `Objective`s (ex.: "Aumentar venda de vitrificação",
"Reduzir desperdício", "Bater meta mensal"). Diferente do `StrategicMemoryItem` (Z3B, que só
rastreia metas de faturamento reais via `goal_progress` — estreito e automático por natureza),
`Mission` é mais ampla: um tema que várias evidências de Diretores diferentes podem alimentar ao
longo do tempo.

```
Mission {
  id
  title
  category
  objectiveIds: string[]
  createdAt
  active
}
```

**Como uma `Mission` nasce** (decisão de honestidade central desta seção): nunca por um único
sinal. Só quando ≥2 `Objective`s reais e já existentes compartilham a mesma categoria/tema —
`missions.ts` propõe o agrupamento, nunca inventa um tema vazio à espera de objetivos. Um
`Objective` pode existir sem `Mission` (`missionId: null`) indefinidamente — não é obrigatório
agrupar.

### 4.3 `ExecutivePlan` (Plano Executivo)

**Não é uma tabela** — é uma estrutura computada a cada execução do CEO Virtual, a partir do
`ConsolidatedReport` + `Objective`s/`Mission`s ativos + `OrganizationalMemorySnapshot`. Responde
literalmente às 4 perguntas do usuário ("agora" = topo do horizonte "hoje"):

```
ExecutivePlan {
  today:     ExecutiveHorizon
  thisWeek:  ExecutiveHorizon
  thisMonth: ExecutiveHorizon
}

ExecutiveHorizon {
  priorities: EvidencedClaim[]     // reaproveita o tipo já existente, nunca um novo formato de "prioridade"
  risks: EvidencedClaim[]
  opportunities: EvidencedClaim[]
  objectives: Objective[]
  missions: Mission[]
}
```

Ver seção 6 para como cada horizonte é montado.

### 4.4 `ExecutiveScore` (Saúde da Empresa)

Não financeiro — um indicador executivo por pilar, um pilar por área que já tem um Diretor
correspondente (Financeiro, Operações, Clientes/Comercial, Marketing, Equipe/RH, Estoque).

```
ExecutiveScore {
  generatedAt
  pillars: PillarScore[]
}

PillarScore {
  pillar          // "financeiro" | "operacoes" | "clientes" | "marketing" | "equipe" | "estoque"
  score: number | null   // banda ilustrativa 0-100 (mesmo espírito de Hypothesis.confidenceScore, Z2 — NUNCA uma estatística real), null quando o Diretor não tem fonte real
  trend           // "melhorando" | "piorando" | "estavel" | "sem_historico" — real, comparado contra DirectorDailySnapshot, nunca estimado
  confidenceLevel // herdado de DirectorReport.confidence.overallLevel do Diretor correspondente
  explanation     // obrigatório, nunca omitido — "por que esse score existe"
  evidenceFactKeys
  limitations
}
```

**Honestidade explícita, decisão desta arquitetura**: pilares "Equipe" (RH) e "Marketing" hoje não
têm fonte real (`DirectorDataAvailability: "indisponivel"`) — o `PillarScore` correspondente
declara `score: null` e `explanation: "sem fonte de dado real configurada ainda"`, nunca um número
fabricado para preencher a grade. A fórmula exata de `score` (staged e explicável, nunca um peso
arbitrário — mesmo espírito de `computePriority`, Z2) é decisão de implementação do checkpoint
Z3 desta sprint (seção 8), não travada neste documento.

### 4.5 `ExecutiveJournalEntry` (Diário Executivo)

Um registro por dia, persistido — o par permanente do `ExecutiveTimeline` (Z3A, que continua
existindo, mas é session-scoped: ver seção 7 para a diferença exata).

```
ExecutiveJournalEntry {
  id
  entryDate           // YYYY-MM-DD, único
  summary              // resumo do dia
  mainEvents: string[]
  changes: string[]     // diff real contra o dia anterior — mesma disciplina de computeChanges (Z3A)
  learnings: string[]   // aprendizados confirmados/promovidos no dia (Memória Organizacional)
  risks: EvidencedClaim[]
  opportunities: EvidencedClaim[]
  advice: string        // Executive Advice do dia
  objectivesCreated: string[]   // ids de Objective
  objectivesCompleted: string[] // ids de Objective
  createdAt
}
```

Ver seção 7 para como é alimentado.

### 4.6 `ManagementProfile` (Perfil de Gestão)

**Nunca altera dados, nunca altera confiança, nunca altera evidência** — só influencia como o CEO
Virtual organiza e apresenta prioridades já calculadas honestamente. Um único perfil ativo por
instalação (não há multiusuário no produto hoje).

```
ManagementProfile {
  id
  riskAppetite: "conservador" | "equilibrado" | "agressivo"
  focusArea: "comercial" | "financeiro" | "operacional" | null   // null = sem viés, decisão explícita do usuário de não favorecer nenhuma área
  updatedAt
}
```

Sem perfil configurado, o padrão é `riskAppetite: "equilibrado"`, `focusArea: null` — nunca um
viés assumido silenciosamente. O perfil só é consultado por uma função de **reordenação** pura
(`managementProfile.ts:applyProfile(plan, profile)`) que roda por último, depois de todo o cálculo
honesto de prioridade/score já estar pronto — ex.: `riskAppetite: "conservador"` ordena riscos
antes de oportunidades de prioridade equivalente; `focusArea: "financeiro"` ordena itens da
categoria financeira primeiro em empates de prioridade. Nunca muda `priority`, `score`,
`confidenceLevel` ou qualquer campo evidenciado — só a ordem de apresentação.

## 5. Fluxo completo

```
1. Algo aciona o CEO Virtual (checkpoint futuro decide o quê — cron diário, pergunta ampla no
   chat, ou chamada manual; fora do escopo de decidir nesta sprint, ver seção 9)
2. CEO Virtual chama runDiretoria() — sempre a Diretoria inteira (nunca um subconjunto: decisão
   de negócio precisa da visão completa da empresa, diferente de uma pergunta pontual do chat)
3. Recebe DiretoriaRunResult { consolidated, organizationalMemory }
4. objectives.ts deriva novos Objective candidatos do ConsolidatedReport, deduplica contra
   Objectives já abertos (lidos do próprio repositório do CEO Virtual)
5. missions.ts agrupa Objectives em Missions quando há tema real repetido
6. executivePlan.ts monta os 3 horizontes a partir de tudo acima
7. executiveScore.ts calcula os pilares a partir dos 8 DirectorReports + histórico de
   DirectorDailySnapshot (já dentro de organizationalMemory)
8. managementProfile.ts reordena (nunca recalcula) o plano segundo o perfil ativo
9. journal.ts monta o ExecutiveJournalEntry do dia, comparando contra o entry de ontem (lido do
   próprio repositório do CEO Virtual)
10. service.ts (único ponto de I/O do CEO Virtual) persiste: Objectives novos/atualizados,
    Missions novas, o ExecutiveJournalEntry do dia — devolve CeoVirtualResult completo
11. (Checkpoint futuro) Um narrador transforma CeoVirtualResult em prosa — Executive Briefing
```

## 6. Como o `ExecutivePlan` é produzido

Cada horizonte reaproveita exatamente o que a Diretoria já calculou, só filtrando pela janela de
tempo certa — nunca um cálculo de prioridade paralelo:

- **Hoje**: `priorities` = `ConsolidatedReport.decisions.whatDeservesAttentionToday` (já existe,
  Z2) + a recomendação `whatIWouldDoFirst`; `risks`/`opportunities` = os do dia (`consolidated.risks`/
  `opportunities`); `objectives` = os com `suggestedDeadline` hoje ou prioridade alta sem prazo;
  `missions` = as que têm algum objetivo priorizado hoje.
- **Esta semana**: mesma base, mas ampliada por `organizationalMemory.recentLearnings` (padrões
  confirmados nos últimos 7 dias — sinal de algo que vem se repetindo, não só o instante de hoje)
  e `Objective`s com prazo dentro de 7 dias.
- **Este mês**: ampliada pelos `strategicItems` (Memória Estratégica) e `Objective`s/`Mission`s
  com prazo dentro de 30 dias; risks/opportunities aqui vêm predominantemente de
  `crossDirectorHypotheses`/`reviewedHypotheses` de alta confiança (padrões sustentados, não
  ruído de um dia).

Nunca uma extrapolação nova: cada horizonte mais largo é um filtro mais generoso sobre o mesmo
material já evidenciado, nunca uma projeção estatística inventada.

## 7. `ExecutiveJournal` vs. `ExecutiveTimeline` (Z3A) — não são a mesma coisa

`ExecutiveTimeline` (`directors/executiveTimeline.ts`, Z3A) continua existindo exatamente como
está — é a visão **da conversa atual**, session-scoped, nunca persistida, útil para o Zézinho
manter contexto dentro de um diálogo. `ExecutiveJournalEntry` é a visão **da empresa**, permanente,
um registro por dia, independente de qualquer conversa — "esse diário permitirá revisar meses
depois como a empresa evoluiu" (pedido literal do usuário). São complementares, não um substitui o
outro: a Sprint 6 não remove nem redesenha `ExecutiveTimeline`.

## 8. Roadmap proposto — Sprint 6

Mesmo formato de checkpoints pequenos e aprováveis um a um, como Z1-Z4 da Sprint 4.0 e Z1-Z3B da
Sprint 5.0.

- **Z1 — Fundação do CEO Virtual + Objetivos**: `ceo/types.ts`, schema aditivo (`ceo_objectives`),
  repositório (4 arquivos, mesmo padrão), `objectives.ts` (derivação a partir do
  `ConsolidatedReport`, deduplicação por chave normalizada, os 5 estados), `service.ts` com
  `runCeoVirtual()` chamando `runDiretoria()` e persistindo objetivos. Testes + migração validada
  no Neon. Ainda sem Missões/Plano/Score/Diário/Perfil.
- **Z2 — Missões + Executive Plan**: schema aditivo (`ceo_missions`, `missionId` em
  `ceo_objectives`), `missions.ts` (agrupamento por tema real, nunca por um único objetivo),
  `executivePlan.ts` (os 3 horizontes, seção 6). Testes + migração.
- **Z3 — Executive Score + Perfil de Gestão**: `executiveScore.ts` (pilares, fórmula staged e
  explicável a ser fechada nesta etapa, honestidade sobre pilares sem fonte real), schema aditivo
  (`management_profiles`), `managementProfile.ts` (reordenação pura, nunca recálculo). Testes.
- **Z4 — Executive Journal + integração final**: schema aditivo (`executive_journal_entries`),
  `journal.ts` (diff contra o dia anterior, mesma disciplina de `computeChanges`),
  `runCeoVirtual()` completo unindo todas as peças num único `CeoVirtualResult`, os 20 testes de
  aceitação de praxe, quality gate completo, documentação final, validação no Neon, commit, push.
  Ainda sem conexão ao chat vivo/UI — decisão explícita de escopo, mesma disciplina de todos os
  checkpoints da Sprint 5.0 (fundação primeiro, integração depois de aprovada).

Depois da Sprint 6 aprovada e validada em produção — a conexão ao chat vivo (`service.ts`) e a
narração do Executive Briefing ficam para uma sprint futura, junto da Fase B (integrações
externas), exatamente como combinado desde o início da Sprint 5.0.

## 9. Decisões que preciso da sua confirmação antes de começar

1. **Fórmula do `ExecutiveScore`**: confirmo o desenho conceitual (staged, explicável, nunca uma
   pontuação arbitrária, pilares sem fonte real mostram `null` em vez de número) — a fórmula exata
   fica para o checkpoint Z3, ou você quer definir os pesos/critérios agora?
2. **`ManagementProfile` — dimensões**: proponho começar só com `riskAppetite` (conservador/
   equilibrado/agressivo) e `focusArea` (comercial/financeiro/operacional/nenhum). Você mencionou
   também "mais comercial"/"mais operacional" como exemplos de estilo — isso já está coberto por
   `focusArea`, ou você imagina uma terceira dimensão independente?
3. **Gatilho do CEO Virtual**: quem aciona `runCeoVirtual()` (cron diário, comando manual, uma
   pergunta ampla do chat)? Proponho deixar essa decisão para depois do Z4, junto da conexão ao
   chat vivo — confirma, ou prefere já decidir agora para orientar o desenho do `service.ts`?
4. **Um único `ManagementProfile` ativo** por instalação (sem multiusuário) — confirma esse
   escopo, ou já existe a intenção de perfis por pessoa/papel?

Nenhuma implementação foi iniciada. Aguardando sua aprovação desta arquitetura (e das decisões
acima) para começar pelo checkpoint Z1.
