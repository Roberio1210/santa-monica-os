# Handoff para a próxima sessão — Santa Monica OS

Escrito em 10/07/2026. Última execução: **módulo Contas a Pagar completo** (CRUD real, protegido
pelo gate de acesso atual), fechando a fundação financeira sobre o Neon Postgres já conectado.
**Estoque e Financeiro (Contas a Receber e Contas a Pagar) gravam e leem dados reais do
Postgres**, não mais de memória.

## Contas a Pagar (novo nesta execução)

- Schema incremental: `suppliers`, `financial_accounts`, `account_transfers`,
  `recurring_bill_templates`, `accounts_payable` (+ `cash_movements.financial_account_id`,
  `cash_movements.payment_id`, `payments.accounts_payable_id`) — migrations `0002` e `0003`,
  aplicadas e confirmadas no Neon. **30 tabelas no total.**
- Fundação semeada e confirmada: 11 fornecedores, 3 contas financeiras (Stone, Ailos/CredCrea,
  Caixa físico com fundo fixo R$ 100,00), 10 modelos de recorrência (8 fixos + água/energia
  variáveis, 2 com credor pendente). **Zero `accounts_payable` fabricadas** — a lista começa
  vazia, populada só pelo proprietário via UI.
- Tela `/financeiro/contas-a-pagar` (lista + filtros + resumo), `/novo`, `/[id]` (detalhe,
  pagamento total/parcial, estorno, cancelar, excluir condicional), `/[id]/editar` — todas
  protegidas apenas pelo gate de acesso atual (Basic Auth); aprovação por papel será aplicada
  quando o sistema de usuários existir (mensagem já visível na própria tela de detalhe).
- 36 novos testes (59 no total) cobrindo criação, edição, parcelamento, pagamento parcial/total,
  estorno, bloqueio de pagamento acima do saldo, cancelamento, exclusão condicional,
  transferências sem impacto em receita/despesa, reembolso a sócio sem duplicar a despesa, e
  recorrência sem duplicidade (`generateAccountsPayableFromTemplate`, idempotente).
- Teste funcional completo contra o Neon (create → edit → pagamento parcial → restart → pagamento
  total → estorno → exclusão) confirmado em processos Node isolados, sem resíduo.

## Estado exato do projeto

- Repositório: `santa-monica-os` (GitHub: `Roberio1210/santa-monica-os`), branch `main`.
- Publicado na Vercel com deploy automático a cada push em `main`.
- **Banco de dados: Neon Postgres, conectado e migrado.** `DATABASE_URL`/`POSTGRES_*` já
  configuradas na Vercel pelo proprietário.
- **30 tabelas criadas** (migrations `0000` a `0003`, todas aplicadas).
- Seeds aplicados e confirmados por consulta direta ao banco: 48 itens de estoque, 3 partners, 3
  contracts, 1 accounts_receivable (IESA, `paid`, R$ 900,00), 1 cash_movement, 29
  financial_categories, 7 cost_centers, 11 suppliers, 3 financial_accounts, 10
  recurring_bill_templates, 0 accounts_payable (aguardando cadastro real pelo proprietário).
- Build, lint, typecheck e os 59 testes automatizados passam limpos **com e sem `DATABASE_URL`**
  (testes usam fixtures isoladas via `StaticFinanceRepository`, nunca tocam o banco real).
- Teste funcional de persistência executado e confirmado para Estoque e Contas a Pagar: create →
  edit → "restart" (processo Node novo, conexão nova) → pagamento/exclusão → novo "restart" →
  confirmação — tudo via Neon real. Nenhum dado de teste ficou residual.

## O que funciona (real, em produção)

- Integração JumpPark (somente leitura) — `src/lib/integrations/jumppark/`.
- `/dashboard` — receita hoje/mês reais (JumpPark); demais cards ainda demonstrativos.
- `/operacoes` — "Movimentações de Hoje", 100% real, ordens finalizadas do dia.
- **`/estoque`** — agora lê/grava do Postgres real (`PostgresInventoryRepository`, selecionado
  automaticamente por `getStorageMode()` porque `DATABASE_URL` existe). 48 itens confirmados no
  banco. Badge da página mostra "Banco de dados" / "Persistente (banco)".
- **`/financeiro/contas-a-receber`** e **`/financeiro`** — idem, agora via
  `PostgresFinanceRepository`. A conta da IESA (R$ 900,00) e o movimento de caixa correspondente
  vêm do banco real.
- `/configuracoes/status` — confirma "Banco de dados: Configurado" e "Estoque: Persistente
  (banco)".
- `/api/health` — sempre público, mesmo com o gate de acesso ativado.

## O que ainda NÃO persiste / não está ligado

- **Nenhuma tela grava dados ainda.** `recordPayment`/`recordMovement` existem nos repositórios
  Postgres (testados nesta execução via script direto, arquitetura confirmada funcionando), mas
  **nenhuma UI os chama** — decisão deliberada, mantida: só serão ligados depois que a
  autenticação completa existir (ver `docs/privacy-and-access-control.md`, Parte 8 do módulo
  Financeiro). O gate temporário (`APP_ACCESS_*`) continua **desativado** — ainda não foi ligado
  pelo proprietário.
- **Módulos Lavação, Estacionamento, Agenda, Clientes, Marketing, Compras, Segurança, Zézinho**
  continuam 100% demonstrativos (`src/data/mock/*`) — não fazem parte desta migração.
- **Contas a Pagar não existe** — só o plano de contas de despesas (estrutura, sem lançamentos).
- **`users`/`employees`/`contractors`/`customers`/`vehicles`/`jumppark_service_orders`/
  `jumppark_sync_logs`/`alerts`/`audit_logs`/`service_consumption_rules`/`inventory_movements`/
  `reconciliation_records`** — tabelas criadas e vazias (0 registros), aguardando os módulos
  correspondentes (RH, CRM, sincronização JumpPark, etc.) serem implementados.

## O que foi corrigido nesta execução (bugs reais, encontrados só ao migrar de verdade)

1. **`contract_benefits.external_id` e `contract_value_periods.external_id` não tinham
   `UNIQUE`** no schema, embora o seed (`src/db/seed/contracts.ts`) já usasse
   `onConflictDoNothing({ target: ...externalId })` para essas duas tabelas desde a execução
   anterior. Isso só quebrou ao rodar contra um Postgres real (o fallback em memória nunca
   validou a constraint, porque não existe constraint em memória) — o seed de contratos falhou
   com "there is no unique or exclusion constraint matching the ON CONFLICT specification".
   Corrigido adicionando `.unique()` aos dois campos (`src/db/schema/finance.ts`), consistente
   com o padrão já usado nas outras 8 tabelas idempotentes. Gerou a migration `0001`.
2. **`cash_movements` nunca era populada por nenhum seed**, apesar de
   `src/lib/finance/data/cash-movements.ts` (o fallback em memória) e `docs/finance-module.md`
   descreverem esse registro como parte da regra real da IESA. Ao migrar para Postgres, essa
   tabela ficaria vazia e `/financeiro` perderia a seção "Entradas de caixa"/"Recebimentos
   recentes" silenciosamente. Corrigido adicionando o insert correspondente ao final de
   `src/db/seed/chart-of-accounts.ts` (roda por último, depois que `contracts.ts` já criou a
   conta a receber e as categorias/centros de custo já existem) — idempotente, com aviso claro
   se rodado fora de ordem.
3. **`/estoque` e `/financeiro/contas-a-receber` não tinham `export const dynamic =
   "force-dynamic"`**, ao contrário de `/dashboard`, `/operacoes` e `/financeiro`. Isso não
   importava enquanto a fonte de dados era um array estático em memória (build-time = runtime,
   sempre), mas agora que a fonte é um banco real e mutável, o Next.js as pré-renderizava como
   HTML estático no build, congelando os dados. Corrigido em ambas as páginas.

Nenhuma regra de negócio, fluxo financeiro ou funcionalidade foi alterada — os três itens acima
são correções de bugs de infraestrutura que só se manifestam com um banco real conectado.

## Comandos para retomar

```bash
cd /Users/roberiofilho/projetos/santa-monica-os
npm install
vercel env pull .env.local           # se .env.local não existir mais localmente
npm run lint && npx tsc --noEmit && npm run build && npm run test
```

Para rodar migrations/seeds localmente contra o Neon (com `.env.local` presente):

```bash
npx tsx --env-file=.env.local src/db/migrate.ts
npx tsx --env-file=.env.local src/db/seed/inventory.ts
npx tsx --env-file=.env.local src/db/seed/contracts.ts
npx tsx --env-file=.env.local src/db/seed/chart-of-accounts.ts   # roda por último — depende dos outros dois
```

(`npm run db:migrate`/`db:seed:*` também funcionam, mas só se `DATABASE_URL` já estiver exportada
no shell — `--env-file` é necessário porque esses scripts são processos `tsx` isolados, não o
runtime do Next.js, que carregaria `.env.local` sozinho.)

Todos os scripts continuam idempotentes — seguro rodar de novo a qualquer momento.

## Riscos conhecidos

- **App publicamente acessível por padrão** — o gate temporário (`APP_ACCESS_*`) ainda não foi
  ativado pelo proprietário. Agora que há dados reais persistentes (estoque, financeiro), esse
  risco é mais concreto do que quando tudo era em memória. **Recomendação prioritária: ativar o
  gate temporário agora**, antes de qualquer nova exposição de dado real.
- **Nenhuma UI grava no banco ainda** — mesmo com Postgres conectado, `recordPayment`/
  `recordMovement` continuam inacessíveis pela interface, de propósito (sem autenticação). Não
  interpretar isso como limitação técnica — é decisão de segurança deliberada.
- **Tabelas de outros módulos (CRM, RH, JumpPark sync, alerts, audit_logs) existem mas estão
  vazias** — não inventar dados nelas; populam quando os módulos correspondentes forem
  implementados.
- Cobertura de teste automatizado continua só no módulo Financeiro
  (`src/lib/finance/*.test.ts`) — Estoque e demais módulos continuam sem testes.

## Arquivos mais importantes para retomar contexto

| Arquivo | Por quê |
| --- | --- |
| `docs/product-backlog.md` | Referência oficial de prioridade por módulo. |
| `docs/finance-module.md` | Regras reais do módulo Financeiro (agora persistidas no Neon). |
| `docs/database-architecture.md` | As 25 tabelas, migrations 0000+0001, seeds disponíveis. |
| `docs/database-and-auth-setup-guide.md` | Roteiro de banco/autenticação — banco já concluído, falta autenticação completa. |
| `src/db/schema/finance.ts` | Fonte da verdade do modelo financeiro (agora com as constraints corrigidas). |
| `src/lib/finance/repository-factory.ts` / `src/lib/inventory/repository-factory.ts` | Como a escolha Postgres/memória acontece automaticamente — hoje escolhem Postgres. |
| `src/db/seed/chart-of-accounts.ts` | Agora também semeia o movimento de caixa da IESA — leia os comentários antes de reordenar seeds. |
| `middleware.ts` | O gate de acesso temporário — ainda desativado, recomendação é ativar agora. |

## Pendências que exigem decisão do proprietário (não técnicas)

1. **Ativar o gate temporário (`APP_ACCESS_*`) na Vercel** — agora que há dado real persistente e
   uma tela de escrita real (Contas a Pagar), esta é a pendência de maior prioridade.
2. Informar os credores dos 2 acordos pendentes (cartão/cheque especial e empréstimo) —
   `recurring_bill_templates.pending_data = true`, fornecedor ainda nulo.
3. Cadastrar as contas a pagar reais de julho/2026 pela UI (`/financeiro/contas-a-pagar/novo`) —
   nenhuma foi lançada automaticamente, de propósito.
4. Priorizar autenticação completa (sessão + papéis) — arquitetura e testes já provam que as
   ações de escrita (Contas a Pagar e Receber) funcionam no banco real.
5. Confirmação dos 3 contratos PJ assinados, para então autorizar cadastro real de RH.
6. Se/quando confirmar novos recebimentos da Funerária ou Don Juan, criar as respectivas
   `accounts_receivable` (hoje só a IESA tem registro).
7. Qual integração da Fase 9 (Stone, WhatsApp, câmeras, marketing) ativar primeiro.
