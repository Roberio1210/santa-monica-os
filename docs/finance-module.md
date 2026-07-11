# Módulo Financeiro — Contas a Receber e contratos reais

Primeira versão real do módulo Financeiro, implementada em 10/07/2026, priorizando Contas a
Receber e os 3 contratos reais confirmados pelo proprietário (IESA/Nissan, Funerária, Don Juan
Fast Burger). Segue exatamente o mesmo padrão arquitetural do módulo de Estoque
(`docs/inventory-module.md`): repositório desacoplado, fallback em memória, nada inventado.

## Por que Contas a Receber primeiro

O proprietário já tinha 3 relações comerciais reais em andamento, cada uma com uma regra
diferente (pós-pago por volume, mensalidade fixa com benefício, mensalidade com reajuste
programado) e um evento financeiro real já ocorrido (o recebimento de R$ 900,00 da IESA). Isso
tornou Contas a Receber o módulo com maior retorno imediato: dado real disponível, regras claras,
e a oportunidade de estabelecer o padrão "nunca inventar" antes de qualquer tela de despesas
(Contas a Pagar, ainda não iniciada).

## Modelo de dados

Ver `docs/database-architecture.md` para a lista completa das 25 tabelas. As novas/ampliadas
nesta execução:

- **`accounts_receivable`** (renomeada de `receivables`, campos ampliados): `customerId`/
  `partnerId`/`contractId`, `description`, `competenceDate`, `issueDate`, `dueDate`,
  `expectedAmount`, `receivedAmount`, `outstandingAmount`, `status` (`draft`/`open`/
  `partially_paid`/`paid`/`overdue`/`cancelled`), `paymentMethod`, `invoiceNumber`,
  `invoiceIssued`, `receivedAt`.
- **`contract_value_periods`** (nova): vigências de valor de um contrato ao longo do tempo — o
  que torna o reajuste do Don Juan (R$ 550,00 → R$ 800,00) representável sem sobrescrever
  histórico.
- **`financial_categories`** (nova): plano de contas (receitas/despesas), só estrutura.
- **`cost_centers`** (nova): centros de custo, só estrutura.
- **`cash_movements`** (nova): dinheiro que efetivamente entrou/saiu numa data — a peça que
  faltava para nunca confundir faturamento operacional com caixa.
- **`reconciliation_records`** (nova): preparada para conciliação futura (Stone/banco), vazia.

`payments`/`invoices` passaram a referenciar `accounts_receivable_id` em vez de `receivable_id`.

## Camada de domínio (`src/lib/finance/`)

Mesmo padrão do estoque:

- `types.ts` — espelha o schema do banco.
- `status.ts` — funções puras: `computeOutstanding`, `computeAccountsReceivableStatus`,
  `resolveContractValue`. Testadas em `status.test.ts`.
- `benefits.ts` — `remainingBenefitUsage`, para benefícios não cumulativos (ex.: as 6 lavações da
  funerária). Testada em `benefits.test.ts`.
- `classification.ts` — classificação de ordens JumpPark (ver
  `docs/financial-classification-rules.md`).
- `repository.ts` / `static-repository.ts` / `postgres-repository.ts` / `repository-factory.ts`
  — igual ao padrão de `src/lib/inventory/`: escolha automática Postgres/memória via
  `getStorageMode()` (`src/lib/storage/mode.ts`, reutilizado — não duplicado).
- `data/` — `accounts-receivable.ts`, `contracts.ts`, `cash-movements.ts`: espelham exatamente o
  que os scripts de seed (`src/db/seed/contracts.ts`) gravariam num banco real, para a tela
  funcionar hoje sem `DATABASE_URL`.
- `service.ts` — `fetchAccountsReceivableOverview`, `fetchCashMovements`, `fetchContracts`.

## As 3 regras reais implementadas

### 1. Grupo IESA/Nissan — parceria pós-paga

- Serviço padrão "Lavação parceria IESA" cadastrado com valor de referência R$ 70,00 (pode haver
  adicionais — não travamos o valor da conta a receber nesse número, ele é só o preço de
  referência do serviço).
- Contrato: fechamento dia 1º, vencimento dia 10, sem valor fixo (`baseValue: null`, porque varia
  por volume).
- **Único evento financeiro confirmado**: recebimento de R$ 900,00 em 10/07/2026,
  **competência junho/2026**. Isso é o coração da regra "não confundir faturamento com caixa":
  - `accounts_receivable.competenceDate = "2026-06-01"` (a que período o valor se refere).
  - `accounts_receivable.receivedAt = "2026-07-10"` (quando o dinheiro efetivamente entrou).
  - `cash_movements` tem uma linha em `date = "2026-07-10"`, apontando de volta para essa conta.
  - Esse valor **nunca** aparece como "faturamento operacional do dia 10/07/2026" em nenhuma
    tela — só como entrada de caixa e como baixa de conta a receber.
- Nota fiscal emitida = sim, mas **número não informado** (`invoiceNumber: null`).
- Forma de pagamento: **não informada** → `paymentMethod: "desconhecido"`, nunca um valor
  adivinhado.

### 2. Funerária — contrato mensal fixo

- R$ 1.000,00/mês, vencimento dia 10.
- Dois veículos no pátio, direito a 6 lavações mensais **não cumulativas** — modelado em
  `contract_benefits` (`quantityPerPeriod: 6`, `cumulative: false`). O que "não cumulativa"
  significa na prática está em `remainingBenefitUsage()`: o contador de uso reinicia a cada novo
  período, nunca soma com o mês anterior.
- Serviço "Lavação funerária" cadastrado com preço de referência **R$ 0,00**, porque já está
  incluso no contrato — não é cobrado à parte.
- Nenhuma conta a receber foi criada para a funerária nesta execução, porque nenhum recebimento
  específico foi confirmado pelo proprietário — só a regra estrutural (contrato + benefício).

### 3. Don Juan Fast Burger (Jean) — mensalista do truck, com reajuste programado

- Vencimento dia 15.
- **Duas vigências de valor**, em `contract_value_periods`: R$ 550,00 (até 15/07/2026) e
  R$ 800,00 (a partir de 15/08/2026). `resolveContractValue()` retorna o valor vigente numa data;
  para o período entre 16/07/2026 e 14/08/2026 (não coberto por nenhuma informação do
  proprietário), a função retorna `null` em vez de adivinhar qual dos dois valores vale.
- **Nenhum pagamento automático é gerado.** Só a regra de vigência foi implementada, exatamente
  como pedido.

## Telas

### `/financeiro/contas-a-receber`

Funciona hoje sem banco (repositório em memória). Resumo (total em aberto, recebido no mês,
vencido, próximos vencimentos, quantidade de contas), filtros (status, cliente/parceiro, período
de vencimento, somente vencidos, somente pagos, busca livre) e tabela com as 11 colunas pedidas.
Linhas vencidas são destacadas visualmente. Forma de pagamento desconhecida sempre aparece como
"Não informado", nunca um valor inventado.

### `/financeiro`

Reescrita para nunca somar faturamento operacional (JumpPark) com entrada de caixa — as duas
aparecem lado a lado, com uma nota explícita na tela sobre por que não são somadas
automaticamente. Mostra também contratos recorrentes (com o valor vigente hoje, calculado via
`resolveContractValue`), recebimentos recentes e a origem de cada número. Gráficos históricos
antigos (`mock/finance.ts`) foram mantidos — ainda não há série histórica real — mas isolados numa
seção "Histórico e formas de pagamento" com `DemoDataBadge` próprio.

## Segurança

- Nenhum formulário grava dados financeiros reais. `recordPayment` existe na camada de
  repositório (arquitetura completa, testado), mas **nenhuma página ou API o chama** — só será
  ligado à UI depois que houver banco real e autenticação completa (Fase 1 do roadmap).
- Nenhuma nova rota de API foi criada. `/api/health` continua a única rota pública.
- Nenhum log com dado pessoal, token ou credencial.

## Testes

`npm run test` (Vitest, novo nesta execução). 23 testes, cobrindo:

- Cálculo de saldo (`computeOutstanding`) e não-negatividade.
- Pagamento parcial e pagamento total via `StaticFinanceRepository.recordPayment`.
- Conta paga e conta vencida (`computeAccountsReceivableStatus`).
- Vigência do contrato Don Juan, incluindo a lacuna não coberta.
- Renovação mensal da Funerária (benefício não cumulativo).
- Separação entre faturamento e caixa (competência x data de recebimento).
- Recebimento IESA de R$ 900,00 sem duplicidade (uma única conta a receber, um único movimento
  de caixa, soma diária correta).

## Limitações conhecidas

1. **Atualização de 10/07/2026: o banco Neon já está conectado e migrado** — `/financeiro` e
   `/financeiro/contas-a-receber` agora leem do Postgres real (`PostgresFinanceRepository`), não
   mais do fallback em memória. `recordPayment` foi testado diretamente contra o Neon e persiste
   corretamente, mas continua **sem nenhuma UI que o chame** — decisão de segurança deliberada,
   mantida até haver autenticação completa (ver `docs/next-session-handoff.md`).
2. Contas a Pagar não existe ainda — só o plano de contas de despesas (estrutura).
3. Gráficos de `/financeiro` (série histórica, formas de pagamento) continuam demonstrativos —
   não há fonte real de série histórica de receita ainda.
4. A classificação de ordens JumpPark (`classification.ts`) não está conectada a nenhuma
   sincronização real — é só a função e a documentação, prontas para quando
   `docs/jumppark-sync-strategy.md` for implementado.

## Próximo passo

Ver `docs/product-backlog.md` (Fase 2) e `docs/next-session-handoff.md` para a lista priorizada
do que vem depois — resumidamente: banco real primeiro (Fase 1), depois habilitar `recordPayment`
na UI, depois Contas a Pagar.
