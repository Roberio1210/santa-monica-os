# Auditoria e Desenho Definitivo — Persistência do Domínio Operacional (Sprint 11A)

> **Documento de auditoria, apenas leitura.** Nenhum código foi alterado. Nenhuma migration foi
> criada. Nenhum dado foi alterado no Neon. Nenhum commit foi feito. Este documento aguarda
> aprovação antes de qualquer implementação (Sprint 11B em diante).
>
> Todas as consultas ao Neon foram `SELECT` puros (contagem de linhas, `information_schema`,
> `pg_indexes`, `pg_constraint`). Nenhum `INSERT`/`UPDATE`/`DELETE`/DDL foi executado.

Data da auditoria: 2026-08-01. Snapshot de produção (Neon) capturado nesta data — ver Seção 1
para os números exatos.

---

## 1. Estado real das tabelas existentes

### 1.1 Snapshot completo de linhas (todas as 48 tabelas do schema `public`)

```
account_transfers: 0                  goals: 1                              recurring_bill_templates: 10
accounting_periods: 0                 inventory_consumption_confirmations:0 reconciliation_records: 0
accounts_payable: 0                   inventory_consumption_lines: 0        service_consumption_rules: 0
accounts_receivable: 1                inventory_items: 65                   services: 17
alerts: 0                             inventory_movements: 67               strategic_memory_items: 0
allocation_rule_shares: 0             invoices: 1                           stone_divergences: 510
allocation_rules: 0                   jumppark_service_mappings: 40         stone_import_runs: 31
audit_logs: 0                         jumppark_service_orders: 0            stone_normalized_transactions: 418
cash_movements: 2                     jumppark_sync_logs: 0                 stone_reconciliation_results: 815
classification_rules: 15              organizational_beliefs: 8             suppliers: 11
contract_benefits: 1                  partners: 4                           users: 0
contract_value_periods: 2             payments: 1                           vehicle_category_assignments: 0
contractors: 0                        process_step_product_suggestions: 26  vehicles: 0
contracts: 3                          recipe_calibration_samples: 0
cost_centers: 7
customers: 0
director_daily_snapshots: 0
director_learnings: 0
employee_documents: 0
employees: 0
financial_accounts: 3
financial_categories: 29
financial_classifications: 0
```

`operational_orders` **não existe** no banco — confirmado diretamente via
`information_schema.tables`.

### 1.2 Tabelas relevantes para esta decisão (detalhe)

#### `jumppark_service_orders` — existe, **0 linhas**, **0 escritores no código**

```
id             uuid       PK, default gen_random_uuid()
external_id    text       NOT NULL, UNIQUE
code           text
entry_time     timestamptz
exit_time      timestamptz
order_date     date       NOT NULL
plate_masked   text
vehicle_model  text
client_name    text
client_phone_masked text
parking_amount numeric    default 0
services_amount numeric   default 0
total_amount   numeric    default 0
payment_method text
situation      text
raw_payload_sanitized jsonb  (nullable)
active         bool       default true
source         text       default 'manual'
notes          text
created_at / updated_at
```

Índices: PK em `id`; `UNIQUE` em `external_id`. Sem FKs.

Grep confirma: **nenhuma função `syncJumpParkOrders()` existe no projeto** e nenhum arquivo em
`src/` faz `insert`/`update` nesta tabela. É uma tabela completamente construída (schema correto,
pronta para upsert idempotente por `external_id`) mas nunca usada — provavelmente criada em um
sprint anterior como preparação que não chegou a ser conectada.

#### `jumppark_sync_logs` — existe, **0 linhas**, **0 escritores no código**

```
id, started_at, finished_at
status          enum (running | success | partial | error)
date_range_start, date_range_end
orders_fetched, orders_inserted, orders_updated
attempt         int, default 1
error_message
active, source, external_id, notes, created_at, updated_at
```

Apenas índice de PK. Mesma situação: schema pronto para registrar execuções de sincronização
(mesmo desenho usado por `stone_import_runs`, que está ativo com 31 linhas), mas nunca escrito.

#### `operational_orders` — **não existe**

Confirmado via consulta direta a `information_schema.tables`. Não há ambiguidade aqui.

#### `reconciliation_records` (schema `finance.ts`) — existe, **0 linhas**, **órfã**

```
id, cash_movement_id (FK -> cash_movements.id), external_reference,
matched_amount, match_status (enum, default 'unmatched'), reconciled_at,
active, source, external_id, notes, created_at, updated_at
```

Grep confirma: a única ocorrência da string `reconciliationRecords` fora do próprio arquivo de
schema é em `src/lib/integrations/stone/persistence/importRun.ts`, e é um **falso positivo** — ali
é apenas o nome de uma variável local (`const reconciliationRecords: StoneReconciliationResultRecord[] = ...`),
sem nenhuma relação com esta tabela. **Esta tabela é completamente diferente e não relacionada à
conciliação Stone × JumpPark.** Ela não é usada por nenhum código ativo.

#### `stone_reconciliation_results` — **ativa, 815 linhas**

```
id, natural_key (UNIQUE), stone_sale_external_key, jumppark_order_external_id,
match_type (enum), confidence (enum), heuristic_score,
favorable_signals (jsonb), contrary_signals (jsonb), rule_applied,
review_status (enum, default 'open'), period_from, period_to,
created_at, updated_at
```

Esta é a persistência real do motor de conciliação Stone × JumpPark (Sprint 7, Z3/Z4), escrita via
`upsertReconciliationResults()` em `StonePersistenceRepository`. **Não é tocada nesta auditoria e
não deve ser alterada em nenhuma implementação futura desta decisão.**

#### `stone_divergences` — **ativa, 510 linhas** — mesmo motor, mesma restrição de não alterar.

#### `stone_import_runs` — **31 linhas** — histórico de importações Stone (referência de padrão de
"sync log" bem-sucedido, usado como modelo na Seção 11).

#### `jumppark_service_mappings` — **40 linhas, ativa** — curadoria de nomes de serviço
(`src/lib/orders/service-mapping.ts`), usada por `wash-grouping.ts`/`eligible-orders.ts`. Não
relacionada diretamente a `OperationalOrder`, mas confirma que o projeto já tem um mecanismo
maduro de mapeamento curado quando necessário.

#### `customers` / `vehicles` (schema `crm.ts`) — existem, **0 linhas**, uso muito restrito

```
customers: id, name, phone (texto completo, não mascarado — comentário no
código: "Telefone completo, se disponível — máscara é responsabilidade da
camada de apresentação"), email, segment, total_spent, last_visit,
active, source, external_id, notes, created_at, updated_at

vehicles: id, customer_id (FK -> customers.id), plate (texto completo, não
mascarado), model, active, source, external_id, notes, created_at, updated_at
```

Único uso em código de produção: `PostgresFinanceRepository.resolveCashMovementPartyName()`
(`src/lib/finance/postgres-repository.ts`, linhas ~600-620) — um `SELECT ... WHERE id = ...`
simples para resolver o nome de exibição de um lançamento de caixa (`cash_movements.customer_id`).
**Nenhum código grava nesta tabela.** O CRM Premium atual (`src/lib/crm/service.ts`,
`src/lib/crm/aggregate.ts`) busca dados da JumpPark **ao vivo, a cada requisição** — nunca
persiste em `customers`/`vehicles`.

**Tensão arquitetural identificada:** `customers.phone` é armazenado **sem máscara** por decisão
explícita ("máscara é responsabilidade da apresentação"), enquanto o domínio `OperationalOrder`
(Sprint 10) mascara `licensePlate` **no mapper**, antes de qualquer persistência. São duas
filosofias de mascaramento diferentes convivendo no mesmo projeto. Isso não bloqueia a decisão
desta auditoria (que trata de `OperationalOrder`, não de `customers`), mas precisa ser resolvido
conscientemente se um dia `OperationalCustomer` ganhar tabela própria — não é objeto desta
sprint.

#### `employees` (schema `hr.ts`) — existe, **0 linhas**, **0 usos de código**

```
id, user_id (nullable), full_name (NOT NULL), role (NOT NULL),
admission_date, work_schedule, base_salary (numeric), active, source,
external_id, notes, created_at, updated_at
```

Esta é a tabela formal de RH (CLT/PJ), com dado sensível (`base_salary`) — corresponde ao módulo
descrito em `docs/hr-module-architecture.md`. **Não deve ser reutilizada ou confundida** com o
conceito de `OperationalEmployee` do Sprint 10 (derivado do texto livre `userName`/
`userOutputName` da JumpPark, sem nenhuma garantia de correspondência com um funcionário formal).
Misturar as duas coisas via correspondência de nome (fuzzy matching) criaria risco real de
atribuir incorretamente dados a um funcionário formal e potencialmente expor `base_salary` por
associação indevida.

### 1.3 Convenção de colunas comuns (`src/db/schema/common.ts`)

Reutilizada em `jumppark.ts`, `crm.ts`, `hr.ts`, `finance.ts` e deve ser seguida por qualquer
tabela nova:

```ts
id()          // uuid, defaultRandom(), primaryKey()
timestamps    // createdAt / updatedAt (timestamptz, defaultNow(), notNull())
active()      // boolean, default true, notNull()
source()      // text, notNull(), default 'manual'
externalId()  // text, nullable
notes()       // text, nullable
```

### 1.4 Numeração de migrations

Última migration aplicada: `drizzle/0016_overjoyed_next_avengers.sql` (Sprint 7.2, Stone).
Uma eventual migration para `operational_orders` seria `0017_*.sql` — **informativo apenas,
nenhuma migration foi criada nesta auditoria.**

---

## 2. Fluxo atual completo da JumpPark

```
API JumpPark (Bearer token)
   │
   ▼
src/lib/integrations/jumppark/client.ts   (fetch HTTP, sem persistência)
   │
   ▼
src/lib/integrations/jumppark/cache.ts    (cache em memória, TTL curto — não é persistência)
   │
   ├──► service.ts / operations-summary.ts   (parse, agregação, classificação de forma de
   │                                           pagamento — classifyPaymentMethod local duplicada
   │                                           nos dois arquivos, ver Seção 14)
   │
   ├──► consumidores diretos do service.ts/operations-summary.ts (fetch-on-request, sempre):
   │      • src/app/estacionamento/page.tsx, lavacao/page.tsx, movimentacoes/page.tsx
   │      • src/components/operations/{movements,parking,wash}-view.tsx
   │      • src/lib/zezinho/{service.ts, comparison-engine.ts, tools/executor.ts, tools/registry.ts}
   │      • src/lib/integrations/stone/jumpparkReconciliationService.ts (conciliação Stone × JumpPark)
   │
   ├──► src/lib/crm/service.ts, src/lib/crm/aggregate.ts
   │      (CRM Premium — busca ao vivo, nunca persiste em customers/vehicles)
   │
   ├──► src/lib/finance/classification.ts (classifyJumpParkOrder — desacoplado via
   │      interface ClassifiableOrder, não importa integrations/jumppark diretamente)
   │
   └──► src/lib/domain/operational/mappers/fromJumpPark.ts  (Sprint 10 — NOVO, PARALELO)
          mapJumpParkOrderToOperationalOrder / ...Customer / ...Vehicle / ...Employee
          ▲
          │  ZERO consumidores confirmados via grep — nenhum arquivo fora de
          │  src/lib/domain/operational/ importa este módulo, exceto seus próprios testes.
          └  É código morto do ponto de vista de uso em produção: existe, está testado,
             mas nada o chama hoje.
```

**Pontos-chave para a decisão de persistência:**

- **Não existe coleta em lote nem sincronização periódica hoje.** Todo consumidor busca a
  JumpPark sob demanda (fetch-on-request), com cache curto em memória (`cache.ts`) — não
  persistência.
- **Não existe normalização única.** `service.ts` e `operations-summary.ts` cada um implementa
  sua própria função `classifyPaymentMethod` (idêntica, duplicada). O mapper do Sprint 10
  implementa uma terceira versão, deliberadamente mirrorada (não importada) para não acoplar o
  domínio à camada de integração.
- **O domínio `OperationalOrder` (Sprint 10) é um caminho novo e paralelo, ainda não conectado a
  nenhum consumidor.** Isso significa que a decisão de persistência desta sprint não tem, hoje,
  nenhum consumidor real dependendo dela — o que reduz o risco de qualquer escolha (não há nada
  para quebrar), mas também significa que a tabela ficará vazia até que a sincronização e ao
  menos um consumidor sejam implementados em sprints futuras.
- **A conciliação Stone × JumpPark (`jumpparkReconciliationService.ts`) consome o formato antigo
  (`JumpParkServiceOrder`, via `service.ts`), não o domínio novo.** Qualquer estratégia de
  persistência do `OperationalOrder` precisa deixar esse caminho intocado — confirmado que hoje
  eles não compartilham nenhum código de leitura/escrita.

---

## 3. Consumidores atuais (mapeamento por módulo)

| Consumidor | Fonte de dados hoje | Persistência hoje |
|---|---|---|
| Central de Operações (`/estacionamento`, `/lavacao`, `/movimentacoes`) | `service.ts`/`operations-summary.ts`, fetch ao vivo | Nenhuma |
| CRM Premium (`/clientes`) | `crm/service.ts`, `crm/aggregate.ts`, fetch ao vivo da JumpPark | Nenhuma (`customers`/`vehicles` existem mas ficam vazias) |
| Financeiro (classificação DRE) | `finance/classification.ts`, recebe `ClassifiableOrder` já extraído (desacoplado) | Nenhuma direta — dados financeiros vão para `cash_movements` etc., não para uma tabela de ordens |
| Conciliação Stone × JumpPark | `jumpparkReconciliationService.ts`, fetch ao vivo | `stone_reconciliation_results` / `stone_divergences` (ativa) |
| Zézinho | `zezinho/service.ts`, `comparison-engine.ts`, `tools/executor.ts`, `tools/registry.ts` — fetch ao vivo | Nenhuma |
| Indicadores/Dashboard | Passa pelos mesmos agregadores acima (nenhum acesso direto a tabela) | Nenhuma |
| Agenda | Não identificado nenhum consumo de dados operacionais JumpPark hoje | — |
| RH | Não identificado nenhum consumo de dados operacionais JumpPark hoje (tabela `employees` é RH formal, sem relação) | — |

---

## 4. Alternativas avaliadas

### Alternativa A — Reaproveitar `jumppark_service_orders` como persistência do domínio

**Vantagens:** tabela já existe, já tem `UNIQUE(external_id)` pronta para upsert idempotente,
zero custo de nova migration.

**Riscos/limitações:**
- Schema é **estruturalmente mais estreito** que `OperationalOrder`: não tem `discount_amount`,
  não tem `employee_id`, não tem `service_category` como conceito estruturado (só `situation`
  livre), não tem um `status` limpo open/closed (tem `situation`, texto livre da JumpPark), não
  tem `metadata` genérico (tem `raw_payload_sanitized`, que é mais estreito — não guarda a lista
  de serviços/operadores estruturada que o mapper do Sprint 10 já produz).
- O nome da tabela (`jumppark_service_orders`) amarra semanticamente a um único source, enquanto
  `OperationalOrder.source` já é um tipo `"JUMPPARK" | "MANUAL" | "FUTURO"` — reaproveitar essa
  tabela para fontes futuras exigiria renomear a tabela ou aceitar um nome semanticamente errado
  permanentemente.
- Exigiria **alterar** uma tabela existente (mesmo que vazia) com várias colunas novas — mais
  risco de migration do que criar uma tabela nova aditiva.

**Duplicação:** nenhuma (é a mesma tabela).
**Impacto em consumidores:** nenhum hoje (ninguém lê/escreve nela).
**Impacto na conciliação:** nenhum, desde que não se toque em `stone_reconciliation_results`
diretamente — mas reaproveitar uma tabela cujo propósito original aparentemente era servir de
staging para a conciliação (dado o nome e o desenho) é uma leitura razoável do código morto, e
alterá-la para outro propósito pode confundir uma futura leitura do schema.
**Estratégia de migração:** ALTER TABLE aditivo.
**Rollback:** reverter ALTER TABLE — mais custoso que dropar uma tabela nova.
**Custo de manutenção:** médio — schema fica um "meio-termo" entre o propósito original (staging
JumpPark bruto) e o novo (domínio operacional multi-fonte).

### Alternativa B — Criar `operational_orders` nova, migrar consumidores gradualmente

**Vantagens:**
- Schema nasce exatamente do formato de `OperationalOrder` (Seção 6), sem compromissos com um
  desenho anterior que nunca foi usado.
- Nome correto desde o início (`operational_orders`, não amarrado a uma fonte específica) —
  consistente com o tipo `source` já multi-valor no domínio.
- É uma migration **puramente aditiva** (`CREATE TABLE`) — não toca em nenhuma tabela existente,
  não tem risco de quebrar nada que já funciona.
- `jumppark_service_orders` e `jumppark_sync_logs` continuam existindo, intocadas — se um dia se
  decidir que foram criadas para outro propósito, nada foi perdido.

**Riscos:**
- Cria uma tabela nova em um banco que já tem 48 tabelas, das quais várias estão vazias e sem
  uso — risco de aumentar essa lista se a Alternativa B não for seguida de implementação real
  (sincronização + consumidor) em sprints subsequentes.
- Não reaproveita o trabalho já feito na criação de `jumppark_service_orders`/`jumppark_sync_logs`
  — mas como confirmado, esse trabalho nunca foi conectado a nada, então o "reaproveitamento"
  seria de um desenho, não de dado real.

**Duplicação:** nenhuma duplicação de **dado** (a tabela antiga continua vazia); há duplicação de
**intenção de schema** entre `jumppark_service_orders` e `operational_orders` — mitigável
documentando explicitamente que a primeira está descontinuada/não utilizada (sem apagá-la nesta
sprint).
**Impacto em consumidores:** nenhum nesta sprint (nenhuma migração de consumidor autorizada).
**Impacto na conciliação:** nenhum — tabelas completamente separadas.
**Estratégia de migração:** `CREATE TABLE operational_orders (...)`, aditiva, reversível via
`DROP TABLE` sem efeito colateral em nenhuma outra tabela.
**Rollback:** trivial — `DROP TABLE operational_orders` não afeta nada mais, pois nenhum
consumidor a usa ainda.
**Custo de manutenção:** baixo — schema alinhado 1:1 com o domínio já existente e testado.

### Alternativa C — Manter as duas tabelas com responsabilidades diferentes

**Vantagens:** preserva `jumppark_service_orders` para um propósito futuro ainda não definido
(ex.: staging bruto por fonte, separado do domínio consolidado).

**Riscos:**
- Cria duas fontes de verdade em potencial para o mesmo tipo de dado (uma ordem de serviço), o
  que é exatamente o que o usuário pediu para evitar ("não duplicar dado, não criar duas fontes
  de verdade").
- Sem um propósito concreto e diferenciado já definido para `jumppark_service_orders`, manter as
  duas tabelas é apenas adiar a decisão, não resolvê-la — aumenta a complexidade cognitiva sem
  benefício demonstrado hoje.
- Nenhuma evidência no código atual sugere um uso diferenciado planejado para as duas tabelas —
  isso seria uma decisão de design especulativa, não baseada em código/banco reais (o que o
  usuário pediu explicitamente para evitar).

**Duplicação:** alta — praticamente a mesma entidade em dois lugares, com risco real de
divergência futura.
**Veredito:** descartada por falta de justificativa concreta, não por preferência estética.

### Decisão

**Alternativa recomendada: B — criar `operational_orders` nova.**

Motivo, baseado exclusivamente em evidência de código e banco:
1. `jumppark_service_orders` está vazia e sem nenhum escritor — não há dado real a preservar
   nem migração de dado a fazer, então "reaproveitar" não economiza nada além de uma
   `CREATE TABLE`.
2. O schema de `jumppark_service_orders` é estruturalmente mais estreito que `OperationalOrder`
   — reaproveitá-la exigiria um `ALTER TABLE` com várias colunas novas, o que tem custo de risco
   igual ou maior que criar uma tabela nova, sem nenhum benefício em troca.
3. O nome `jumppark_service_orders` está semanticamente amarrado a uma única fonte, o que
   contradiz o tipo `source: "JUMPPARK" | "MANUAL" | "FUTURO"` já definido no domínio desde o
   Sprint 10.
4. A Alternativa B é a única das três que é puramente aditiva (não altera nenhuma tabela
   existente) e trivialmente reversível (`DROP TABLE` sem efeito colateral).

---

## 5. Schema proposto — mapeamento campo a campo

> Nenhum destes tipos/nomes é definitivo até a migration ser escrita e revisada em sprint
> futura — esta é a proposta para aprovação, não uma migration.

| Campo do domínio | Coluna proposta | Tipo | Natureza do dado | Nullable | Índice | Chave única |
|---|---|---|---|---|---|---|
| `id` | `id` | `uuid` (default `gen_random_uuid()`) | gerado pelo banco | não | PK | — |
| `externalId` | `external_id` | `text` | real (quando `serviceOrderId` existe) / derivado (fallback composto placa+data quando ausente) | não | sim | parte de `UNIQUE(source, external_id)` |
| `source` | `source` | `text` | real (literal fixo do mapper) | não (default `'manual'` por convenção do projeto — decisão de casing pendente, ver Seção 16) | sim | parte de `UNIQUE(source, external_id)` |
| `serviceType` | `service_type` | `text` | real, mas derivado (só o primeiro serviço da lista) | sim | não | — |
| `serviceCategory` | `service_category` | `text` (não enum — categoria pode ganhar novos valores sem migration) | derivado (função pura `classifyServiceCategory`) | não | sim | — |
| `customerId` | `customer_id` | `text` (slug base64url, não FK — não existe tabela de clientes operacionais ainda) | derivado (chave de identidade telefone/nome) | sim | sim | — |
| `vehicleId` | `vehicle_id` | `text` (slug base64url, não FK) | derivado (placa normalizada) | sim | sim | — |
| `licensePlate` | `license_plate_masked` | `text` | **sempre mascarado** — nunca placa completa | sim | não | — |
| `vehicleModel` | `vehicle_model` | `text` | real, não sensível | sim | não | — |
| `employeeId` | `employee_id` | `text` (slug, não FK — nunca ligado a `employees` formal, ver Seção 1.2/`employees`) | derivado (nome do operador normalizado) | sim | sim | — |
| `openedAt` | `opened_at` | `timestamptz` | real (`entryDateTime`) | sim | sim (para `findByPeriod`) | — |
| `startedAt` | `started_at` | `timestamptz` | **sempre `null` hoje** — JumpPark não confirma este dado (ver `docs/jumppark-data-map.md`); coluna reservada para fontes futuras (`MANUAL`/`FUTURO`) | sim | não | — |
| `finishedAt` | `finished_at` | `timestamptz` | idem `started_at` — sempre `null` hoje, não inventado | sim | não | — |
| `deliveredAt` | `delivered_at` | `timestamptz` | real (`exitDateTime`) | sim | não | — |
| `status` | `status` | `text` (`'open' \| 'closed'`) | derivado deterministicamente (presença de `exitDateTime`) | não | sim | — |
| `paymentStatus` | `payment_status` | `text` (`'paid' \| 'unknown'`), default `'unknown'` | derivado — `'paid'` só quando `financialSituationName === "Pago"` exatamente, nunca um terceiro estado inventado | não | não | — |
| `paymentMethod` | `payment_method` | `text` | real, texto livre da JumpPark | sim | não | — |
| `grossAmount` | `gross_amount` | `numeric(12,2)`, default `0` | real (`totalAmount`, coagido/arredondado) | não | não | — |
| `discountAmount` | `discount_amount` | `numeric(12,2)`, default `0` | real, mas **nunca observado populado em amostra real** — sempre 0 até hoje, campo mantido honesto (não removido, pois o tipo já existe e a API já expõe o campo) | não | não | — |
| `netAmount` | `net_amount` | `numeric(12,2)`, default `0` | derivado (`grossAmount - discountAmount`) | não | não | — |
| `notes` | `notes` | `text` | **sempre `null` hoje** — campo de observações não confirmado como populado na API real | sim | não | — |
| `metadata` | `metadata` | `jsonb`, default `'{}'` | derivado/composto — ver alerta de privacidade abaixo | não | não | — |
| — | `created_at` / `updated_at` | `timestamptz` | gerado (convenção `common.ts`) | não | não | — |
| — | `active` | `boolean`, default `true` | convenção `common.ts` (soft-delete) | não | não | — |

**Alerta de privacidade sobre `metadata`:** o mapper atual (`fromJumpPark.ts`, linhas 124-132)
coloca `clientName` **sem máscara** dentro de `metadata`, junto de `clientPhoneMasked` (esse sim
mascarado). Isso significa que, se este `metadata` for persistido como está, o nome completo do
cliente entra no banco dentro de um campo `jsonb` não estruturado, fora do controle de acesso que
normalmente se aplicaria a um campo `name` dedicado. Esta é uma decisão que precisa ser tomada
explicitamente na implementação (Seção 16, item de risco), não decidida tacitamente por persistir
o `metadata` como está.

**Índices recomendados:** `UNIQUE(source, external_id)`; índice simples em `opened_at`,
`customer_id`, `vehicle_id`, `service_category`, `status`, `employee_id`.

---

## 6. Estratégia de identidade e idempotência

**Chave de idempotência recomendada: `UNIQUE(source, external_id)`.**

Justificativa:
- `external_id` sozinho não é suficiente porque fontes diferentes (`MANUAL`, `FUTURO`) podem, em
  teoria, gerar o mesmo identificador por coincidência — o composto `(source, external_id)`
  elimina esse risco sem custo adicional.
- `establishmentId + externalId` foi avaliado, mas não existe hoje nenhum conceito de
  `establishmentId` no domínio nem na integração JumpPark atual (a Sta Mônica opera um único
  estabelecimento) — adicionar essa coluna agora seria especular sobre uma necessidade não
  confirmada. Se o negócio expandir para múltiplos estabelecimentos, isso pode ser adicionado
  depois sem quebrar a chave existente (bastaria estendê-la).

**Mecanismo: constraint única + upsert transacional (`INSERT ... ON CONFLICT (source, external_id) DO UPDATE ...`), nunca "consultar antes e inserir depois".**

Isso é exatamente o padrão já usado e comprovado em produção por
`StonePersistenceRepository.upsertNormalizedTransactions()` / `upsertReconciliationResults()` /
`upsertDivergences()` (`src/lib/integrations/stone/persistence/repository.ts`) — upsert em lote
por chave natural, nunca "select then insert". Este é o precedente concreto a seguir, não uma
escolha nova.

Isso garante:
- **Reprocessamento seguro:** rodar a sincronização do mesmo período duas vezes nunca duplica.
- **Sincronização concorrente:** a constraint única no Postgres resolve corridas de forma atômica
  — duas execuções tentando gravar a mesma ordem ao mesmo tempo resultam em um upsert
  sequenciado pelo banco, nunca em duas linhas.
- **Atualização de ordem existente:** uma ordem que estava `open` e passa a `closed` (JumpPark
  atualiza `exitDateTime`) é uma atualização natural via `ON CONFLICT DO UPDATE`.
- **Backfill:** rodar a sincronização para um intervalo histórico é idêntico a uma sincronização
  incremental — mesma função, período maior.
- **Múltiplas origens futuras:** `source` já faz parte da chave, então uma ordem `MANUAL` e uma
  `JUMPPARK` nunca colidem mesmo que compartilhem um `external_id` por coincidência.

---

## 7. Estratégia de histórico

**Recomendação: apenas estado atual na tabela principal, sem tabela de eventos.**

- `created_at`/`updated_at` (já parte da convenção `common.ts`) são suficientes para saber quando
  um registro foi criado e a última vez que mudou — não há evidência de necessidade real de saber
  *o que* mudou entre uma atualização e outra.
- `metadata` (jsonb) já comporta informação adicional não estruturada sem exigir novas colunas a
  cada necessidade.
- **Não criar event sourcing completo** (tabela de eventos por mudança de campo) — não há
  consumidor hoje que precise de "qual era o status desta ordem às 14h de ontem". Se essa
  necessidade surgir concretamente no futuro (ex.: auditoria de mudança de forma de pagamento),
  ela deve ser justificada e desenhada como uma sprint própria, com um consumidor real
  identificado primeiro — não antecipada agora.

---

## 8. Segurança e privacidade

- **Placa:** sempre mascarada antes de persistir (`license_plate_masked`) — já é o comportamento
  do mapper atual (`maskPlate`), mantido.
- **Telefone:** o domínio `OperationalOrder` não tem um campo de telefone de primeira classe — ele
  só aparece dentro de `metadata.clientPhoneMasked`, já mascarado pelo mapper. Nenhuma mudança
  necessária.
- **Nome do cliente:** ver alerta na Seção 5 — `metadata.clientName` está **sem máscara** hoje.
  Recomendação: decidir explicitamente na implementação se isso deve continuar (nome sozinho é
  menos sensível que placa/telefone, e ainda assim é PII) ou se deve ser removido/mascarado do
  `metadata` antes de persistir. Esta auditoria não decide isso unilateralmente — é um ponto de
  aprovação necessário.
- **Resposta bruta da API:** o mapper **nunca** guarda o payload bruto da JumpPark — todos os
  campos são extraídos e nomeados explicitamente. Diferente de `jumppark_service_orders`, que tem
  uma coluna `raw_payload_sanitized`, a proposta em Seção 5 **não inclui** uma coluna de payload
  bruto — mais simples e mais seguro, evita qualquer said risco de vazamento futuro de campo não
  revisado dentro de um jsonb genérico.
- **Nunca vai para logs:** nenhuma parte do fluxo atual (`fromJumpPark.ts`) loga dado do cliente —
  confirmado por leitura do arquivo, sem `console.log`/logger com esses campos.
- **Nunca retorna ao Zézinho sem revisão:** como nenhum consumidor está autorizado a ser migrado
  nesta sprint (Seção 10), esta pergunta é adiada — mas a recomendação geral é que qualquer
  capacidade do Zézinho que exponha dados operacionais deve reusar o mesmo padrão de máscara já
  aplicado em `zezinho/facts.ts` para os dados atuais.
- **Credenciais/tokens:** confirmado que nenhuma credencial ou token é persistido em nenhum lugar
  deste fluxo — o Bearer token da JumpPark vive apenas em variável de ambiente
  (`getJumpParkEnv()`), nunca em banco.

---

## 9. Interface do repository (proposta, não implementada)

Desenhada seguindo o mesmo padrão já usado e testado em produção por
`StonePersistenceRepository` (interface única, duas implementações — `memory` e `postgres` —
escolhidas por `getStorageMode()` via `repository-factory.ts`, mesmo padrão do
`FinanceRepository`):

```ts
// PROPOSTA — não implementado, não criado como arquivo real nesta sprint.
interface OperationalOrderRepository {
  // Upsert por (source, externalId) — nunca "select then insert".
  upsert(order: OperationalOrder): Promise<OperationalOrder>;
  upsertMany(orders: OperationalOrder[]): Promise<void>;

  findById(id: string): Promise<OperationalOrder | null>;
  findByExternalId(source: OperationalOrderSource, externalId: string): Promise<OperationalOrder | null>;

  findByPeriod(from: string, to: string): Promise<OperationalOrder[]>;
  findByCustomer(customerId: string): Promise<OperationalOrder[]>;
  findByVehicle(vehicleId: string): Promise<OperationalOrder[]>;
  findByCategory(category: OperationalServiceCategory): Promise<OperationalOrder[]>;

  countByStatus(status: OperationalOrderStatus): Promise<number>;

  // Ponto de retomada da sincronização incremental (ver Seção 11).
  getLatestSyncPoint(source: OperationalOrderSource): Promise<string | null>;
}
```

Nenhum método especulativo além dos explicitamente pedidos pelo usuário — não foram adicionados
`delete`, `findByEmployee` (apesar do índice existir, o índice foi incluído por já apoiar
`findByCustomer`/`findByVehicle` no mesmo padrão de coluna, mas o método só deve ser adicionado
quando houver consumidor real).

**Sobre implementação em memória:** recomendado manter, seguindo o mesmo padrão de
`FinanceRepository`/`StonePersistenceRepository` — o projeto já usa `getStorageMode()` para rodar
sem `DATABASE_URL` em desenvolvimento, e esse padrão deve ser preservado por consistência, não
por necessidade nova.

---

## 10. Estratégia de sincronização (proposta, não implementada)

**Reaproveitamento recomendado:** usar `jumppark_sync_logs` (já existe, já tem o schema certo,
0 escritores hoje) como o log desta nova sincronização — mesmo que `operational_orders` seja uma
tabela nova, o log de sincronização já construído serve perfeitamente ao propósito, sem exigir
nova migration para isso.

Desenho, espelhando o padrão comprovado de `StonePersistenceRepository.startImportRun()` /
`finishImportRun()`:

1. **Sincronização incremental:** ponto de retomada via `getLatestSyncPoint()` (equivalente a
   `getLatestSucceededImportRun()` do Stone) — evita reprocessar o histórico inteiro a cada
   execução.
2. **Backfill:** mesma função, chamada com um intervalo de datas amplo (histórico) — sem
   diferença estrutural em relação à sincronização incremental, apenas o parâmetro de período.
3. **Paginação:** **não confirmada** na API JumpPark (`docs/jumppark-sync-strategy.md`,
   investigação do Sprint 9) — a estratégia deve assumir ausência de paginação até confirmação
   direta com a API, e reavaliar se necessário.
4. **Execução única por período:** guard via `status = 'running'` em `jumppark_sync_logs` antes de
   iniciar uma nova execução — mesmo mecanismo do `startImportRun()` do Stone.
5. **Idempotência:** garantida pela constraint `UNIQUE(source, external_id)` (Seção 6) — a
   sincronização pode ser interrompida e reiniciada sem duplicar nada.
6. **Concorrência:** resolvida no nível do banco pela constraint única + upsert atômico.
7. **Falha parcial/retry:** mesmo padrão de status `partial`/`error` já usado em
   `jumppark_sync_logs.status` e no motor de retry do Sprint 7.1 (backoff+jitter, sem retry em
   401/403/erro de parsing) — reaproveitar a lógica de retry já existente em
   `src/lib/integrations/stone` como referência, sem duplicar reinvenção.
8. **Observabilidade:** `orders_fetched`/`orders_inserted`/`orders_updated` já existem como
   colunas em `jumppark_sync_logs` — usadas exatamente para isso.
9. **Reprocessamento manual:** mesmo mecanismo de "reprocessar" já existe como conceito em
   produção para o Stone (`reprocessar divergência`) — a UI futura pode seguir o mesmo padrão.
10. **Restrição inegociável confirmada:** esta sincronização não compartilha nenhuma tabela,
    função ou módulo com o pipeline Stone (`stone/persistence/importRun.ts`,
    `jumpparkReconciliationService.ts`) — são caminhos de código totalmente separados, então
    implementá-la não tem como alterar a integração Stone.

---

## 11. Plano de backfill (proposta, não implementada)

- Rodar a mesma função de sincronização (Seção 10) com um intervalo de datas cobrindo o
  histórico desejado, como uma execução única e registrada em `jumppark_sync_logs`.
- Deve ocorrer **depois** que a migration + repository + sincronização estiverem implementados e
  testados isoladamente (sem nenhum consumidor lendo ainda) — validação primeiro via consulta
  direta ao Neon, exatamente como esta auditoria fez para as tabelas existentes.
- Nenhum backfill deve ser executado nesta sprint (11A) — apenas planejado.

---

## 12. Plano de migração dos consumidores

**Nenhum consumidor será migrado no Sprint 11A.** Sequência recomendada para sprints futuras,
ordenada por risco crescente (menor blast radius primeiro):

1. **Central de Operações** (`/estacionamento`, `/lavacao`, `/movimentacoes`) — consumidor de
   leitura, exibição apenas, mais fácil de reverter se algo divergir do dado ao vivo atual.
2. **Indicadores/Dashboard** — leitura agregada, mesmo perfil de risco baixo.
3. **Zézinho** — leitura via capacidade nova, risco moderado (precisa revisão de máscara/privacidade
   antes de expor qualquer campo novo, conforme Seção 8).
4. **Agenda** — sem consumidor real identificado hoje; migrar apenas se/quando existir.
5. **CRM** — maior risco que os anteriores porque envolve fusão de identidade de cliente
   (`customerId`) com dados já existentes em `customers`/`vehicles` — precisa de decisão explícita
   sobre a tensão de mascaramento já identificada na Seção 1.2.
6. **Financeiro** — impacta números que já alimentam DRE/fluxo de caixa — migrar só depois que
   Central de Operações e CRM comprovarem a fonte nova é confiável.
7. **Conciliação Stone × JumpPark** — **maior risco de todos**, por ser um mecanismo já em
   produção com 815+510 linhas reais e crítico para o financeiro. Deve ser o **último** a
   migrar, e mesmo assim apenas como fonte alternativa aditiva atrás de uma comparação lado a
   lado com o caminho atual — nunca como substituição direta sem validação extensiva.
8. **RH** — não aplicável hoje; nenhum consumidor real de dado operacional toca a tabela `employees`
   formal, e a Seção 1.2 já recomenda nunca ligar `OperationalEmployee` a ela.

---

## 13. Duplicações encontradas (documentar, não corrigir nesta sprint)

### 13.1 `classifyPaymentMethod` / `classifyPaymentMethodCategory` — triplicada

| Local | Nome da função | Status |
|---|---|---|
| `src/lib/integrations/jumppark/service.ts` (linha ~15) | `classifyPaymentMethod` | pré-existente |
| `src/lib/integrations/jumppark/operations-summary.ts` (linha ~10) | `classifyPaymentMethod` | pré-existente |
| `src/lib/domain/operational/mappers/fromJumpPark.ts` (linha 35) | `classifyPaymentMethodCategory` | adicionada no Sprint 10, deliberadamente mirrorada (não importada) para não acoplar `domain/operational` a `integrations/jumppark` |

Lógica idêntica nas três (mesmas palavras-chave: dinheiro/cash, débito, crédito, pix, outro).

**Plano de eliminação recomendado (documentado, não implementado):** o projeto já tem um
precedente funcionando para exatamente este problema — `src/lib/utils/mask.ts`
(`maskPlate`/`maskPhone`) é importado tanto por `integrations/jumppark` quanto por
`domain/operational` sem violar a regra de "domínio não importa camada de integração", porque
`utils/` é uma camada neutra, abaixo de ambos. A recomendação é mover a função de classificação de
forma de pagamento para um local equivalente (ex.: `src/lib/utils/paymentMethod.ts`) e fazer os
três pontos de uso importarem dali — eliminando a triplicação sem violar nenhuma regra de
camadas já estabelecida.

### 13.2 `crm/normalize.ts` — já corretamente compartilhado (não é duplicação)

`normalizePhone`, `normalizeName`, `normalizePlate`, `identityKey`, `slugifyCustomerId` já são
importados por `domain/operational/mappers/fromJumpPark.ts` de `src/lib/crm/normalize.ts` sem
duplicação — este é exatamente o padrão que a Seção 13.1 propõe replicar para
`classifyPaymentMethod`.

### 13.3 `classifyServiceCategory` — não duplicada

Confirmado único em `src/lib/domain/operational/category.ts`, sem equivalente em
`integrations/jumppark`, `crm` ou `finance`.

### 13.4 `classifyJumpParkOrder` (`src/lib/finance/classification.ts`) — não é duplicação

É um classificador diferente (classificação financeira para DRE: receita de
estacionamento/serviços, parceria, mensalista, pós-pago), não relacionado à classificação de
forma de pagamento. Nenhuma ação necessária.

---

## 14. Riscos

1. **Convenção de casing de `source`:** o tipo de domínio usa `"JUMPPARK" | "MANUAL" | "FUTURO"`
   (maiúsculo), enquanto a convenção do projeto (`common.ts`, outras tabelas) usa `source` em
   minúsculo (`'manual'`, `'jumppark'`). Precisa ser decidido explicitamente na implementação —
   não decidido tacitamente aqui.
2. **`metadata.clientName` sem máscara** (Seção 5/8) — precisa decisão explícita antes de
   persistir.
3. **`OperationalCustomer`/`OperationalVehicle`/`OperationalEmployee` continuam sem tabela
   própria** — permanecem como IDs derivados (slug), sem persistência. Isso é consistente com o
   escopo desta sprint (que trata apenas de `OperationalOrder`), mas é uma lacuna a resolver
   depois se esses conceitos precisarem de consulta direta (hoje só existem como campos dentro
   de uma ordem).
4. **`jumppark_service_orders`/`jumppark_sync_logs` ficam como código morto duplicado em
   intenção** (Seção 4) — recomendação é documentar isso claramente no schema (comentário) para
   evitar confusão futura sobre qual tabela é a "oficial", sem apagar nenhuma nesta sprint.
5. **Paginação da API JumpPark não confirmada** — pode afetar o volume de backfill se períodos
   longos excederem algum limite não documentado da API.
6. **`employees` (RH formal) x `OperationalEmployee` (operador JumpPark)** — risco de confusão
   futura se algum desenvolvedor tentar "unificar" os dois sem entender a diferença de
   sensibilidade de dado (salário) — mitigado por manter os dois completamente desacoplados
   (nenhuma FK entre eles).

---

## 15. Rollback

- A Alternativa B é **puramente aditiva**: `CREATE TABLE operational_orders` não altera nenhuma
  tabela existente. Rollback = `DROP TABLE operational_orders` — sem efeito colateral em nenhum
  outro dado ou tabela, porque nenhum consumidor a usa ainda.
- Em sprints futuras, cada consumidor deve ser migrado com uma forma clara de reverter para a
  fonte antiga (fetch ao vivo da JumpPark) — como o fetch ao vivo continua existindo e não será
  removido nesta transição, a reversão de qualquer consumidor individual é sempre possível sem
  perda de funcionalidade.
- O caso de maior cuidado é a Conciliação Stone × JumpPark (Seção 12, item 7) — por isso ela é
  a última da fila, e a recomendação é migrá-la apenas como fonte aditiva comparável, nunca como
  substituição direta sem um período de validação lado a lado.

---

## 16. Checkpoints incrementais do Sprint 11 (proposta de sequência, aguardando aprovação)

- **Sprint 11B:** migration (`CREATE TABLE operational_orders`) + repository (memory + postgres)
  + testes unitários do repository — **sem nenhuma sincronização real ainda**, apenas a
  fundação testável.
- **Sprint 11C:** `syncJumpParkOrders()` real, rodando contra `jumppark_sync_logs` +
  `operational_orders` — validado diretamente no Neon (mesma metodologia de leitura usada nesta
  auditoria), **ainda sem nenhum consumidor lendo a tabela**.
- **Sprint 11D:** backfill histórico (Seção 11) + primeira migração de consumidor — Central de
  Operações (menor risco, Seção 12, item 1).
- **Sprint 11E em diante:** migração dos demais consumidores, um por vez, na ordem da Seção 12,
  terminando pela Conciliação Stone × JumpPark.
- Cada checkpoint deve incluir validação direta no Neon antes de avançar para o próximo, seguindo
  a mesma disciplina de leitura usada nesta auditoria (nunca assumir sucesso sem consulta real).

---

## Resumo executivo

- `operational_orders` não existe; `jumppark_service_orders`/`jumppark_sync_logs` existem, têm
  schema pronto, mas **zero uso real** (0 linhas, 0 escritores).
- Recomendação: **criar `operational_orders` nova** (Alternativa B) — puramente aditiva, sem
  risco para a conciliação Stone × JumpPark (815+510 linhas ativas, intocada) nem para o CRM
  (`customers`/`vehicles`, vazias, uso único e restrito já mapeado).
- Idempotência via `UNIQUE(source, external_id)` + upsert transacional — mesmo padrão já
  comprovado em produção pelo `StonePersistenceRepository`.
- Sem event sourcing, sem consumidor migrado, sem migration criada, sem commit — tudo aguardando
  aprovação explícita antes do Sprint 11B.

**Pare após a auditoria — aguardando aprovação para prosseguir.**
