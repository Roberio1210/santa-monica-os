# Santa Monica OS — Diretoria Inteligente (Sprint 5.0)

Documento de arquitetura — **sem implementação**. Nenhum código foi alterado para produzir isto.
Preparado em 24/07/2026, para aprovação antes do início da Sprint 5.0. Retomando exatamente do
commit `ef4a4fe` (checkpoint Z4 da Sprint 4.0, aprovado e em produção).

Este documento substitui a Fase A de `docs/zezinho-5.0-architecture.md` (já entregue — ver seção
1.4) e redefine o que "5.0" significa: não é mais "Diretor de Operações" no singular, é a
Diretoria Inteligente completa descrita no seu pedido. A Fase B daquele documento (integrações
externas) continua exatamente como estava: **não iniciada, não autorizada nesta aprovação**.

---

## 1. Auditoria da arquitetura atual (Sprint 4.0, encerrada)

### 1.1 O pipeline vivo hoje

```
mensagem
  → classifyManagerial()        intent/managerial.ts    — multi-intenção, nunca "um vencedor só"
  → capabilitiesForIntent()     planner/capabilities.ts  — matriz intenção → capacidades
  → buildOperationalContext()   planner/contextBuilder.ts — chama as ferramentas, deduplica
  → buildManagerialPlan()       planner/managerialPlan.ts — fatos, riscos, oportunidades, recomendações, contextQuality
  → narrateManagerialPlan()     narrator/narrateManagerialPlan.ts — prosa adaptativa por escopo
  → resposta
```

Isto é **uma única "linha de montagem"**: uma pergunta entra, um conjunto de ferramentas é
chamado em paralelo, um plano é montado, um texto é escrito. Não existe hoje nenhum conceito de
"vários especialistas concorrendo/discutindo" — é exatamente o desenho que o seu pedido quer
superar (`Usuário → Planner → Ferramentas → Resposta`).

### 1.2 Catálogo de ferramentas hoje (17 ferramentas, `tools/registry.ts`)

| Ferramenta | Fonte real? | Observação |
| --- | --- | --- |
| `situational_context` | ✅ Real, pura | Estágio do expediente, sempre disponível |
| `jumppark_period_summary` | ✅ Real | Faturamento, veículos, ticket médio |
| `jumppark_wash_packages` | ✅ Real | Distribuição Bronze/Silver/Gold |
| `historical_pattern` | ✅ Real | Comparação com mesmo dia da semana |
| `goal_progress` | ✅ Real | Meta, ritmo, projeção, bônus (só Lavação/Julho seedada) |
| `cash_ledger_totals` | ✅ Real | Fluxo de caixa (Neon) |
| `dre_result` | ✅ Real | DRE gerencial (Neon) |
| `accounts_payable` | ✅ Real | Contas a pagar (Neon) |
| `accounts_receivable` | ✅ Real | Contas a receber (Neon) |
| `crm_customers` | ✅ Real | Clientes, status de risco/retenção |
| `inventory_overview` | ✅ Real | Estoque |
| `central_alerts` | ✅ Real | Alertas consolidados de todos os módulos |
| `weather_forecast` | ✅ Real | OpenWeatherMap (chave só em produção) |
| `full_period_comparison` | ✅ Real | Comparação completa de dois períodos |
| `unanswered_clients` | ❌ Sempre `not_configured` | WhatsApp não integrado (Fase B) |
| `agenda_summary` | ❌ Sempre `not_configured` | `/agenda` hoje é mock (`src/data/mock/schedule.ts`) |
| `marketing_summary` | ❌ Sempre `not_configured` | Meta Ads/Instagram não integrados (Fase B) |

**14 de 17 ferramentas são reais.** As 3 restantes já existem no catálogo, honestamente
marcadas — não precisam ser criadas, só continuam retornando `not_configured` até a Fase B.

### 1.3 O que NÃO existe hoje (importante para o que vem a seguir)

- **Nenhuma persistência entre conversas.** `ReasoningSession` (a "memória" de hoje) vive só no
  navegador do usuário, dura uma sessão de chat, nunca é salva no banco. Não há histórico de "o
  que o Zézinho concluiu segunda-feira" em lugar nenhum. Isto é a lacuna central para o pedido de
  **Memória Operacional** (seção 4).
- **Nenhum módulo de RH.** Existe só um documento de design nunca implementado
  (`docs/hr-module-architecture.md`). Não há tabela de funcionários, férias, horas ou
  treinamentos no banco. `staffing_capacity` é hoje um *proxy* sobre dados do JumpPark (volume de
  veículos/pico), nunca uma medição real de equipe.
- **Marketing e Comercial (parte de follow-up/CRM ativo) não têm fonte real** além do que já
  está na tabela acima — `crm_customers` cobre clientes/retenção, mas não conversão/funil, e
  `marketing_summary` é sempre `not_configured`.
- **Nenhum conceito de "relatório por área" isolado.** Hoje tudo é uma resposta única, plana. Não
  existe uma estrutura de dados que separe "o que o financeiro pensa" de "o que a operação
  pensa" — é tudo misturado dentro de um único `ManagerialPlan`.

### 1.4 O que a Sprint 4.0 já entregou e que a Diretoria vai reaproveitar 100%

Nada disto será refeito. É a fundação sobre a qual os Diretores são construídos:

- `TOOL_REGISTRY` + `executeTools`/`executeToolsWithTrace` (chamada paralela, nunca lança, status
  honesto: `ok`/`not_configured`/`temporary_failure`/`stale_data`/`insufficient_permission`/`no_data`).
- `Capability` + `CAPABILITY_TOOL` + `INTENT_CAPABILITIES` (`planner/capabilities.ts`).
- `OperationalContextBuilder` (`planner/contextBuilder.ts`) — já deduplica por ferramenta real.
- `computeContextQuality` (`planner/contextQuality.ts`) — já é "confiança explicável em
  estágios", exatamente o padrão que os Diretores vão reaproveitar.
- `extractFacts`/`deriveFindings`/`buildDiagnosis`/`deriveGaps`/`deriveRecommendations`
  (`reasoning/*.ts`) — motor de raciocínio puro, já testado, já evidence-gated.
- `narrateManagerialPlan` — o estilo de prosa (adaptativa, opinião em primeira pessoa, nunca
  jargão técnico) é o mesmo que o Zézinho vai usar para escrever o resumo final da Diretoria.

---

## 2. A virada conceitual: de "um pipeline" para "uma Diretoria"

Hoje: **uma pergunta → um plano → uma ferramenta de cada capacidade → um texto.**

Proposto: **uma pergunta → vários Diretores (cada um dono de um domínio) → cada um produz um
relatório estruturado próprio → o Diretor Estratégico consolida → o Zézinho escreve.**

```
Usuário
  ↓
Zézinho (recebe a pergunta, decide QUAIS Diretores acionar)
  ↓
Diretores especialistas (em paralelo, cada um sobre seu domínio)
  ↓  (cada um usa o MESMO OperationalContextBuilder de hoje — nenhuma ferramenta nova)
Relatórios de Diretor (estruturados, não texto — DirectorReport)
  ↓
Diretor Estratégico (consolidação — cruza, prioriza, remove duplicidade)
  ↓
Zézinho (narra o resultado consolidado — reaproveita narrateManagerialPlan)
  ↓
Resposta única, no único chat que existe
```

**Ponto central de design:** um "Diretor" não é um novo agente de IA autônomo nem um novo
conjunto de chamadas externas. É uma **camada de agrupamento por domínio** sobre exatamente as
mesmas 17 ferramentas que já existem. "Financeiro discute com Operações" não significa duas IAs
conversando — significa duas listas de fatos/riscos/oportunidades estruturados sendo comparadas
por uma função pura de consolidação, do mesmo jeito que `deriveRisksAndOpportunities` já compara
`historical_pattern` com `jumppark_period_summary` hoje (Z3). A "discussão" é determinística e
testável, igual a tudo que já existe no projeto — nunca um LLM improvisando uma conversa entre
personas.

---

## 3. Componentes novos

### 3.1 `Director` — definição de um diretor

```ts
interface Director {
  id: DirectorId;                    // "financeiro" | "comercial" | "marketing" | "operacoes" | "estoque" | "rh" | "estrategico"
  label: string;                     // "Diretor Financeiro"
  ownedCapabilities: Capability[];   // subconjunto das Capability já existentes — nenhuma nova
  dataAvailability: "real" | "parcial" | "indisponivel"; // declarado, nunca inferido às escondidas
}
```

Um Diretor **não tem código de I/O próprio** — ele é metadado (igual ao `TOOL_REGISTRY` de hoje)
que diz "essas são as capacidades que me pertencem". Quem busca dado continua sendo o
`OperationalContextBuilder`, sem nenhuma duplicação.

Mapeamento honesto proposto (nenhuma capacidade nova é criada — só reagrupamento):

| Diretor | Capacidades (já existentes) | Disponibilidade |
| --- | --- | --- |
| **Financeiro** | `cash_ledger_totals`, `dre_result`, `accounts_payable`, `accounts_receivable`, `goal_progress` | ✅ Real |
| **Operações** | `situational_context`, `jumppark_period_summary`, `historical_pattern`, `staffing_capacity` | ✅ Real |
| **Estoque** | `inventory_status` | ✅ Real |
| **Comercial (CRM)** | `crm_summary`, `unanswered_clients` | ⚠️ Parcial — clientes reais, follow-up de mensagens sempre indisponível |
| **Marketing** | `marketing_summary` | ❌ Indisponível — nenhuma fonte real, Diretor existe só como estrutura, sempre reporta "aguardando integração" |
| **RH** | *(nenhuma capacidade própria — usa `staffing_capacity` como proxy, compartilhado com Operações)* | ❌ Indisponível — nenhum módulo de RH real existe |
| **Estratégico** | Nenhuma própria — consome `central_alerts` + os relatórios de TODOS os outros Diretores | Consolidador, não observador direto |

Isto segue o mesmo princípio que rege o projeto inteiro desde a Sprint 1: **nunca fingir que um
Diretor "funciona" quando a fonte não existe.** RH e Marketing entram na arquitetura desde já
(para o desenho ficar completo e não precisar ser redesenhado quando a fonte chegar), mas seus
relatórios vão dizer, todo dia, honestamente: *"ainda não tenho fonte real para observar isso."*

### 3.2 `DirectorReport` — o que cada Diretor produz

```ts
interface DirectorReport {
  director: DirectorId;
  generatedAt: string;               // ISO
  dataAvailability: "real" | "parcial" | "indisponivel";
  facts: Fact[];                     // reaproveita o tipo Fact já existente (reasoning/types.ts)
  risks: EvidencedClaim[];           // reaproveita o tipo já existente (planner/managerialPlan.ts)
  opportunities: EvidencedClaim[];
  recommendations: Recommendation[]; // reaproveita deriveRecommendations, sem duplicar lógica
  priority: PriorityLevel;           // novo — seção 5
  confidence: ContextQuality;        // reaproveita computeContextQuality, sem recalcular
  limitations: string[];
  memoryNote: string | null;         // "já é o 3º dia de queda" — seção 4, só quando há memória suficiente
}
```

Nada aqui é um cálculo novo. `Director.run()` é, na prática: chamar
`buildOperationalContext(director.ownedCapabilities, ...)` (já existe), rodar
`extractFacts`/`deriveFindings`/`deriveGaps`/`deriveRecommendations` sobre o resultado (já
existem), e empacotar. O único código genuinamente novo por Diretor é a leitura da própria
memória operacional (seção 4) e, no caso do Estratégico, a consolidação (seção 3.3).

### 3.3 `Diretoria` — o orquestrador

```ts
async function runDiretoria(directors: Director[], context: { entities, memory }): Promise<DirectorReport[]>
```

Roda os Diretores selecionados **em paralelo** (mesmo padrão de `Promise.all` já usado em
`executeTools`) — nunca serial. A seleção de QUAIS Diretores acionar para uma pergunta específica
usa a mesma lógica que já existe hoje em `capabilitiesForIntent`: se a pergunta é sobre estoque,
só o Diretor Estoque (e talvez Estratégico, se for uma pergunta ampla) é chamado — nunca todos
por padrão. Isto preserva a garantia mais importante do projeto: **nunca "buscar tudo por
garantia"**.

### 3.4 Diretor Estratégico — a consolidação

O Estratégico não observa nada diretamente. Ele recebe os `DirectorReport[]` já prontos dos
outros e aplica regras puras, testáveis, no mesmo espírito de `deriveRisksAndOpportunities` (Z3):

- **Deduplicação semântica**: se Financeiro reporta "ticket médio baixo" como risco e Comercial
  reporta "poucos adicionais vendidos" como risco, o Estratégico reconhece que são a mesma causa
  raiz e consolida em um único ponto, não dois.
- **Priorização cross-diretor**: ordena todos os riscos/oportunidades de todos os Diretores por
  `PriorityLevel` (seção 5), corta para os 3 principais (mesma regra "no máximo 3 pontos" que já
  rege `narrateBroadManagerial` desde o Z4) — a lista completa continua disponível em "Ver
  fundamentos", nunca é descartada, só não vira o texto principal.
- **Detecção de conflito** (honesta, não arbitrada por IA): se dois Diretores discordam ("Operações
  diz que o movimento está bom", "Financeiro diz que o ticket médio está baixo"), o Estratégico
  não inventa uma média — reporta os dois pontos de vista lado a lado e deixa claro que são
  leituras de dimensões diferentes.

Saída do Estratégico: um `ConsolidatedReport` — estruturalmente quase idêntico ao
`ManagerialPlan` de hoje (facts/risks/opportunities/recommendations/contextQuality), só que agora
**alimentado por vários Diretores em vez de uma lista plana de capacidades**. Isso é o que
permite reaproveitar `narrateManagerialPlan` quase sem alteração (seção 6).

---

## 4. Memória Operacional

Esta é a única peça que **exige uma decisão de persistência nova** — hoje não existe nenhuma
tabela para isto.

### 4.1 O que precisa existir

Uma tabela por observação diária de Diretor (aditiva, não mexe em nenhuma tabela existente):

```
director_observations
  id
  director_id        -- "financeiro" | "operacoes" | ...
  observed_date       -- data (não timestamp) — uma observação por diretor por dia
  summary              -- texto curto: "ticket médio abaixo do necessário"
  metric_key           -- "avgTicket", quando aplicável — permite comparar a MESMA métrica dia a dia
  metric_value          -- valor numérico, quando aplicável
  direction              -- "queda" | "aumento" | "estavel" (reaproveita o mesmo enum de Fact.direction)
  created_at
```

### 4.2 Janela de retenção — "memória operacional, não infinita"

Conforme pedido explicitamente: **últimos dias, últimas semanas, último mês — nunca histórico
irrestrito.** Proposta concreta:

- Retenção física: 60 dias corridos (limpeza automática, não é uma decisão de produto, é só
  para a tabela não crescer sem necessidade).
- Uso pelo narrador: 3 janelas nomeadas — `ultimos_dias` (3-5 dias corridos), `ultima_semana` (7
  dias), `ultimo_mes` (30 dias) — cada Diretor decide qual janela citar conforme o padrão
  encontrado (ex.: "já é o 3º dia" usa `ultimos_dias`; "seguimos abaixo da meta este mês" usa
  `ultimo_mes`).

### 4.3 Como um Diretor gera uma nota de memória

Pura leitura + comparação, sem IA: `computeMemoryNote(directorId, metricKey, today, history)` —
mesma disciplina de `computeHistoricalPattern` (Z2): olha as observações mais recentes da MESMA
métrica, conta quantos dias consecutivos na mesma direção, e só então gera uma frase como "já é o
3º dia de queda". Sem observações suficientes, a resposta honesta continua sendo "ainda não tenho
histórico suficiente para dizer se isso é uma tendência" — mesma regra da Sprint 4.0 para
amostra histórica pequena, aplicada agora à memória entre dias.

### 4.4 Quando a observação do dia é gravada

Proposto: toda vez que a Diretoria roda (uma pergunta ampla no chat, ou o Briefing — seção 6),
cada Diretor grava sua observação do dia — no máximo uma por dia por Diretor (idempotente: se já
rodou hoje, atualiza em vez de duplicar). Isso significa que a memória **nasce do uso normal do
sistema**, não precisa de um job agendado para começar a existir (agendamento fica para depois,
como você pediu).

---

## 5. Sistema de prioridade

Formalização de algo que a Sprint 4.0 já fazia informalmente (o "no máximo 3 pontos" do
narrador). Vira explícito e reutilizável por todos os Diretores:

```ts
type PriorityLevel = "alta" | "media" | "baixa";

function computePriority(claim: EvidencedClaim | Recommendation, quality: ContextQuality): PriorityLevel
```

Regras propostas (explicáveis, não uma pontuação arbitrária — mesmo espírito de
`computeContextQuality`):

- **Alta**: risco/oportunidade com evidência de múltiplos fatos convergentes, ou tendência de
  memória operacional confirmando (ex.: "3 dias seguidos") — nunca um evento isolado de um dia só.
- **Média**: evidência real, mas de um único fato ou sem confirmação de tendência ainda.
- **Baixa**: evidência fraca (amostra pequena, proxy, ou fonte com confiança média/baixa).

O usuário nunca vê "vinte alertas" — vê os de prioridade alta primeiro, com o restante disponível
em "Ver fundamentos"/central de alertas (que já existe e já lista tudo, sem mudança).

---

## 6. Plano de Ação

Extensão pequena e direta do tipo `Recommendation` que já existe (`reasoning/types.ts`) — não é
um conceito novo, é um campo a mais:

```ts
interface Recommendation {
  action: string;
  reason: string;
  evidenceFactKeys: string[];
  priority: PriorityLevel;    // já existe, hoje "alta"|"media"|"baixa" solto — passa a vir de computePriority
  risk: string | null;
  howToVerify: string;
  steps?: string[];           // NOVO — "Treinar oferta de vitrificação", "Reforçar adicionais", "Contato com clientes antigos"
}
```

`steps` é preenchido pelas mesmas funções de recomendação por domínio que já existem
(`reasoning/recommend.ts` — `recommendServiceMix`, `recommendClientRetention`,
`recommendStaffing`, `recommendPricing`, `recommendInventory`), cada uma passa a devolver uma
lista curta de passos concretos em vez de só a ação em uma frase — trabalho de escrita, não de
arquitetura nova.

---

## 7. Reunião de Diretoria e Briefing

### 7.1 Reunião de Diretoria (o ciclo interno)

```
1. runDiretoria(directors)              → DirectorReport[] (paralelo)
2. Diretor Estratégico consolida         → ConsolidatedReport
3. narrateManagerialPlan-equivalente     → texto final
```

Isto é literalmente o pipeline da seção 2, com nome formal para a etapa 1+2. Não é uma reunião
com turnos de fala — é duas etapas de computação pura e determinística.

### 7.2 Briefing automático

Reaproveita **exatamente** o padrão que `generateDailySummary()` ("Resumo do dia") já estabeleceu
no Z4 — a diferença é que hoje ele monta um `ManagerialPlan` a partir de uma pergunta sintética
("Como estamos hoje?"); o Briefing vai montá-lo a partir de **todos os Diretores relevantes do
dia**, incluindo a nota de memória operacional de cada um:

```
"Bom dia, Robério. Hoje identifiquei quatro pontos importantes:

1. [Financeiro, prioridade alta] ...
2. [Operações, prioridade alta] ...
3. [Comercial, prioridade média] ...
4. [Estoque, prioridade baixa] ..."
```

**Conforme pedido explícito, nesta sprint o Briefing é só a arquitetura/função — chamável sob
demanda (ex.: pela mesma tela "Resumo do dia"), sem agendamento automático.** Agendamento (rodar
sozinho de manhã, notificar) fica para uma sprint futura, quando a infraestrutura de tarefas
agendadas do produto for decidida.

---

## 8. Impacto na arquitetura atual (nada é redesenhado, só estendido)

| Componente Sprint 4.0 | O que muda |
| --- | --- |
| `tools/registry.ts`, `executeTools` | **Nada.** Continua sendo a única camada de I/O. |
| `planner/capabilities.ts` | **Nada.** `Director.ownedCapabilities` é só um reagrupamento por cima. |
| `planner/contextBuilder.ts` | **Nada.** Cada Diretor chama a mesma função, só com uma lista de capacidades menor e fixa. |
| `planner/contextQuality.ts` | **Nada.** Reaproveitado tal qual por `DirectorReport.confidence`. |
| `reasoning/*.ts` (facts/findings/diagnose/gaps/recommend) | **Extensão pequena**: `Recommendation.steps?` (seção 6). Resto igual. |
| `planner/managerialPlan.ts` | Continua existindo para perguntas específicas de um único domínio (ex.: "como está o estoque?" não precisa de Diretoria inteira, só do Diretor Estoque sozinho — resposta mais rápida, menos "reunião" para pergunta simples). |
| `narrator/narrateManagerialPlan.ts` | Ganha um caminho de entrada a mais (`narrateConsolidatedReport` ou extensão do mesmo arquivo) para o `ConsolidatedReport` da Diretoria — mesmo estilo de prosa, mesmas regras (seção 2/4/5/6 do Z4 continuam valendo integralmente). |
| `service.ts` (`answerFreeText`) | Passa a decidir, para perguntas amplas (`broad_managerial`, hoje já detectado por `classifyManagerial`), se aciona 1 Diretor (rápido) ou a Diretoria inteira (pergunta realmente ampla, ex.: "como estamos hoje?"). Perguntas simples/específicas continuam exatamente como hoje. |
| `generateDailySummary` | Passa a ser um caso especial do Briefing (seção 7.2) — mesma função, contexto mais rico. |

**Nenhuma migração disruptiva.** O comportamento de hoje (Z4) continua funcionando
integralmente durante toda a Sprint 5.0 — os Diretores são uma camada nova que se soma, nunca uma
substituição que quebra o que já está em produção.

---

## 9. Decisões que preciso da sua confirmação antes de começar

1. **RH e Marketing entram na arquitetura desde já** (como estrutura, sempre honestos sobre não
   terem fonte real) ou você prefere que eu só crie esses dois Diretores quando a fonte real
   existir (Fase B)? Minha recomendação é criá-los já, vazios/honestos — evita redesenhar a lista
   de Diretores depois, e o comportamento visível para o usuário é idêntico a "não configurado"
   em qualquer outro lugar do sistema.
2. **Janela de retenção da memória operacional** — proponho 60 dias de retenção física / janelas
   nomeadas de 3-5 dias, 7 dias, 30 dias (seção 4.2). Confirma esses números ou prefere outros?
3. **Onde a tabela `director_observations` deve ficar** — schema Drizzle novo e aditivo, mesma
   convenção das tabelas de metas/estoque/financeiro já existentes. Confirmo que é aditivo puro
   (nenhuma tabela existente é alterada)?
4. **Onde o Briefing aparece nesta sprint** — proponho substituir o conteúdo do card "Resumo do
   dia" (`/zezinho`) pela versão da Diretoria, sem criar tela nova ainda. Confirma, ou prefere um
   espaço visual separado desde já?
5. **Prioridade dos checkpoints** — a ordem proposta no roadmap (seção 10) começa pelos Diretores
   com dado 100% real (Financeiro/Operações/Estoque/Comercial/Estratégico) e deixa RH/Marketing
   por último, exatamente por não terem fonte ainda. Confirma essa ordem?

---

## 10. Roadmap proposto — Sprint 5.0

Mesmo formato de checkpoints pequenos e aprováveis um a um, como Z1-Z4 da Sprint 4.0.

- **Z1 — Fundação dos Diretores**: tipos (`Director`, `DirectorReport`), os 7 Diretores
  declarados (metadado, igual ao `TOOL_REGISTRY`), `runDiretoria` (orquestração paralela),
  Diretores Financeiro/Operações/Estoque/Comercial implementados sobre capacidades já reais.
  Diretor Estratégico ainda simples (agrega, sem consolidação semântica avançada). RH e Marketing
  já existem como estrutura, sempre reportando "indisponível". Testes unitários por Diretor.
- **Z2 — Prioridade e Plano de Ação**: `computePriority` formal, `Recommendation.steps`,
  consolidação semântica real no Estratégico (deduplicação, detecção de conflito). Reescreve
  `recommend*` de `reasoning/recommend.ts` para devolver passos.
- **Z3A — Memória Conversacional Gerencial** (ver seção 13): memória de sessão, nunca persistida,
  mais Revisão Cruzada e Evidências Contrárias entre Diretores e o Executive Timeline
  (arquitetura, ainda sem banco).
- **Z3B — Memória Organizacional** (ver seção 14): escopo ampliado pelo usuário de "só Memória
  Operacional persistente" para os 4 tipos de memória (Operacional/Estratégica/Organizacional/
  Crenças) e o pipeline Evento→Observação→Aprendizado→Conhecimento. Schema Drizzle aditivo (4
  tabelas), `computeMemoryNote`, promoção/esquecimento testados e validados no Neon. (Chamado de
  "Z3" na proposta original desta seção — dividido em Z3A/Z3B a pedido do usuário antes do início
  da implementação.)
- **Z4 — Reunião de Diretoria + Briefing**: `narrateConsolidatedReport` (ou extensão do narrador
  Z4), `service.ts` decidindo quando acionar 1 Diretor vs. a Diretoria inteira, Briefing
  substituindo o "Resumo do dia", os 20 testes de aceitação da praxe, deploy, validação em
  produção.

Depois da Sprint 5.0 aprovada e validada em produção — só então retomamos a Fase B (integrações
externas), exatamente como combinado.

Nenhuma implementação foi iniciada. Aguardando sua aprovação desta arquitetura (e das decisões da
seção 9) para começar pelo checkpoint Z1.

---

## 11. Checkpoint Z1 — implementado (commit `06c1b82`)

Aprovado integralmente pelo usuário, com as decisões da seção 9 confirmadas: RH e Marketing
entram desde já na arquitetura (honestos sobre a ausência de fonte real); memória operacional
aprovada com o desenho da seção 4; Plano de Ação aprovado com os 6 estados da seção 6; Executive
Briefing aprovado como forma de consolidação diária (não uma "reunião" explícita); novo **Diretor
de Inteligência** acrescentado (correlações cruzadas entre Diretores, nunca inventadas, sempre
com nível de confiança); KPIs/critérios objetivos de participação no Executive Briefing por
Diretor.

Entregue: `directors/types.ts`, `directors/registry.ts` (8 Diretores), `directors/runDirector.ts`
(executor genérico), `directors/estrategico.ts` (consolidação simples), `directors/inteligencia.ts`
(2 correlações reais: clima × movimento, CRM × ticket médio), `directors/diretoria.ts`
(orquestração paralela). `EvidencedClaim`/`deriveRisksAndOpportunities` movidos para
`reasoning/` para reaproveitamento. Nenhuma integração nova, nenhuma mudança no chat vivo
(`service.ts`)/UI — fundação pura.

---

## 12. Checkpoint Z2 — Sistema Executivo de Decisão (implementado, evolução aprovada do usuário)

O usuário evoluiu o escopo original do Z2 (que seria só "prioridade formal + `Recommendation.steps`")
para um **Sistema Executivo de Decisão** completo. Esta seção documenta o que foi construído —
substitui a descrição original do Z2 na seção 10, que ficou estreita demais depois da evolução.

### 12.1 Estrutura obrigatória de 8 seções por Diretor

Todo `DirectorReport` agora contém, sempre: **fatos observados** (`facts`), **diagnóstico**
(`diagnosis` — leitura síntese em uma frase), **hipóteses** (`hypotheses`), **grau de confiança**
(`confidence`, reaproveita `ContextQuality` da Sprint 4.0/Z3), **riscos** (`risks`),
**oportunidades** (`opportunities`), **recomendações** (`recommendations`) e **plano de ação**
(`actionPlans`). Nenhum Diretor devolve só indicadores — sempre há interpretação (diagnóstico +
hipóteses) por trás dos números, nunca um achismo (toda hipótese carrega evidência).

### 12.2 Hipóteses (`directors/hypotheses.ts`)

Convertidas do `Diagnosis` que `reasoning/diagnose.ts` já produzia desde a Sprint 3.0 — nenhum
cálculo novo, só uma forma mais rica de expor o que o motor de raciocínio já calculava:

```
Hypothesis {
  description: string;
  evidenceFactKeys: string[];   // rastreável, técnico
  basis: string[];              // legível: "clima", "histórico", "operação", "financeiro"...
  confidenceScore: number;      // 0-100, banda ilustrativa convertida do nível qualitativo
  confidenceLevel: "alta" | "media" | "baixa";
  limitations: string[];
}
```

`confidenceScore` é uma banda fixa (alta=85, media=60, baixa=30), não uma probabilidade
estatística real — existe só para atender ao formato pedido ("confiança: 82%"); a fonte de
verdade para qualquer decisão continua sendo `confidenceLevel` (a mesma disciplina qualitativa da
Sprint 4.0/Z4: nunca apresentar confiança com precisão que os dados não sustentam). Sem
evidência suficiente, `hypotheses` fica vazio — nunca uma hipótese inventada para preencher
espaço.

### 12.3 Contradições / hipóteses cruzadas (`directors/estrategico.ts`)

O mecanismo pedido pelo usuário para detectar inconsistências entre Diretores — tecnicamente
implementado como hipóteses evidenciadas por **dois ou mais** Diretores diferentes, nunca uma "IA
arbitrando" sem essa dupla evidência real:

- **Gargalo de conversão** (exemplo do usuário: Financeiro + Operações + CRM): dispara quando o
  ritmo da meta está abaixo do necessário (Financeiro, `goal_progress`), o movimento está abaixo
  do padrão histórico (Operações, `historical_pattern`) e há clientes disponíveis para contato
  sem retorno (Comercial, `crm_at_risk_count`) — os três ao mesmo tempo, nunca um sozinho.
- **Problema de captura de leads** (exemplo do usuário: Marketing + CRM): implementado e testado
  com dados sintéticos, mas **fica dormente hoje** — o Diretor de Marketing nunca tem fonte real
  até a Fase B (Meta Ads/Instagram), então este padrão nunca dispara em produção ainda. O
  mecanismo já está pronto para não precisar ser redesenhado quando a fonte chegar.

### 12.4 Impacto operacional formal (`directors/priority.ts`)

Substitui a heurística simples do Z1. Critérios exatamente os pedidos pelo usuário: impacto
financeiro, impacto operacional, urgência, confiança dos dados, quantidade de Diretores
envolvidos. Cada campo é classificado por regra explicável (mesmo espírito de
`computeContextQuality`, Sprint 4.0/Z3) — nunca uma pontuação numérica arbitrária.
`computePriority` roda em estágios: confiança baixa nunca sozinha vira prioridade alta, mesmo com
vários sinais fortes (seção "Limitações" do pedido: "nunca responder com excesso de confiança").

### 12.5 Plano de Ação (`directors/actionPlan.ts`)

Estados exatamente como aprovado: `identificado → sugerido → aprovado → em_execucao → concluido →
descartado`. Todo plano recém-gerado nasce `identificado` — as transições seguintes exigem uma
decisão humana registrada em algum lugar, o que é trabalho de uma sprint futura (quando a
persistência existir). Cada plano carrega prioridade, responsável (`null` — nenhum módulo de RH
real existe), motivo, impacto esperado e prazo sugerido (`null` — nenhuma base real para estimar
prazo, nunca inventado). Um `ActionPlan` por `Recommendation`, nunca menos informativo que a
recomendação que o originou.

### 12.6 Decisões — as três perguntas centrais (`computeExecutiveDecisions`)

*"O que merece minha atenção hoje?"* (hipóteses cruzadas + riscos, no máximo 3 — mesma disciplina
"no máximo 3 pontos" desde o Z4), *"O que eu faria primeiro?"* (a recomendação de maior
prioridade entre todos os Diretores, ou honestamente `null` quando não há nenhuma), *"O que pode
esperar?"* (oportunidades reais, mas não urgentes). Isso é o núcleo de `ConsolidatedReport`, como
pedido.

### 12.7 Executive Advice (`computeExecutiveAdvice`)

Novo componente — "Meu conselho para hoje". Sempre derivado da mesma recomendação/risco de maior
prioridade já calculado pelas Decisões, nunca uma opinião solta; sem nenhuma recomendação ou
risco disponível, admite honestamente que não há dados suficientes para um conselho seguro. A
prosa final ("Se eu estivesse administrando a empresa hoje, minha prioridade seria...") já está
pronta na estrutura — a integração ao narrador do Executive Briefing é trabalho do Z4.

### 12.8 O que fica para depois

- **KPIs de participação por Diretor** além do critério padrão (`priority !== "baixa"`) — o
  usuário pediu "critérios objetivos" por Diretor; o Z2 entrega o critério compartilhado e
  explicável, mas limiares específicos por domínio (ex.: Estoque participar sempre que houver
  item quase vazio, mesmo com prioridade geral baixa) ficam para quando o Z3/Z4 tiverem mais
  Diretores reais rodando em produção para calibrar com dado de verdade.
- **Deduplicação semântica fina** entre riscos/oportunidades individuais (para além dos dois
  padrões nomeados na seção 12.3) continua um refinamento futuro.
- **Persistência do Plano de Ação** (transições reais entre estados) depende da Memória
  Operacional (Z3B) ou de uma tabela própria — arquitetura pronta, sem banco ainda, como pedido
  ("ainda não quero persistência, somente arquitetura").
- Nenhuma mudança no chat vivo (`service.ts`)/UI nesta checkpoint — a Diretoria continua não
  conectada a nada visível ao usuário, como no Z1.

---

## 13. Checkpoint Z3A — Memória Conversacional Gerencial (implementado, decisão do usuário)

Antes de iniciar a Memória Operacional persistente (originalmente "Z3"), o usuário pediu para
dividi-la em duas partes: Z3A cobre tudo que pode existir **sem banco** — memória de sessão,
Revisão Cruzada entre Diretores, Evidências Contrárias e o Executive Timeline. Z3B (seção 10) fica
para a persistência real.

### 13.1 Memória Conversacional (`directors/conversationalMemory.ts`)

"O Zézinho deve manter contexto durante toda a conversa... essa memória dura apenas durante a
conversa. Não deve ser persistida." Mesmo espírito de `memory/session.ts` (`ReasoningSession`) —
funções puras, nunca mutam, sempre devolvem uma nova memória; carregada pelo cliente e devolvida a
cada resposta, exatamente como a sessão de raciocínio já funciona desde a Sprint 3.0. Nenhuma
escrita em banco nasce aqui.

```
ConversationTurn { askedAt, question, hypotheses, decisions, recommendations, actionPlans }
ConversationalMemory { turns: ConversationTurn[] }
```

`buildTurnFromConsolidatedReport` lê o `ConsolidatedReport` já pronto (nunca recalcula).
`withTurn` respeita um limite de segurança de 20 turnos (não é uma decisão de produto, só um teto
para o payload client-held não crescer sem fim numa conversa muito longa) — mantém sempre os mais
recentes. Consultas: `recentQuestions`, `wasHypothesisAlreadyDiscussed`,
`wasRecommendationAlreadyGiven`, `allHypothesesDiscussed`, `allRecommendationsGiven`,
`allActionPlansSuggested` — a integração ao narrador (para o Zézinho evitar repetir o que já disse
na mesma conversa) é trabalho do próximo checkpoint que tocar `service.ts`/o narrador.

### 13.2 Revisão Cruzada e Evidências Contrárias (`directors/crossReview.ts`)

"Os Diretores devem poder confirmar, complementar ou contestar hipóteses uns dos outros antes da
consolidação do Diretor Estratégico." Cada revisão exige evidência **própria e real** do Diretor
revisor no mesmo domínio (`basis`) da hipótese — nunca uma opinião solta:

- **`confirma`**: o revisor tem um risco real no mesmo domínio (mesma leitura da hipótese).
- **`contesta`**: o revisor tem uma oportunidade real no mesmo domínio — uma tensão real entre
  leituras independentes de Diretores diferentes, nunca uma "IA arbitrando" um desacordo.
- Sem nenhuma evidência própria no domínio, o Diretor simplesmente não revisa — honestidade antes
  de opinião.

`Hypothesis` ganhou o campo `contraryEvidenceFactKeys` ("toda hipótese poderá conter evidências
favoráveis e evidências contrárias — isso melhora o cálculo de confiança"). `recalculateConfidence`
ajusta a banda numérica: +8 por confirmação, −18 por contestação (evidência contrária pesa mais que
uma segunda confirmação na mesma direção), sempre entre 0 e 100, com a limitação declarada
explicitamente quando há contestação. `reviewHypotheses` roda contra as hipóteses de cada Diretor
e as hipóteses cruzadas do Estratégico, e nunca deixa um Diretor revisar a própria hipótese.
`consolidate()` (`directors/estrategico.ts`) chama a Revisão Cruzada antes da consolidação final,
exatamente na ordem pedida, e devolve o resultado em `ConsolidatedReport.reviewedHypotheses` —
`reports[].hypotheses` continua intocado como registro original de auditoria.

### 13.3 Executive Timeline (`directors/executiveTimeline.ts`)

"Estrutura capaz de resumir: últimos dias, mudanças, tendências, acontecimentos importantes. Ainda
sem persistência, apenas arquitetura." Sem um banco de observações diárias (isso é o Z3B), a única
fonte real disponível hoje é a própria `ConversationalMemory` da sessão, agrupada por dia:

```
TimelineEntry { date, summary, changes, importantEvents }
ExecutiveTimeline { entries: TimelineEntry[], trends: string[] }
```

`computeChanges` calcula um diff real entre dois turnos (só o que é novo, nunca uma lista repetida
do que já existia). `importantEvents` só lista hipóteses de alta confiança e planos de alta
prioridade — nunca todo o volume do dia, mesma disciplina de "nunca mostrar todos os N alertas".
`computeTrends` exige um mínimo de 3 dias de histórico; abaixo disso devolve honestamente "ainda
não há dias suficientes", nunca extrapola uma tendência a partir de 1-2 dias — mesma disciplina de
`historical-pattern.ts` desde a Sprint 4.0/Z2. A mesma forma `TimelineEntry` será alimentada por
dado persistido real quando o Z3B existir, sem precisar ser redesenhada.

### 13.4 O que fica para depois

- Integração da Memória Conversacional ao `service.ts`/narrador vivo do Zézinho — Z3A entrega só a
  arquitetura pura, testada e pronta para ser plugada; nenhuma mudança no chat vivo/UI ainda.
- Persistência real (Z3B) — a mesma forma de `ConversationTurn`/`TimelineEntry` foi desenhada para
  não precisar de redesenho quando o banco existir.
- `complementa` (o terceiro `ReviewStance`) está no tipo, mas `reviewFrom` hoje só produz
  `confirma`/`contesta` — os dois únicos casos com evidência própria clara e não ambígua
  (risco vs. risco, oportunidade vs. risco). Um critério honesto para `complementa` (evidência
  relacionada, mas nem confirmando nem contestando) fica para quando houver um caso real
  observado, em vez de um critério inventado agora para preencher o tipo.

---

## 14. Checkpoint Z3B — Memória Organizacional do Santa Monica OS (implementado, escopo ampliado pelo usuário)

Antes de começar a Memória Operacional persistente originalmente prevista para o Z3B, o usuário
ampliou o escopo: "o sistema não deve armazenar simplesmente eventos — ele deve aprender". O
resultado é a **Memória Organizacional** — primeira persistência real da Diretoria Inteligente,
via 4 tabelas Drizzle aditivas (migração `0013_parallel_sir_ram.sql`, aplicada e validada no Neon).

### 14.1 O pipeline: Evento → Observação → Aprendizado → Conhecimento

"Evento" é a `Hypothesis` que cada Diretor já calcula todo dia (`hypotheses.ts`, desde o Z2) —
nunca persistido isoladamente. A partir daí, `organizationalMemory/learnings.ts` implementa o
pipeline como uma máquina de estados sobre uma única entidade (`Learning`, mesmo espírito do
`ActionPlan` de 6 estados desde o Z2, em vez de 4 tabelas separadas por estágio):

```
LearningStatus = "observacao" | "aprendizado" | "conhecimento" | "descartado"
```

- **Observação**: primeira ocorrência de uma hipótese (`deriveSignalKey` normaliza a descrição
  numa chave determinística — nunca uma correspondência semântica/fuzzy). Carrega `expiresAt`
  (14 dias, `OBSERVATION_EXPIRY_DAYS`) — sem reconfirmação real dentro do prazo, é esquecida
  (removida de verdade, nunca só marcada — "não quero acumular lixo histórico", decisão do
  usuário).
- **Aprendizado**: promovida quando há confirmações suficientes (`MIN_CONFIRMATIONS_FOR_
  APRENDIZADO = 3`) espalhadas por um período real (`MIN_DAYS_SPAN_FOR_APRENDIZADO = 3` dias —
  nunca 3 confirmações no mesmo dia). A partir daqui, `expiresAt` fica `null`: só evidência
  contrária muda o status, nunca a passagem do tempo (o mesmo princípio de "nunca promover sem
  evidência" aplicado simetricamente a não-demover).
- **Conhecimento**: promovida com `MIN_CONFIRMATIONS_FOR_CONHECIMENTO = 7` confirmações ao longo
  de `MIN_DAYS_SPAN_FOR_CONHECIMENTO = 14` dias. Permanece indefinidamente (decisão do usuário:
  "só conhecimentos consolidados permanecem indefinidamente").
- **Descartado**: reservado para invalidação por evidência contrária real — nenhum mecanismo
  automático usa este estado ainda (fica para quando houver um caso real, mesma disciplina do
  `complementa` não implementado na seção 13.4).

`nextStatus` (`learnings.ts`) é a única função que decide promoção — staged e explicável, mesmo
espírito de `computePriority` (Z2): nunca uma pontuação, sempre um degrau por vez, nunca pulado
sem os dois critérios (quantidade E tempo) simultaneamente.

### 14.2 Os 4 tipos de memória

| Tipo | Entidade | Tabela | Retenção |
|---|---|---|---|
| 1. Operacional | `DirectorDailySnapshot` | `director_daily_snapshots` | Curta — uma leitura por Diretor por dia, comparada por `computeMemoryNote` |
| 2. Estratégica | `StrategicMemoryItem` | `strategic_memory_items` | Nunca expira |
| 3. Organizacional | `Learning` | `director_learnings` | Só `"observacao"` expira (14 dias sem confirmação) |
| 4. Conversacional | `ConversationalMemory` (Z3A) | — nunca persistida | Sessão |

Nota de nomenclatura, para evitar confusão: a palavra "observação" aparece nos tipos 1 e 3 com
sentidos diferentes — `DirectorDailySnapshot` é a leitura bruta do dia (tipo 1); `LearningStatus
=== "observacao"` é o primeiro estágio do pipeline de conhecimento (tipo 3). São conceitos
distintos que compartilham a palavra em português; por isso as entidades TS têm nomes técnicos
diferentes (documentado em `organizationalMemory/types.ts`).

**Memória Operacional** (`organizationalMemory/snapshot.ts`): `summarizeDirectorForSnapshot`
escolhe o sinal mais relevante do dia (risco > oportunidade > hipótese principal > fato isolado
com tendência real — nunca fatos "estável"/"indisponível") e grava no máximo uma leitura por
Diretor por dia (upsert por `directorId` + `snapshotDate`, nunca duplicada). `computeMemoryNote`
compara a leitura de hoje com o histórico e só produz uma nota ("já é o 3º dia consecutivo de
queda em X") quando há pelo menos 2 dias consecutivos com a mesma métrica e direção — abaixo
disso, `null`, honestamente. Populamos `DirectorReport.memoryNote` (reservado desde o Z1/Z2) pela
primeira vez neste checkpoint.

**Memória Estratégica** (`organizationalMemory/strategic.ts`): hoje só popula `kind: "meta"`, a
partir do Fact real `goal_progress` (a única fonte estratégica real disponível, `db/schema/
goals.ts`). "Projeto" e "objetivo" existem no tipo mas nunca são preenchidos — sem um módulo real
de projetos/OKRs, seria inventar dado.

**Crenças da empresa** (`organizationalMemory/beliefs.ts`): `SEED_BELIEFS` — os 4 exemplos dados
literalmente pelo usuário ("qualidade acima da velocidade", "oferecer adicionais quando fizer
sentido", "foco na experiência do cliente", "manter comunicação ativa com leads") mais os 4
princípios não-negociáveis já documentados no contexto do cliente (CLAUDE.md: "nunca prometer o
que não pode entregar", "sempre mostrar resultado real", "respeitar o carro do cliente como se
fosse o nosso", "qualidade acima de volume") — nenhuma inventada, todas rastreáveis à origem
exata via o campo `source`. `findRelevantBeliefs` liga uma crença a uma recomendação por
sobreposição real de palavras-chave (tokenização + interseção de conjuntos) — nunca uma pontuação
semântica ou de IA generativa. Seed idempotente via `statement` único: `npm run db:seed:
organizational-beliefs` (aplicado no Neon: 8 crenças).

### 14.3 "O que aprendemos recentemente?"

`ConsolidatedReport` ganha um irmão: `runDiretoria` (`directors/diretoria.ts`) agora devolve
`DiretoriaRunResult { consolidated, organizationalMemory }` em vez de só `ConsolidatedReport` —
`consolidate()` (`estrategico.ts`) continua 100% puro/síncrono/sem I/O, exatamente como desde o
Z1; quem lê/grava a Memória Organizacional é só o orquestrador, via `organizationalMemory/
service.ts:recordDiretoriaRun`.

```
OrganizationalMemorySnapshot {
  recentLearnings: Learning[];   // status "aprendizado"/"conhecimento" confirmados nos últimos 7 dias — nunca "observacao"
  activeBeliefs: Belief[];
  strategicItems: StrategicMemoryItem[];
  expiredObservationsCount: number;   // transparência sobre o esquecimento desta execução
  limitations: string[];
}
```

Isso é o que basta para o futuro narrador do Executive Briefing responder "o que aprendemos
recentemente?" em vez de só "o que aconteceu?" — a prosa final continua fora do escopo (mesma
divisão de trabalho de `ExecutiveAdvice`/`ExecutiveDecisions` desde o Z2): aqui só estrutura e
evidência, nunca texto pronto.

### 14.4 Arquitetura de persistência

Schema aditivo puro (`db/schema/organizationalMemory.ts`, migração `0013_parallel_sir_ram.sql`,
aplicada e validada no Neon — 4 tabelas, 3 enums novos, nenhuma tabela existente tocada):
`director_daily_snapshots`, `director_learnings`, `strategic_memory_items`,
`organizational_beliefs`. Repositório único (`organizationalMemory/repository.ts` +
`static-repository.ts` + `postgres-repository.ts` + `repository-factory.ts`) seguindo exatamente
o padrão de 4 arquivos já usado em `src/lib/recipes/` e no restante do projeto — as 4 tabelas
vivem sob um único `OrganizationalMemoryRepository` porque são sempre lidas/escritas juntas pelo
mesmo `service.ts` a cada execução da Diretoria, não 4 domínios independentes. Ativado
automaticamente por `getStorageMode()` (Postgres quando `DATABASE_URL` existe, memória caso
contrário) — mesmo mecanismo desde a Sprint 1, sem exigir configuração nova.

### 14.5 O que fica para depois

- Integração ao chat vivo/narrador (`service.ts`, UI) — este checkpoint entrega arquitetura +
  persistência real, testada e validada no Neon, mas `runDiretoria` continua sem nenhum caller em
  produção (mesma situação desde o Z1) — a conexão ao chat é trabalho de um checkpoint futuro.
- `status: "descartado"` (invalidação por evidência contrária) — o tipo existe, mas nenhum
  mecanismo automático o usa ainda; fica para quando houver um padrão real de contradição entre
  Diretores sobre um `Learning` já confirmado (hoje a Revisão Cruzada, Z3A, só atua sobre
  hipóteses do dia, antes da consolidação — nunca sobre aprendizados já persistidos).
- Diretor de Inteligência (`inteligencia.ts`) ainda não consome as tabelas novas — continua
  declarando `INTELLIGENCE_SCOPE_LIMITATION` sobre não cruzar histórico/sazonalidade; ligar suas
  correlações à Memória Organizacional é um upgrade natural, mas fora do pedido deste checkpoint.
- `pruneSnapshotsOlderThan` existe no repositório mas ainda não é chamado por nenhuma rotina — sem
  agendamento (cron) neste checkpoint, mesma decisão já tomada para o Briefing automático (seção
  7.2): a mecânica existe, o gatilho fica para quando houver agendamento real no produto.
