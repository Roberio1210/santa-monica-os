# Arquitetura de banco de dados — Santa Monica OS

Fundação técnica para banco de dados real, iniciada em 10/07/2026 e **migrada para produção no
mesmo dia**: o proprietário criou e conectou um banco Neon Postgres à Vercel
(`DATABASE_URL`/`POSTGRES_*` configuradas por ele), e as migrations/seeds foram aplicadas e
confirmadas contra esse banco real. Nenhuma credencial foi solicitada nem manuseada por esta
sessão além do necessário para rodar os comandos localmente — ver
`docs/next-session-handoff.md` para o estado exato pós-migração.

## ORM escolhido: Drizzle

Avaliado contra Prisma. Motivos da escolha:

1. **Sem geração de cliente em build.** Prisma precisa rodar `prisma generate` (um passo de
   codegen que produz um cliente binário) antes de compilar; Drizzle é apenas TypeScript — o
   schema *é* o tipo. Isso simplifica a exigência mais importante desta tarefa: o projeto precisa
   compilar e publicar na Vercel **sem `DATABASE_URL`**. Com Drizzle isso é natural (basta nunca
   chamar `getDb()` fora de uma rota que precise dela); com Prisma seria preciso garantir que o
   `postinstall` de geração do client não falhe silenciosamente em ambientes sem banco.
2. **Leve em serverless.** Drizzle não usa um motor de query binário separado (o "query engine"
   do Prisma); ele monta SQL diretamente. Menor cold start, sem binário extra para empacotar na
   função da Vercel.
3. **Compatível nativamente com Neon e Vercel Postgres** via `postgres` (postgres.js) ou
   `@neondatabase/serverless`, sem adaptação.
4. **Migrations legíveis.** `drizzle-kit generate` produz SQL puro versionável
   (`drizzle/0000_initial_schema.sql`), fácil de revisar manualmente antes de aplicar.

Driver escolhido: **`postgres`** (postgres.js), que funciona tanto com Neon quanto com Vercel
Postgres via connection string padrão, em runtime Node.js (as rotas deste projeto já usam Node.js
runtime, não Edge — não há necessidade do driver HTTP/edge do Neon nesta fase).

## Estrutura de arquivos

```
src/db/
  client.ts              # getDb() — conexão preguiçosa, nunca conecta no import
  schema/
    common.ts             # colunas repetidas (id, timestamps, active, source, externalId, notes)
    auth.ts                # users
    hr.ts                   # employees, contractors, employee_documents
    crm.ts                   # customers, vehicles
    inventory.ts              # inventory_items, inventory_movements, services, service_consumption_rules
    jumppark.ts                 # jumppark_service_orders, jumppark_sync_logs
    finance.ts                   # partners, contracts, contract_value_periods, contract_benefits,
                                  # accounts_receivable, payments, invoices, financial_categories,
                                  # cost_centers, cash_movements, reconciliation_records
    system.ts                     # alerts, audit_logs
    index.ts                       # barrel
  migrate.ts               # script de linha de comando (npm run db:migrate)
  seed/
    inventory.ts            # seed idempotente dos 48 itens (npm run db:seed:inventory)
    contracts.ts              # seed dos 3 contratos reais (IESA, Funerária, Don Juan)
    chart-of-accounts.ts        # seed do plano de contas e centros de custo (npm run db:seed:chart-of-accounts)
drizzle/
  0000_initial_schema.sql   # migration inicial, gerada offline (sem conexão com banco)
  meta/                        # metadados internos do drizzle-kit
drizzle.config.ts             # config da CLI drizzle-kit (não usado pelo app em runtime)
```

## Por que o build funciona sem `DATABASE_URL`

- `src/db/client.ts` só lê `process.env.DATABASE_URL` **dentro** de `getDb()`, nunca no escopo do
  módulo. O Next.js só executa esse código quando uma rota que efetivamente chama `getDb()` é
  invocada em runtime — nunca durante `next build`.
- `drizzle.config.ts` usa uma URL placeholder quando `DATABASE_URL` não existe, porque
  `drizzle-kit generate` não abre conexão nenhuma (ele apenas faz diff entre o schema TypeScript
  atual e o histórico de migrations já geradas). Comandos que *precisam* de conexão real
  (`db:migrate`) falham com uma mensagem clara em vez de silenciosamente gerar dados incorretos.
- Nenhuma página ou componente importa `src/db/client.ts` diretamente hoje — todos passam pela
  camada de repositório (`docs/database-architecture.md`, seção seguinte), que decide sozinha se
  usa Postgres ou memória.

Build validado nesta tarefa com `DATABASE_URL` ausente (ver relatório final da execução).

## Tabelas modeladas (25)

Todas incluem `createdAt`, `updatedAt`, `active`, `source`, `externalId`, `notes` (exceto
`audit_logs`, ver nota abaixo), conforme pedido. Colunas de negócio específicas resumidas:

| Tabela | Propósito | Colunas de negócio principais |
| --- | --- | --- |
| `users` | Login e papéis de acesso | `email`, `role` (owner/manager/parking/detailing/finance/hr/read_only), `passwordHash` nullable |
| `employees` | Funcionários CLT | `fullName`, `role`, `admissionDate`, `workSchedule`, `baseSalary` nullable |
| `contractors` | Prestadores PJ | `businessName`, `taxId`, `scope`, `agreedValue` nullable, `contractStart/End` |
| `employee_documents` | Documentos de CLT/PJ | `subjectType`, `subjectId` (polimórfico, sem FK — ver nota), `documentType`, `fileRef` |
| `customers` | Clientes | `name`, `phone`, `email`, `segment`, `totalSpent` nullable |
| `vehicles` | Veículos | `customerId` FK, `plate`, `model` |
| `inventory_items` | Estoque (espelha `src/lib/inventory/types.ts`) | `category`/`unit`/`condition` (enums idênticos ao TS), `minimumStock`/`unitCost` nullable |
| `inventory_movements` | Movimentações de estoque | `type` (6 valores), `quantity`, `responsible` nullable |
| `services` | Catálogo de serviços | `name`, `category`, `defaultPrice` nullable |
| `service_consumption_rules` | Ficha técnica de consumo (não usada ainda) | `serviceId` FK, `itemId` FK, `quantityPerService` |
| `jumppark_service_orders` | Espelho local de ordens do JumpPark | `externalId` único, valores, `rawPayloadSanitized` jsonb nullable |
| `jumppark_sync_logs` | Auditoria de sincronizações | `status`, `attempt`, `errorMessage` sanitizado |
| `partners` | Parceiros/contratantes B2B | `name`, `type` |
| `contracts` | Contratos com parceiros | `type`, `status`, `billingClosingDay`, `dueDay`, `baseValue` nullable |
| `contract_value_periods` | Vigências de valor de um contrato (ex.: reajuste Don Juan) | `amount`, `effectiveFrom`/`effectiveUntil` nullable |
| `contract_benefits` | Benefícios inclusos no contrato | `description`, `quantityPerPeriod`, `cumulative` |
| `accounts_receivable` | Contas a receber (módulo Financeiro, ver `docs/finance-module.md`) | `customerId`/`partnerId`/`contractId`, `competenceDate`, `dueDate`, `expectedAmount`/`receivedAmount`/`outstandingAmount`, `status` (draft/open/partially_paid/paid/overdue/cancelled), `paymentMethod` (inclui `desconhecido`), `invoiceNumber` nullable |
| `payments` | Recebimentos efetivos | `accountsReceivableId` FK, `method` (inclui `desconhecido`), `invoiceIssued` |
| `invoices` | Notas fiscais emitidas | `accountsReceivableId` FK, `number`, `issuedAt`, `amount` nullable |
| `financial_categories` | Plano de contas (receitas/despesas) | `name`, `type` (receita/despesa) — só estrutura, sem lançamentos |
| `cost_centers` | Centros de custo | `name` — só estrutura |
| `cash_movements` | Entradas/saídas de caixa reais | `date`, `type`, `amount`, `accountsReceivableId`/`categoryId`/`costCenterId` FK nullable |
| `reconciliation_records` | Conciliação futura (Stone/banco) | `cashMovementId` FK, `externalReference`, `matchStatus` — preparada, vazia |
| `alerts` | Alertas do sistema | `severity`, `message`, `resolved` |
| `audit_logs` | Trilha de auditoria | `actorUserId`, `action`, `beforeState`/`afterState` jsonb |

### Nota — `employee_documents.subjectId`

É polimórfico (`subjectType`: `employee` ou `contractor`), então não tem uma foreign key de banco
apontando para uma única tabela — a integridade é garantida na camada de aplicação. Isso é uma
limitação conhecida e documentada, não um esquecimento.

### Nota — `audit_logs` sem `updatedAt`/`active`

Registros de auditoria são imutáveis por design: nunca são editados ou desativados, apenas
criados. Adicionar `updatedAt`/`active` sugeriria uma mutabilidade que não deveria existir.

## Migrações

- `drizzle/0000_initial_schema.sql` — gerada localmente com `npx drizzle-kit generate` (sem
  conexão com banco). Cria as 25 tabelas, seus enums e foreign keys.
- `drizzle/0001_last_tomorrow_man.sql` — gerada e aplicada em 10/07/2026, na migração real para
  Neon Postgres. Adiciona `UNIQUE` em `contract_benefits.external_id` e
  `contract_value_periods.external_id`, que faltavam desde a criação dessas tabelas — o gap só
  se manifestou ao rodar o seed contra um banco real (o fallback em memória nunca validou a
  constraint). Ver `docs/next-session-handoff.md`, seção "O que foi corrigido nesta execução".

**Ambas já foram aplicadas ao banco Neon de produção** (conectado à Vercel). `npm run db:migrate`
continua seguro de rodar de novo — o Drizzle não reaplica migrations já concluídas.

## Seeds disponíveis

- `npm run db:seed:inventory` — os 48 itens da contagem física (`src/db/seed/inventory.ts`).
- `npm run db:seed:contracts` — os 2 serviços de referência (Lavação parceria IESA, Lavação
  funerária), os 3 parceiros reais e seus contratos (com vigências de valor, no caso do Don
  Juan), e o único evento financeiro confirmado (recebimento IESA de R$ 900,00 em 10/07/2026) —
  `src/db/seed/contracts.ts`.
- `npm run db:seed:chart-of-accounts` — plano de contas (10 categorias de receita, 15 de
  despesa) e 6 centros de custo, **e o movimento de caixa da IESA** (R$ 900,00 em 10/07/2026,
  vinculado à conta a receber e às categorias/centro de custo acima) —
  `src/db/seed/chart-of-accounts.ts`. **Deve rodar por último**, depois de `contracts.ts`: o
  movimento de caixa depende da conta a receber já existir, e das categorias/centro de custo
  criadas neste mesmo script. Se rodado antes de `contracts.ts`, avisa e pula o movimento de
  caixa em vez de inventar o vínculo.

Todos são idempotentes via colunas `external_id` únicas (ver constraints
`*_external_id_unique` em `drizzle/0000_initial_schema.sql` e `drizzle/0001_last_tomorrow_man.sql`)
e usam `ON CONFLICT DO NOTHING`: rodar o mesmo comando várias vezes nunca duplica dados. **Todos
os três já foram aplicados e confirmados** contra o Neon de produção em 10/07/2026 — ver
`docs/next-session-handoff.md` para as contagens exatas de registros.

## Próximo passo

Ver `docs/database-and-auth-setup-guide.md` para o roteiro de ativação (criar o banco, configurar
`DATABASE_URL` na Vercel, rodar `npm run db:migrate`, aplicar os seeds).
