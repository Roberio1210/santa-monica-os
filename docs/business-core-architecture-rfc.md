# RFC-001 — Business Core do Santa Monica OS

**Status:** Proposto, aguardando aprovação
**Autor:** Engenharia (Claude, atuando como Staff Software Engineer neste documento)
**Data:** 2026-08-01
**Escopo:** Arquitetura de domínio de longo prazo (5 anos). Nenhum código, migration, schema ou
commit foi criado ou alterado na produção deste documento. Este é um artefato de decisão, não de
implementação.

---

## 0. Sumário executivo

O Santa Monica OS hoje é um conjunto de **onze módulos que evoluíram de forma independente**
(`finance`, `crm`, `inventory`, `zezinho`, `integrations/stone`, `integrations/jumppark`,
`operations`, `orders`, `goals`, `domain/operational`, mais quatro páginas de UI sem domínio por
trás: agenda, marketing, segurança, compras). Cada um foi construído corretamente dentro do seu
próprio sprint, mas **não existe hoje um núcleo de domínio compartilhado** — cada módulo decide
sozinho como buscar, normalizar e interpretar dado operacional.

Esta RFC define esse núcleo: o **Business Core**, com `OperationalOrder` como agregado central,
e formaliza os limites entre domínios, o grafo de dependências permitidas, e onde cada peça já
construída (Sprints 1–11A) se encaixa — incluindo duas decisões que, na avaliação desta auditoria,
**foram tomadas de forma local e hoje contradizem os princípios que o próprio negócio está
definindo agora**. Nenhuma delas é urgente, mas ambas devem ser corrigidas antes que mais
consumidores se acoplem ao padrão atual, porque o custo de correção cresce com o tempo.

Veredito ao final da Seção 12: **a arquitetura está pronta para o Sprint 11B**, condicionada a
duas decisões que devem ser tomadas *antes* da migration (não depois) — ver Seção 12.

---

## 1. Diagnóstico do estado atual

### 1.1 O que existe, evidenciado por código (não por memória de sprint)

```
src/lib/
├── domain/operational/     ← OperationalOrder (Sprint 10) — 0 consumidores, não persistido
├── finance/                ← domínio financeiro maduro (Sprints Financeiro 1-6 + DRE)
├── crm/                    ← "CRM Premium" — busca JumpPark AO VIVO a cada request
├── inventory/               ← domínio maduro (Fases A-D), quase auto-contido
├── orders/                 ← elegibilidade de consumo — lê JumpPark direto, nome colide com
│                              o novo conceito de OperationalOrder
├── operations/central.ts   ← agregador da Central de Operações (dashboard)
├── zezinho/
│   ├── directors/          ← Diretoria Inteligente (8 diretores, Sprints 8-Z3B) — FISICAMENTE
│   │                          dentro do módulo de chat, não é um domínio próprio
│   ├── planner/, intent/, narrator/, reasoning/, memory/  ← IA conversacional
├── integrations/
│   ├── stone/               ← Collector maduro, bem isolado (normalize.ts, persistence/)
│   ├── jumppark/             ← Collector, SEM normalização estável para um DTO próprio
│   ├── whatsapp/, google/, meta/, mercadolivre/, weather/, cameras/  ← existem, uso variável
├── goals/                   ← domínio pequeno (metas/bônus), isolado
├── agents/, services/, security/, repositories/   ← DIRETÓRIOS VAZIOS (0 arquivos)
```

```
src/app/  (rotas)
├── dashboard, financeiro, clientes, estoque, movimentacoes, estacionamento, lavacao, zezinho
│     ↑ todas com domínio real por trás
├── agenda, marketing, seguranca, compras
│     ↑ 100% dado mock (`data/mock/*`, `DemoDataBadge`) — NENHUM domínio real por trás hoje
```

```
src/db/schema/
auth.ts  hr.ts  crm.ts  inventory.ts  jumppark.ts  finance.ts  system.ts
accounting.ts  goals.ts  organizationalMemory.ts  stone.ts
↑ Não existe schema "operational.ts" — confirma o achado do Sprint 11A: OperationalOrder
  ainda não tem persistência.
```

### 1.2 Decisões arquiteturais que hoje contradizem os princípios propostos pelo negócio

Estes não são bugs — são decisões locais, corretas no contexto do sprint em que foram tomadas,
que hoje conflitam com os cinco princípios enunciados na solicitação desta RFC.

**Achado 1 — CRM conhece a JumpPark diretamente.**
`src/lib/crm/service.ts` e `src/lib/crm/aggregate.ts` importam
`@/lib/integrations/jumppark` diretamente e buscam dado ao vivo a cada request. Isso viola o
Princípio 4 ("nenhum módulo pode conhecer diretamente APIs externas") e o Princípio 5 ("toda
inteligência trabalha sobre domínios internos, nunca sobre payloads da JumpPark"). Foi a decisão
certa quando não existia `OperationalOrder` — CRM Premium precisava de *algum* dado real e não
tinha domínio para consumir. Hoje que o domínio existe (ainda que não persistido), este é o
primeiro acoplamento a corrigir assim que a Seção 11C do roadmap (sincronização real) estiver
pronta.

**Achado 2 — Inventory tem o mesmo padrão.**
`src/lib/orders/eligible-orders.ts` (usado pelo pipeline de confirmação de consumo, Fase D do
Estoque) também lê a JumpPark diretamente para decidir quais ordens são elegíveis a consumo de
insumo. Mesmo motivo, mesma correção pendente — ver roadmap, Sprint 15.

**Achado 3 — A Diretoria Inteligente está fisicamente dentro do módulo de chat.**
Os 8 diretores (`zezinho/directors/*`: Estratégico, Inteligência, Financeiro, Revisão Cruzada,
Memória Organizacional etc.) fazem correlação e raciocínio sobre fatos de negócio — isso é
conceitualmente **Analytics**, não **Artificial Intelligence conversacional**. Hoje eles vivem em
`src/lib/zezinho/directors/`, o que significa que qualquer futuro consumidor que precise dos
mesmos KPIs/diagnósticos (por exemplo, um futuro dashboard de Marketing, ou uma API pública de
relatórios) teria que depender do módulo de chat para obtê-los — uma dependência semanticamente
errada. Isso não quebrou nada até agora porque o único consumidor da Diretoria é o próprio
Zézinho, mas é uma bomba-relógio de acoplamento: quanto mais o sistema crescer sem corrigir isso,
mais caro fica separar depois.

**Achado 4 — `src/lib/orders/` colide semanticamente com `OperationalOrder`.**
O nome `orders/` já existia (Fase D do Estoque, elegibilidade de consumo) antes do Sprint 10
introduzir `OperationalOrder` como o agregado central do negócio. Hoje há dois conceitos
diferentes chamados "order" no código: um é about elegibilidade de consumo de insumo, o outro é
o agregado central do domínio. Isso não é um erro grave, mas é uma fonte real de confusão para
qualquer engenheiro futuro (humano ou IA) que grep por "order" no código.

**Achado 5 — Financeiro classifica ordens JumpPark, não `OperationalOrder`.**
`src/lib/finance/classification.ts` (`classifyJumpParkOrder`) recebe um shape ad hoc
(`ClassifiableOrder`) derivado diretamente da JumpPark, não o domínio `OperationalOrder`. Isso
significa que, mesmo com o domínio operacional criado no Sprint 10, o Financeiro (via Diretor
Financeiro e DRE) continua, na prática, dependente do formato bruto da integração — o Princípio 3
("Stone não é o centro financeiro... o domínio financeiro deve ser independente") já foi
corretamente resolvido para o lado Stone (via `normalize.ts`), mas o lado JumpPark/receita
operacional ainda não passou pelo mesmo tratamento.

**Achado 6 — Quatro domínios de negócio existem apenas como UI mock.**
`agenda`, `marketing`, `seguranca` (câmeras) e `compras` são páginas reais em produção, mas 100%
alimentadas por `data/mock/*` — não há nenhum domínio, repositório ou dado real por trás. Isso não
é um erro — é trabalho ainda não iniciado — mas precisa ser tratado como tal no roadmap: são
domínios greenfield, não módulos "quase prontos".

### 1.3 O que já está correto e deve ser preservado como está

- **Stone como Collector puro** (`integrations/stone/`): já tem `normalize.ts`,
  `persistence/repository.ts` com upsert por chave natural, `client.ts` isolado. É o exemplo mais
  maduro de Collector no sistema hoje e deve servir de modelo para a JumpPark.
- **`OperationalOrder` mapper** (`domain/operational/mappers/fromJumpPark.ts`): é o único ponto do
  sistema que conhece o shape bruto da JumpPark para fins de domínio operacional — exatamente o
  padrão de Collector→Domínio que esta RFC quer generalizar.
- **`FinanceRepository`/`StonePersistenceRepository`**: padrão de interface única + duas
  implementações (memory/postgres) via `getStorageMode()` já é o padrão correto e deve ser
  replicado por todo domínio novo, incluindo `OperationalOrderRepository` (Sprint 11B).
- **`crm/normalize.ts`**: já é corretamente compartilhado entre `integrations/jumppark` e
  `domain/operational` sem violar camadas — prova de que o padrão de "camada neutra" funciona no
  projeto.

---

## 2. Princípios arquiteturais (formalizados)

Os cinco princípios definidos pelo usuário são adotados integralmente e formalizados como regras
de dependência obrigatórias, verificáveis por revisão de import:

1. **`OperationalOrder` é o agregado central do negócio.** Representa um serviço executado —
   não uma normalização de payload de fornecedor. Qualquer domínio que precise saber "o que a
   empresa fez, para quem, quando, por quanto" lê `OperationalOrder`, nunca um Collector.
2. **JumpPark é um Collector, não o sistema principal.** Hoje é o único fornecedor de dado
   operacional; o desenho deve permitir múltiplos fornecedores no futuro sem alterar
   `OperationalOrder` nem seus consumidores — apenas adicionar um novo mapper `fromX.ts`.
3. **Stone é um Collector financeiro, não o centro financeiro.** O domínio Financial já segue
   isso parcialmente (via `normalize.ts`); falta apenas fechar o lado da receita operacional
   (Achado 5).
4. **Nenhum domínio de negócio importa um módulo de `integrations/*` fora da fronteira de
   mapeamento.** Só o próprio Collector e o mapper dedicado (`mappers/fromX.ts` de cada domínio)
   podem importar tipos de `integrations/*`. Hoje isso é violado por `crm/` e `orders/`
   (Achados 1 e 2) — a correção é parte do roadmap, não desta RFC.
5. **Toda inteligência (Diretoria, Zézinho, futura IA generativa) trabalha sobre domínios
   internos e sobre Analytics — nunca sobre payload de Collector.** Hoje é majoritariamente
   verdade (Zézinho lê `facts.ts`/capacidades, não a JumpPark bruta), com a ressalva do Achado 3
   (posicionamento físico da Diretoria).

---

## 3. Definição do Business Core

**Business Core = o conjunto mínimo de domínios e agregados que, se todo o resto do sistema
fosse apagado, ainda contariam a história completa de "o que a empresa fez, para quem, quanto
cobrou, e o que isso significa para o caixa."**

Core: **Operational, Financial, CRM, Inventory, Scheduling, Human Resources.**

Tudo o mais (Analytics, Artificial Intelligence, Marketing, Documents, Notifications,
Audit, Security/Auth) é **consumidor ou capacidade de suporte** do Business Core — nunca
fonte de verdade sobre o que a empresa faz.

---

## 4. Domínios — responsabilidades, limites e dependências

Convenção de leitura: "pode consumir" = pode importar tipos/repositórios/serviços de leitura de;
"nunca conhece" = proibido em qualquer circunstância, inclusive indiretamente.

### 4.1 Operational — núcleo do sistema

- **Responsabilidade:** ser a fonte de verdade sobre serviços executados. Dono de
  `OperationalOrder`, `Vehicle` (na acepção operacional), e da identidade de operador
  (`employeeId`, um valor derivado, não um `Employee` formal).
- **Limites:** não sabe nada sobre dinheiro além dos valores brutos já cobrados na ordem
  (`grossAmount`/`discountAmount`/`netAmount`) — não faz DRE, não sabe forma de pagamento
  categorizada financeiramente, não sabe conciliação bancária.
- **Populado por:** Collectors (`integrations/jumppark` hoje; outros no futuro), via mapper
  dedicado (`mappers/fromJumpPark.ts`, futuro `mappers/fromX.ts`).
- **Quem pode consumir Operational:** Financial, CRM, Inventory, Scheduling, Analytics.
- **Quem nunca deve conhecer Operational diretamente:** nenhum — é o núcleo, todo domínio de
  negócio deve poder lê-lo. A única regra é que ninguém além do próprio Operational pode
  *escrever* nele.

### 4.2 Financial — domínio financeiro

- **Responsabilidade:** dinheiro. `CashMovement`, `Invoice`, `Payment`,
  `AccountsReceivable`/`Payable`, DRE, conciliação bancária.
- **Limites:** não decide o que é um "serviço executado" (isso é do Operational) — apenas
  classifica financeiramente o que o Operational reporta como receita, e reconcilia isso com o
  que os Collectors financeiros (Stone) reportam como movimentação bancária real.
- **Populado por:** Collector Stone (movimentações bancárias/settlements) + leitura de
  `OperationalOrder` (para classificação de receita, DRE) — nunca lê JumpPark diretamente
  (correção pendente, Achado 5).
- **Quem pode consumir Financial:** Analytics, Artificial Intelligence (via Analytics).
- **Quem nunca deve conhecer Financial diretamente:** Operational, CRM, Inventory, Scheduling,
  HR — nenhum domínio operacional deve depender de saber se uma ordem já foi paga/conciliada
  para funcionar. Essa é uma regra dura: operação não pode ficar bloqueada por financeiro.

### 4.3 CRM

- **Responsabilidade:** identidade e relacionamento com o cliente — `Customer`, histórico,
  segmentação, futuramente `Opportunity`/`Interaction`/`Tag`.
- **Limites:** não decide preço, não decide o que foi feito no carro (isso é Operational) — apenas
  agrega e interpreta o histórico de `OperationalOrder` por cliente.
- **Populado por:** leitura de `OperationalOrder` (nunca JumpPark diretamente — correção
  pendente, Achado 1).
- **Quem pode consumir CRM:** Marketing, Sales (se vier a existir), Analytics.
- **Quem nunca deve conhecer CRM diretamente:** Operational, Financial, Inventory — o histórico
  comercial do cliente não deve ser pré-requisito para o funcionamento de nenhum desses três.

### 4.4 Inventory

- **Responsabilidade:** insumos, receitas, consumo, compras sugeridas — já maduro (Fases A-D).
- **Limites:** não decide se uma ordem é elegível a consumo sozinho — isso depende de
  `OperationalOrder` (categoria de serviço, veículo) — hoje decide isso lendo JumpPark
  diretamente (Achado 2), correção pendente.
- **Populado por:** movimentações internas (compras, contagens) + leitura de `OperationalOrder`
  para o pipeline de confirmação de consumo.
- **Quem pode consumir Inventory:** Financial (custo), Analytics.
- **Quem nunca deve conhecer Inventory diretamente:** CRM, Scheduling, HR.

### 4.5 Scheduling — não existe hoje além de mock

- **Responsabilidade proposta:** `Appointment` — o compromisso agendado, estágio *anterior* a um
  `OperationalOrder`. Um `Appointment` pode gerar um `OperationalOrder` quando o cliente chega e o
  serviço é executado; a relação é 1:0..1, nunca o contrário.
- **Limites:** não é o mesmo agregado que `OperationalOrder` — são estágios de vida diferentes do
  mesmo relacionamento comercial, e devem permanecer aggregates separados mesmo que fortemente
  relacionados.
- **Quem pode consumir Scheduling:** Operational (para vincular um Appointment ao
  OperationalOrder gerado), Notifications (lembretes), CRM.
- **Quem nunca deve conhecer Scheduling diretamente:** Financial, Inventory, HR.

### 4.6 Human Resources

- **Responsabilidade:** `Employee` formal (CLT/PJ), folha, documentos trabalhistas — já modelado
  em schema (`hr.ts`), zero código, zero uso.
- **Limites — regra dura:** **nunca** deve ser inferido ou vinculado automaticamente ao
  `employeeId`/operador do `OperationalOrder` por correspondência de nome. Qualquer ponte entre
  os dois deve ser uma tabela de curadoria explícita (mesmo padrão já usado com sucesso em
  `jumppark_service_mappings`), nunca fuzzy matching.
- **Quem pode consumir HR:** Financial (folha como despesa), Analytics.
- **Quem nunca deve conhecer HR diretamente:** Operational — o operador registrado numa ordem
  (`employeeId`) é e deve continuar sendo um dado informal e não sensível; ele nunca deve
  disparar uma consulta a dado de RH (salário etc.) por conta própria.

### 4.7 Analytics — projeção, não fonte de verdade

- **Responsabilidade:** agregação, correlação, diagnóstico, KPIs, tendências. É onde a Diretoria
  Inteligente (Estratégico, Financeiro, Inteligência, etc.) deveria fisicamente viver
  (Achado 3) — hoje vive em `zezinho/directors/`.
- **Limites:** não tem fonte de verdade própria sobre negócio — só lê Operational, Financial,
  CRM, Inventory, HR e computa. As exceções são suas próprias estruturas de "memória aprendida"
  (`StrategicMemoryItem`, `DirectorLearning`, `DirectorDailySnapshot`, `OrganizationalBelief` —
  já existem, Sprint Z3B) — essas *são* legitimamente persistidas por Analytics, porque não são
  fatos de negócio, são conhecimento derivado sobre os fatos.
- **Quem pode consumir Analytics:** Artificial Intelligence, Marketing, futuros dashboards
  externos.
- **Quem nunca deve conhecer Analytics diretamente:** Operational, Financial, CRM, Inventory,
  Scheduling, HR — nenhum domínio de negócio pode depender de um diagnóstico ou correlação para
  funcionar.

### 4.8 Artificial Intelligence

- **Responsabilidade:** interface conversacional (Zézinho) — intenção, planejamento, narração,
  memória de sessão. Já majoritariamente correto (lê `facts.ts`/capacidades, não payload bruto).
- **Limites:** nunca deve importar `integrations/*` diretamente (já é verdade hoje) nem
  recomputar sozinho o que Analytics já computa (parcialmente verdade — a Diretoria hoje vive
  dentro deste módulo, ver Achado 3, gerando essa mistura).
- **Quem pode consumir AI:** apenas Presentation (rotas/UI).
- **Quem nunca deve conhecer AI diretamente:** todo domínio de negócio — nenhum deles pode
  depender do Zézinho para funcionar.

### 4.9 Marketing — não existe hoje além de mock

- **Responsabilidade proposta:** campanhas, calendário de conteúdo, futuramente `Campaign`.
- **Quem pode consumir:** lê CRM (segmentos) e Analytics — nunca Collectors diretamente.
- **Quem nunca deve conhecer:** Operational, Financial, Inventory, HR diretamente.

### 4.10 Sales — recomendação: não criar como domínio próprio ainda

Não há hoje nenhuma evidência de código ou de processo de negócio (orçamento formal, funil de
proposta) que justifique um domínio `Sales` separado de `CRM`. A recomendação desta RFC é
modelar "venda" como uma capacidade de CRM (`Opportunity`, já previsto no backlog pendente #70)
em vez de criar um domínio novo — evita over-engineering especulativo, indo contra o princípio de
não decidir por preferência estética. Se o negócio evoluir para ter um funil comercial formal
(orçamentos, follow-up de proposta, PPF/vitrificação como venda consultiva de ticket alto — que já
é descrito no contexto do cliente como público-alvo), revisitar esta decisão com evidência
concreta nesse momento.

### 4.11 Documents — recomendação: capacidade cross-cutting, não domínio de negócio

Contratos (`contracts`, `contract_benefits`, `contract_value_periods`) já existem e pertencem
semanticamente ao **Financial** (são a base de Contas a Receber recorrentes). "Documents" não
deveria possuir esse dado — deveria ser um serviço cross-cutting de geração/armazenamento de
artefatos (PDF, futura assinatura eletrônica) chamado *por* Financial/HR/CRM, nunca dono da
verdade contratual.

### 4.12 Notifications — cross-cutting, reativo

- **Responsabilidade:** despachar mensagens (WhatsApp — já existe integração —, e-mail, push) a
  partir de eventos de outros domínios.
- **Regra dura:** nunca contém lógica de negócio — só "enviar X para Y pelo canal Z". Reage a
  eventos, nunca é consultado por outro domínio para decisão.

### 4.13 Security — recomendação: dividir em dois conceitos que hoje colidem no nome

A rota `/seguranca` hoje é o módulo "Vigia" (câmeras Intelbras/Mibo) — segurança **física**. Isso
é completamente diferente de segurança de **sistema** (autenticação, autorização, controle de
acesso — já existe como `src/lib/auth/`, e há um diretório `src/lib/security/` vazio, presumivelmente
reservado para isso). Recomendação: tratar "Auth/Access Control" como infraestrutura
cross-cutting (todo domínio depende dela, ela não depende de nenhum), e "Vigia/Câmeras" como uma
pequena capacidade adjacente ao Operational (monitoramento do pátio), não um domínio de negócio
com agregados próprios.

### 4.14 Audit — cross-cutting

- **Responsabilidade:** log de eventos de mudança de estado relevantes, por qualquer domínio.
  `audit_logs` já existe no schema (0 linhas, sem uso ainda). Deve permanecer uma capacidade
  compartilhada (uma função `recordAuditEvent()` chamável por qualquer domínio), nunca um domínio
  com regras de negócio próprias.

---

## 5. Agregados — catálogo oficial

| Agregado | Domínio dono | Status | Por que existe |
|---|---|---|---|
| `OperationalOrder` | Operational | Definido (Sprint 10), não persistido | Núcleo do negócio — "o que foi feito, para quem, quanto custou" |
| `Vehicle` (operacional) | Operational | Definido (Sprint 10), não persistido | Identidade de veículo derivada de placa, sem depender de CRM formal |
| `Service` (catálogo) | Operational/Inventory (compartilhado) | Existe (`services`, 17 linhas ativas) | Define o que a empresa vende/executa — insumo tanto para classificação operacional quanto para regras de consumo de estoque |
| `Customer` | CRM | Schema existe (`customers`, 0 linhas, não sincronizado) | Identidade e histórico comercial do cliente — hoje derivado ao vivo, deveria ser populado a partir de `OperationalOrder` |
| `Employee` (formal) | HR | Schema existe (`employees`, 0 linhas, 0 código) | Registro trabalhista formal (CLT/PJ), dado sensível (salário) — nunca confundido com o operador informal do `OperationalOrder` |
| `Payment` / `Invoice` | Financial | Existem, ativos | Registro de cobrança/fatura |
| `CashMovement` | Financial | Existe, ativo (Sprint Fluxo de Caixa) | Livro-caixa — a verdade sobre entradas/saídas |
| `AccountsReceivable` / `AccountsPayable` | Financial | Existem, ativos | Contas a receber/pagar, incl. recorrências |
| `StoneNormalizedTransaction` / `StoneReconciliationResult` / `StoneDivergence` | Financial | Existem, ativos (815/510 linhas reais) | Sub-agregados específicos da capacidade de conciliação bancária — corretamente escopados sob Financial, alimentados pelo Collector Stone |
| `InventoryItem` | Inventory | Existe, ativo (65 itens) | Controle de insumo |
| `Appointment` | Scheduling | **Não existe** — proposto | Estágio anterior ao `OperationalOrder`; sem ele, não há como o negócio gerenciar agenda de forma real (hoje é 100% mock) |
| `Opportunity` / `Interaction` / `Tag` | CRM | Não existem — já previstos no backlog (#70) | Suportam CRM avançado sem precisar de um domínio `Sales` novo |
| `DirectorReport` / `ManagerialPlan` | Analytics / AI | Existem como estruturas computadas, não persistidas | Read-models — nunca fonte de verdade, recomputados a cada consulta |
| `StrategicMemoryItem` / `DirectorLearning` / `DirectorDailySnapshot` / `OrganizationalBelief` | Analytics | Existem, ativos (Sprint Z3B) | Conhecimento aprendido sobre os fatos — legitimamente persistido por Analytics, por não ser fato de negócio primário |

---

## 6. Grafo oficial de dependências

```
                         ┌─────────────────────────────────────────┐
                         │   Collectors (integrations/*)             │
                         │   JumpPark · Stone · WhatsApp · Google ·   │
                         │   Meta · MercadoLivre · Weather · Cameras  │
                         │   (únicos que conhecem API externa)        │
                         └───────────────┬─────────────────────────┘
                                         │ mappers/fromX.ts (fronteira única)
                                         ▼
        ┌────────────────────────────────────────────────────────────┐
        │                    OPERATIONAL (núcleo)                     │
        │              OperationalOrder · Vehicle · Service            │
        └───────┬─────────────┬─────────────┬─────────────┬──────────┘
                │             │             │             │
                ▼             ▼             ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐
          │ FINANCIAL │  │   CRM     │  │ INVENTORY  │  │ SCHEDULING │
          │(+ Stone   │  │           │  │            │  │  (futuro)  │
          │ Collector)│  │           │  │            │  │            │
          └─────┬────┘  └─────┬────┘  └─────┬─────┘  └─────┬──────┘
                │             │             │             │
                └──────┬──────┴──────┬──────┴──────┬──────┘
                       │             │             │
                       ▼             ▼             ▼
                 ┌────────────────────────────────────┐
                 │              ANALYTICS               │
                 │  (Diretoria: Estratégico, Financeiro, │
                 │   Inteligência, Cross-Review, etc.)   │
                 └───────────────────┬────────────────┘
                                     ▼
                        ┌─────────────────────────┐
                        │  ARTIFICIAL INTELLIGENCE  │
                        │  (Zézinho — intenção,      │
                        │   planner, narrador)        │
                        └───────────────┬──────────┘
                                        ▼
                              ┌──────────────────┐
                              │   PRESENTATION     │
                              │  (rotas Next.js,    │
                              │   componentes)       │
                              └──────────────────┘

     HUMAN RESOURCES — dependência isolada, ponte curada e explícita apenas:
        HR ──(tabela de curadoria manual)──> Operational.employeeId
        HR ──> Financial (folha como despesa)

     MARKETING (futuro) ──> lê CRM + Analytics, nunca Collectors

Cross-cutting (chamáveis por qualquer camada acima, nunca chamam "para cima"):
  Auth/Access Control · Audit · Notifications · Documents (artefatos)
```

**Regra de leitura do grafo:** uma seta significa "pode ler". Nenhuma seta pode ser desenhada no
sentido inverso sem violar um princípio (ex.: Operational nunca lê Financial; Financial nunca lê
CRM). Collectors nunca aparecem abaixo de Operational no grafo — nenhum domínio de negócio pode
importar um Collector.

---

## 7. Mapeamento dos módulos existentes → nova arquitetura

| Sprint / entrega | O que construiu | Domínio na nova arquitetura | Já pertence ao Business Core? |
|---|---|---|---|
| Sprints 1-6 (fundação) | Schema Drizzle, repositórios padronizados, Estoque (seed 48 itens), Contratos/AR (IESA, Funerária, Don Juan), doc de RH, Auth gate | Inventory, Financial (embrionário), HR (doc), Auth (cross-cutting) | Sim (Inventory, Financial), parcial (HR só schema) |
| Sprint 7 (Financeiro completo: AP, AR, Fluxo de Caixa, DRE) | Domínio financeiro maduro | Financial | Sim — é hoje o Financial domain real |
| Sprint 8 (Diretor Financeiro Inteligente) | Métricas/tendências/diagnóstico rules-based | Analytics (deveria) — hoje fisicamente em `zezinho/` | Sim, mas mal posicionado (Achado 3) |
| Sprint 9 (JumpPark architecture review) | Pesquisa, sem código | Preparação para Operational | N/A (pesquisa) |
| Sprint 10 (OperationalOrder domain) | Types, classificador de categoria, mapper JumpPark→domínio | Operational | Sim — é o embrião literal do núcleo, ainda não persistido |
| Sprint 11A (esta auditoria) | Desenho de persistência do domínio operacional | Operational | Preparação direta para o núcleo ganhar persistência |
| Stone Z1 (client/normalize) | Collector isolado | Collector layer | Sim — modelo de referência |
| Stone Z2 (normalize, identity, reconciliationSummary) | Normalização financeira | Financial (via Collector) | Sim |
| Stone Z3 (financialSchedule, jumpparkReconciliation, divergences) | Conciliação Stone×JumpPark | Financial | Sim, mas compara Stone × JumpPark bruto, não Stone × Operational (dívida pendente, Sprint 16 do roadmap) |
| Stone Z4 (persistência, healthStatus, UI) | Persistência real da conciliação | Financial | Sim |
| Sprint 7.0-7.2 (hardening Stone, retry, classificação de erro) | Robustez do Collector | Collector layer | Sim |
| Zézinho Z1-Z4 (intent, planner, narrador, memória) | IA conversacional | Artificial Intelligence | Sim |
| Diretoria Z1-Z3B (8 diretores, correlações, memória organizacional) | Raciocínio sobre fatos de negócio | Analytics (deveria) — hoje em `zezinho/directors/` | Sim, mas mal posicionado (Achado 3) |
| CRM Premium (aggregator, `/clientes`) | Agregação de cliente via JumpPark ao vivo | CRM | Sim, mas acoplado a Collector diretamente (Achado 1) |
| Central de Operações (`operations/central.ts`) | Agregador de dashboard | Presentation (agregador cross-domínio) | Sim, mas mistura fontes — deve migrar para ler só domínios formais |
| Estoque Fase A-D (ledger, receitas, calibração, consumo) | Domínio maduro | Inventory | Sim, mas com uma dependência direta de JumpPark (`orders/eligible-orders.ts`, Achado 2) |
| `src/lib/orders/` | Elegibilidade de consumo | Fronteira Operational↔Inventory | Sim, mas nome colide com `OperationalOrder` (Achado 4) — candidato a rename/absorção |
| `agenda`, `marketing`, `seguranca`, `compras` (UI) | Páginas mock | Scheduling, Marketing, Security(Vigia), Inventory(compras) | Não — são domínios greenfield, 100% mock hoje |

---

## 8. Simplificações propostas

1. **Não criar um domínio `Sales` separado agora** (Seção 4.10) — modelar como capacidade de CRM
   (`Opportunity`). Evita um domínio novo sem evidência de necessidade real.
2. **Não criar um domínio `Documents` com agregados próprios** (Seção 4.11) — tratar como serviço
   cross-cutting de geração/armazenamento de artefato; a verdade contratual continua em
   Financial.
3. **Renomear/absorver `src/lib/orders/`** — seu conteúdo pertence à fronteira
   Operational↔Inventory; o nome deveria deixar de colidir com `OperationalOrder` (ex.: mover
   para `inventory/consumption/` ou para uma capacidade dentro de `domain/operational/`). Baixo
   risco, puramente organizacional — não muda comportamento.
4. **Extrair a Diretoria de `zezinho/directors/` para um módulo `analytics/` de primeira classe**
   — reorganização de pastas, sem mudar lógica interna. Resolve o Achado 3 sem exigir reescrita.
5. **Avaliar os quatro diretórios vazios** (`src/lib/agents/`, `services/`, `security/`,
   `repositories/`) — provavelmente scaffolding esquecido; ou passam a ser os lares oficiais de
   conceitos desta RFC (ex.: `security/` como home de Auth cross-cutting) ou são removidos.
   Decisão a ser tomada em sprint de housekeeping, não nesta RFC.
6. **Eliminar a triplicação de `classifyPaymentMethod`** (já documentada na auditoria do Sprint
   11A) — mover para camada neutra (`utils/`), seguindo o precedente já existente de
   `utils/mask.ts`.

---

## 9. Riscos arquiteturais futuros

1. **Dívida crescente enquanto CRM/Inventory continuam lendo JumpPark diretamente.** Quanto mais
   tempo o padrão "fetch ao vivo" permanecer em produção, mais consumidores se acoplam a ele, e
   mais caro fica migrar para `OperationalOrder` depois. Prioridade: fechar a sincronização real
   (Sprint 11C) antes de expandir ainda mais superfície baseada em fetch ao vivo.
2. **Tensão de mascaramento de PII não resolvida.** `customers.phone` é armazenado sem máscara
   por design ("máscara é responsabilidade da apresentação"), enquanto `OperationalOrder` mascara
   no mapper. Se CRM passar a consumir `OperationalOrder` sem uma política unificada, há risco
   real de inconsistência de exposição de dado sensível entre as duas fontes.
3. **Diretoria/Zézinho crescendo como "God module".** Sem uma camada Analytics formal por baixo,
   cada novo diretor ou capacidade tende a ser adicionado dentro de `zezinho/`, ampliando o
   Achado 3 e dificultando que qualquer futuro consumidor (um dashboard de Marketing, uma API
   pública de relatórios) reutilize esse raciocínio sem depender do módulo de chat.
4. **Ausência de mecanismo formal de eventos de domínio.** Não existe hoje um event bus nem
   outbox — `Notifications` e `Audit` não têm como reagir a mudanças de estado de outros domínios
   de forma desacoplada. À medida que o sistema cresce, isso tende a gerar chamadas diretas
   entre domínios ("Financial chama Notifications diretamente") em vez de publicação de eventos.
   Recomenda-se desenhar isso antes de qualquer sprint que implemente Notifications real.
5. **HR permanece 100% vazio.** Se o negócio precisar de folha de pagamento real com urgência,
   isso pode virar um gargalo repentino — hoje é apenas schema reservado, sem nenhuma validação
   de que o desenho atual (`employees`) atende ao que uma folha real exige.
6. **Conciliação Stone × JumpPark compara contra o Collector bruto, não contra `Operational`.**
   Isso é aceitável hoje (é o mecanismo mais crítico e testado do sistema — 815+510 registros
   reais), mas significa que, enquanto não migrar, a conciliação e o `OperationalOrder` podem
   divergir silenciosamente sobre o que é "a mesma ordem" sem que ninguém perceba. Migrar por
   último (Sprint 16), só depois de o `OperationalOrder` provar confiabilidade em consumidores de
   menor risco.

---

## 10. Roadmap (Sprint 11B → 18+)

| Sprint | Objetivo | Domínio | Complexidade | Risco | Depende de | Estimativa |
|---|---|---|---|---|---|---|
| **11B** | Migration `operational_orders` + `OperationalOrderRepository` (memory+postgres) + testes — sem sincronização real ainda | Operational | Média | Baixo (aditivo, sem consumidor) | 11A aprovado + 2 decisões pendentes (Seção 12) | Curta (1 sprint) |
| **11C** | `syncJumpParkOrders()` real (reaproveitando `jumppark_sync_logs`) + backfill histórico, validado no Neon | Operational | Média-alta (idempotência, retry, concorrência) | Médio (primeira escrita real em produção) | 11B | Média |
| **11D** | Primeiro consumidor real: Central de Operações passa a ler `OperationalOrder` (aditivo, lado a lado com fetch atual) | Operational / Presentation | Baixa | Baixo | 11C | Curta |
| **12** | Housekeeping arquitetural: extrair Diretoria para `analytics/` de primeira classe; eliminar triplicação de `classifyPaymentMethod`; decidir destino dos diretórios vazios; renomear/absorver `src/lib/orders/` | Analytics / cross-cutting | Baixa | Baixo (reorganização, sem mudar lógica) | Nenhuma (pode rodar em paralelo com 11D) | Curta |
| **13** | CRM real: migrar `crm/service.ts`/`aggregate.ts` para consumir `OperationalOrder`; ativar persistência de `customers`/`vehicles`; resolver tensão de mascaramento (Risco 2) | CRM | Média-alta | Médio (muda comportamento de página em produção) | 11D | Média |
| **14** | Financeiro: `classification.ts` passa a receber `OperationalOrder` em vez de `ClassifiableOrder` ad hoc; Diretor Financeiro passa a ler Operational via Analytics | Financial / Analytics | Média | Médio (não pode quebrar DRE) | 11D (pode rodar em paralelo com 13) | Média |
| **15** | Inventory: migrar `orders/eligible-orders.ts` (ou seu sucessor pós-Sprint-12) para consumir `OperationalOrder` em vez de JumpPark direto | Inventory | Média | Médio (pipeline de consumo já é crítico) | 11D, 12 | Média |
| **16** | Conciliação Stone × JumpPark migra para comparar Stone × `OperationalOrder` (Risco 6) | Financial | Alta | Alto (mecanismo mais crítico do sistema) | 13, 14, 15 provados estáveis em produção | Longa |
| **17** | Scheduling real: `Appointment` do zero, ligação com `OperationalOrder` | Scheduling | Média-alta (domínio novo) | Baixo (não herda dívida de nada existente) | 12 | Média |
| **18** | HR real (só se houver necessidade de negócio confirmada): `Employee` formal + folha, ponte curada com `OperationalOrder.employeeId` | HR | Alta (dado sensível/regulatório) | Alto | Justificativa de negócio explícita | Longa |
| **19+** | Marketing real (`Campaign`, lendo CRM+Analytics), Notifications real (requer desenho de eventos, Risco 4), Documents como serviço cross-cutting | Marketing / Notifications / Documents | Variável | Variável | 13 (Marketing), Risco 4 resolvido (Notifications) | Oportunista |

---

## 11. Regras de enforcement (como garantir que isso não vire só um documento)

- Nenhum arquivo em `src/lib/{crm,finance,inventory,domain,zezinho}/**` (exceto os arquivos
  `mappers/from*.ts` dedicados de cada domínio) deve importar de `src/lib/integrations/**`. Isso
  é verificável por um lint rule ou grep em CI no futuro — não implementado nesta RFC.
- Todo domínio novo (Scheduling, HR real) deve nascer já seguindo o padrão
  interface+memory+postgres+`repository-factory.ts` — não como exceção.
- Qualquer nova tabela deve seguir a convenção `common.ts` (`id()`, `timestamps`, `active()`,
  `source()`, `externalId()`, `notes()`) — já é convenção, apenas reafirmada aqui como regra
  formal do Business Core.

---

## 12. Recomendação formal

**A arquitetura descrita nesta RFC está pronta para orientar o Sprint 11B**, com duas decisões
que precisam ser tomadas explicitamente **antes** da migration (não durante, não depois),
porque ambas afetam o schema físico da tabela `operational_orders`:

1. **Convenção de casing de `source`** — o domínio usa `"JUMPPARK" | "MANUAL" | "FUTURO"`
   (maiúsculo); a convenção do resto do projeto (`common.ts`, outras tabelas) usa minúsculo. Uma
   escolha errada aqui significa uma migration de correção mais tarde.
2. **Tratamento de `metadata.clientName` sem máscara** — precisa de uma decisão explícita de
   privacidade antes de qualquer linha real ser gravada, já sinalizado na auditoria do Sprint
   11A.

Fora essas duas decisões pontuais, não há bloqueio estratégico: os princípios estão claros, o
grafo de dependências está definido, e o roadmap dá uma sequência segura (Operational primeiro,
sempre aditivo, consumidores de menor risco antes dos de maior risco, Conciliação Stone×JumpPark
por último). A reorganização física da Diretoria (Sprint 12) é recomendada, mas **não bloqueia**
o início do Sprint 11B — pode rodar em paralelo.

**Veredito: aprovado para prosseguir ao Sprint 11B, condicionado às duas decisões acima.**
