# Fundação Técnica para os Próximos Módulos

**Escopo:** preparação estrutural do Santa Monica OS para Estoque (evolução), Compras,
Patrimônio, RH, CRM, Marketing, Agenda e Inteligência Artificial — **sem implementar nenhum
desses módulos**. Nenhuma tela, nenhum componente visual, nenhuma regra de negócio destes
módulos foi criada nesta sessão. Este documento complementa
[docs/business-core-architecture-rfc.md](business-core-architecture-rfc.md) (RFC-001), que
continua sendo a referência de domínios/agregados/roadmap — aqui o foco é o modelo de dados e os
ajustes estruturais concretos feitos para reduzir o custo de implementar cada módulo depois.

---

## 1. Diagrama de entidades — estado atual (real, verificado nesta sessão)

```
FINANCIAL (src/db/schema/finance.ts)
  partners, contracts, contractValuePeriods, contractBenefits
  accountsReceivable, accountsPayable, payments, invoices
  financialCategories, costCenters, financialAccounts
  cashMovements, accountTransfers, reconciliationRecords (órfã, ver RFC-001 §1.2)
  suppliers, recurringBillTemplates

ACCOUNTING (src/db/schema/accounting.ts) — classificação/DRE, sub-domínio de Financial
  financialClassifications, classificationRules, allocationRules,
  allocationRuleShares, accountingPeriods

STONE (src/db/schema/stone.ts) — Collector financeiro, sub-domínio de Financial
  stoneImportRuns, stoneNormalizedTransactions,
  stoneReconciliationResults, stoneDivergences

JUMPPARK (src/db/schema/jumppark.ts) — Collector operacional
  jumpParkServiceOrders, jumpParkSyncLogs   (ambas 0 linhas, 0 escritores — ver docs/operational-order-persistence-audit.md)

INVENTORY (src/db/schema/inventory.ts) — Estoque, já maduro
  inventoryItems, inventoryMovements, services, serviceConsumptionRules,
  recipeCalibrationSamples, processStepProductSuggestions,
  jumpparkServiceMappings, vehicleCategoryAssignments,
  inventoryConsumptionConfirmations, inventoryConsumptionLines

CRM (src/db/schema/crm.ts) — schema existe, 0 linhas, não sincronizado
  customers, vehicles

HR (src/db/schema/hr.ts) — schema existe, 0 linhas, 0 código
  employees, contractors, employeeDocuments

GOALS (src/db/schema/goals.ts)
  goals, goalBonusTiers

ANALYTICS / IA (src/db/schema/organizationalMemory.ts)
  directorDailySnapshots, strategicMemoryItems, directorLearnings, organizationalBeliefs

SYSTEM (src/db/schema/system.ts)
  alerts, auditLogs

AUTH (src/db/schema/auth.ts)
  users

OPERATIONAL (domínio, Sprint 10) — sem tabela ainda
  OperationalOrder, OperationalCustomer, OperationalVehicle,
  OperationalEmployee, OperationalServiceCategory
  (persistência desenhada em docs/operational-order-persistence-audit.md, Sprint 11B — não criada)
```

**Nenhuma tabela nova foi criada nesta sessão.** Isso é deliberado: o próprio histórico do
projeto mostra o custo de criar tabelas "para uso futuro" antes da hora —
`jumppark_service_orders`/`jumppark_sync_logs` (Collector) e `customers`/`vehicles`/`employees`
(CRM/HR) foram construídas com antecedência e hoje são schema morto (0 linhas, 0 escritores),
exigindo uma auditoria inteira (Sprint 11A) só para decidir o que fazer com elas. A fundação
desta sessão evita repetir esse padrão: prepara estrutura e nomenclatura, não tabelas vazias.

---

## 2. Diagrama de entidades — futuras por módulo (proposta, não criada)

> Convenção: `pgTable` já existente vs Ø `pgTable` a criar quando o módulo for de fato
> implementado, seguindo `src/db/schema/common.ts` (`id()`, `timestamps`, `active()`, `source()`,
> `externalId()`, `notes()`).

### Estoque (evolução do existente)
Já maduro. Nenhuma entidade nova identificada como faltante — eventual `Supplier` já é
compartilhado com Financial (`finance.suppliers`), correto manter assim.

### Compras (Procurement — hoje só `/compras` mock + `inventory/purchase-suggestions.ts`)
- Ø `purchaseOrders` — o pedido de compra em si (fornecedor, itens, status: rascunho/enviado/
  recebido/cancelado), **hoje inexistente**. `purchase-suggestions.ts` só *sugere* o que comprar,
  nunca registra o que foi de fato pedido.
- Ø `purchaseOrderLines` — item, quantidade, preço unitário, vínculo com `inventory_items`.
- **Fronteira a respeitar:** `accounts_payable` (Financial) é a obrigação financeira depois que a
  compra vira nota/boleto — não é o pedido físico. Não modelar `PurchaseOrder` dentro de
  `accounts_payable`; a relação é `PurchaseOrder` → (quando faturado) → `AccountsPayable`.

### Patrimônio (Fixed Assets — hoje zero schema)
- Ø `assets` — bem durável da empresa (máquina de polimento, câmera, veículo próprio, móvel):
  categoria, valor de aquisição, data de aquisição, método de depreciação, valor atual,
  localização, status (ativo/manutenção/baixado).
- Ø `assetMaintenanceRecords` — histórico de manutenção.
- **Fronteira a respeitar (achado desta auditoria):** `inventory_items` é para consumíveis
  (produto usado e reposto). `assets` é para bens duráveis com depreciação. São ciclos de vida
  fundamentalmente diferentes — **nunca estender `inventory_items` para also cover Patrimônio**,
  mesmo que pareça conveniente reaproveitar o schema de estoque no começo.

### RH (schema `employees`/`contractors`/`employeeDocuments` já existe, 0 uso)
- Ø folha de pagamento (`payrollEntries` ou similar) — ainda não modelada.
- **Fronteira a respeitar (já era um achado do RFC-001, reafirmado aqui):**
  `OperationalEmployee` (operador informal da JumpPark, `employeeId` = slug de nome) nunca deve
  ser ligado automaticamente a `hr.employees` (dado sensível, salário) por correspondência de
  nome. Uma eventual ponte deve ser uma tabela de curadoria manual explícita
  (Ø `operatorEmployeeMappings`), no mesmo padrão já usado com sucesso em
  `jumppark_service_mappings`.
- **Fronteira nova identificada nesta sessão:** `finance.contractBenefits` (ex.: "funerária tem 6
  lavações grátis/mês") é benefício de **contrato de parceria B2B**, não benefício de
  **funcionário**. Um futuro `employee_benefits` (vale-refeição, plano de saúde) não deve
  reaproveitar nem ser confundido com `contract_benefits` — são conceitos homônimos por
  coincidência de nome em português, não pelo modelo de dados.

### CRM (schema `customers`/`vehicles` já existe, 0 uso — já mapeado no RFC-001)
- Ø `opportunities`, `interactions`, `tags` — já previstos no backlog (#70), sem mudança nesta
  sessão.
- Recomendação já registrada no RFC-001: `customers`/`vehicles` devem ser populados a partir de
  `OperationalOrder` (Sprint 13), nunca por sincronização própria com a JumpPark.

### Marketing (hoje só `/marketing` mock)
- Ø `campaigns`, Ø `contentCalendarItems`.
- **Fronteira a respeitar:** Marketing não deve criar seu próprio conceito de "lead" — deve ler
  `Opportunity` do CRM. Duplicar o conceito de lead/oportunidade entre CRM e Marketing é o tipo
  exato de acoplamento que esta fundação quer evitar.

### Agenda / Scheduling (hoje só `/agenda` mock)
- Ø `appointments` — já desenhado conceitualmente no RFC-001 §5 (estágio anterior ao
  `OperationalOrder`, relação 1:0..1).

### Inteligência Artificial
- Schema já existe e está correto (`organizationalMemory.ts`) — é o único módulo futuro sem
  lacuna de dado. O problema aqui nunca foi dado ausente, foi **organização de código** — ver
  Seção 4.

---

## 3. Dependências entre módulos (grafo)

Sem mudança na direção geral definida no RFC-001 §6. Adição desta sessão — onde os módulos
novos se encaixam:

```
Collectors (JumpPark, Stone, ...)
        │
        ▼
   OPERATIONAL (núcleo, ainda não persistido)
   │      │        │           │            │
   ▼      ▼        ▼           ▼            ▼
FINANCIAL CRM   INVENTORY  SCHEDULING     (futuro: nenhum módulo novo lê Collector direto)
   │      │        │           │
   │      ▼        │           │
   │   MARKETING ◄─┘           │
   │  (lê CRM,                 │
   │   nunca duplica           │
   │   "lead")                 │
   ▼                           │
COMPRAS ──► FINANCIAL          │
(PurchaseOrder vira            │
 AccountsPayable ao faturar)   │
                                │
PATRIMÔNIO (isolado — só Financial lê, para depreciação contábil futura;
             nunca compartilha tabela com Inventory)

RH ──(ponte curada, nunca automática)──► Operational.employeeId
RH ──► Financial (folha como despesa)

ANALYTICS (Diretoria) ◄── lê Operational/Financial/CRM/Inventory/RH
        │
        ▼
ARTIFICIAL INTELLIGENCE (Zézinho)
```

**Achado que corrige o RFC-001:** a RFC descreveu a extração da Diretoria de `zezinho/directors/`
para um módulo `analytics/` de primeira classe como reorganização de **baixo risco**. A
verificação de código feita nesta sessão mostra que isso está incompleto — `directors/` depende
pesadamente de `zezinho/reasoning/`, `zezinho/planner/`, `zezinho/intent/`, `zezinho/memory/` e
`zezinho/objective/` (a "camada de raciocínio" compartilhada, criada deliberadamente para ser
reusada tanto pelo narrador do Zézinho quanto pela Diretoria — ver histórico de refatoração de
`EvidencedClaim`/`deriveRisksAndOpportunities` para `reasoning/` compartilhado). Mover só
`directors/` para fora de `zezinho/` faria `analytics/` depender de `zezinho/` internamente —
o inverso do que a RFC pretendia, e não resolveria o acoplamento, só o disfarçaria.

Extrair a Diretoria de verdade exigiria mover também `reasoning/`, partes de `planner/`,
`intent/`, `memory/` e `objective/` — um trabalho real de camada, não uma reorganização de
pastas. **Não foi executado nesta sessão** por ultrapassar o escopo de "fundação, sem grande
refatoração". Fica documentado como item de escopo maior para uma sprint dedicada, não como
"baixo risco" — correção do RFC-001.

Em compensação, foi confirmado nesta sessão que `runDiretoria` **não tem nenhum chamador em
produção hoje** (grep confirmou zero uso fora dos próprios testes e de um script de seed) — ou
seja, o sistema já roda sem depender dela, o que reduz a urgência dessa extração.

---

## 4. Ajustes realizados nesta sessão

1. **`src/lib/orders/` renomeado para `src/lib/jumppark-orders/`.** O nome antigo colidia
   semanticamente com o futuro agregado `OperationalOrder` (Business Core). Rename mecânico puro
   — 16 arquivos movidos, 10 arquivos externos com import atualizado (`src/app/estoque/ordens/*`,
   `src/app/estoque/consumos/page.tsx`, `src/components/inventory/*`,
   `src/lib/zezinho/service.ts`, `src/lib/operations/central.ts`,
   `src/lib/integrations/jumppark/wash-grouping.ts`). Nenhuma linha de lógica alterada.

2. **`classifyPaymentMethod` consolidada.** Estava triplicada: duas cópias privadas idênticas em
   `integrations/jumppark/service.ts` e `integrations/jumppark/operations-summary.ts`, mais uma
   terceira mirrorada (deliberadamente, por regra de camada) em
   `domain/operational/mappers/fromJumpPark.ts`. Extraída para `src/lib/utils/paymentMethod.ts`
   — mesmo padrão já comprovado por `utils/mask.ts` (camada neutra, importável tanto pela
   integração quanto pelo domínio sem violar a regra de acoplamento). Os três pontos de uso agora
   importam a mesma função; nenhum comportamento mudou (testado).

3. **Quatro diretórios vazios removidos do filesystem**: `src/lib/agents/`, `src/lib/services/`,
   `src/lib/security/`, `src/lib/repositories/`. Confirmados vazios e nunca rastreados pelo git
   (portanto sem efeito no histórico) — provável scaffolding esquecido de sprints antigas. Não
   removidos "no escuro": a decisão foi remover, não reaproveitar, porque nenhum dos quatro nomes
   corresponde a um módulo futuro desta lista com necessidade concreta hoje (Auth/Access Control
   já vive em `src/lib/auth/`; Collectors já vivem em `src/lib/integrations/`).

4. **Achado corrigido sobre a Diretoria Inteligente** (Seção 3 acima) — sem mudança de código,
   mas corrige uma avaliação de risco do RFC-001 com evidência real de código.

**Nenhuma migration foi criada. Nenhuma tabela nova foi criada. Nenhum dado foi alterado no
banco.**

---

## 5. Arquivos alterados

```
Renomeados (16, git mv, conteúdo idêntico):
  src/lib/orders/*.ts → src/lib/jumppark-orders/*.ts

Imports atualizados (10):
  src/app/estoque/consumos/page.tsx
  src/app/estoque/ordens/[externalId]/page.tsx
  src/app/estoque/ordens/actions.ts
  src/app/estoque/ordens/page.tsx
  src/components/inventory/consumptions-view.tsx
  src/components/inventory/order-detail-view.tsx
  src/components/inventory/orders-view.tsx
  src/lib/integrations/jumppark/wash-grouping.ts
  src/lib/operations/central.ts
  src/lib/zezinho/service.ts

Novos:
  src/lib/utils/paymentMethod.ts
  src/lib/utils/paymentMethod.test.ts
  docs/technical-foundation-for-future-modules.md (este arquivo)

Modificados (consolidação de classifyPaymentMethod):
  src/lib/integrations/jumppark/service.ts
  src/lib/integrations/jumppark/operations-summary.ts
  src/lib/domain/operational/mappers/fromJumpPark.ts

Removidos do filesystem (nunca rastreados pelo git, sem diff):
  src/lib/agents/ src/lib/services/ src/lib/security/ src/lib/repositories/
```

---

## 6. Testes executados

- `npx tsc --noEmit -p .` — limpo, 0 erros.
- `npx eslint` nos arquivos alterados — limpo, 0 avisos/erros.
- `npx vitest run` — **103 arquivos de teste, 1131 testes, todos passando** (2 novos, para
  `classifyPaymentMethod`; nenhum teste existente quebrou com o rename ou a consolidação).
- `npm run build` — build de produção concluído com sucesso, todas as rotas presentes
  (incluindo `/estoque/ordens`, `/estoque/consumos`, confirmando que o rename não quebrou
  nenhuma página).

---

## 7. Não-decisões (deliberadamente fora do escopo desta sessão)

- Nenhuma tabela nova para Compras/Patrimônio/Marketing/Agenda foi criada — apenas planejada
  (Seção 2), para não repetir o padrão de schema morto já observado no projeto.
- Extração completa da Diretoria (`reasoning/`, `planner/`, `intent/`, `memory/`, `objective/`)
  não foi feita — é maior do que "fundação" e precisa de uma sprint própria.
- `crm/service.ts` e `jumppark-orders/eligible-orders.ts` continuam importando
  `integrations/jumppark` diretamente — correção depende de `OperationalOrder` estar persistido e
  sincronizado (Sprint 11B/11C), fora do escopo desta sessão.

---

## 8. Recomendação

A fundação está pronta para os módulos futuros começarem sem exigir uma refatoração grande
depois: nomenclatura sem colisão (`jumppark-orders` vs. `OperationalOrder`), duplicação de
classificador eliminada, limites de dado documentados antes de qualquer schema ser escrito
(Patrimônio ≠ Estoque, benefício de contrato ≠ benefício de funcionário, Compras precisa de
`PurchaseOrder` próprio). O próximo módulo a implementar (conforme indicado pelo usuário,
Estoque) pode prosseguir sem bloqueios desta fundação.
