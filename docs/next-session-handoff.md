# Handoff para a próxima sessão — Santa Monica OS

Escrito em 10/07/2026, ao final da execução que migrou o banco de dados para o Neon Postgres em
produção (Vercel). Este documento substitui a versão anterior — a partir de agora, **Estoque e
Financeiro gravam e leem dados reais do Postgres**, não mais de memória.

## Estado exato do projeto

- Repositório: `santa-monica-os` (GitHub: `Roberio1210/santa-monica-os`), branch `main`.
- Publicado na Vercel com deploy automático a cada push em `main`.
- **Banco de dados: Neon Postgres, conectado e migrado.** `DATABASE_URL`/`POSTGRES_*` já
  configuradas na Vercel pelo proprietário antes desta execução.
- 25 tabelas criadas (migrations `0000_initial_schema` + `0001_last_tomorrow_man`, ambas
  aplicadas). Ver seção "O que foi corrigido nesta execução" — a migration 0001 corrige um bug
  real encontrado só quando o seed rodou contra um banco de verdade.
- Seeds aplicados e confirmados por consulta direta ao banco (não apenas pelo exit code do
  script): 48 itens de estoque, 3 partners, 3 contracts, 2 contract_value_periods, 1
  contract_benefit, 2 services, 1 accounts_receivable (IESA, `paid`, R$ 900,00), 1 payment, 1
  invoice, 25 financial_categories, 6 cost_centers, 1 cash_movement (IESA, R$ 900,00 em
  10/07/2026).
- Build, lint, typecheck e os 23 testes automatizados passam limpos **com `DATABASE_URL`
  configurada** (testes usam fixtures isoladas via `StaticFinanceRepository`, não tocam o banco
  real — continuam válidos independente de haver conexão).
- Teste funcional de persistência executado e confirmado: create → edit → "restart" (processo
  Node novo, conexão nova) → delete → novo "restart" → confirmação — tudo via Neon real, usando a
  arquitetura já existente (schema Drizzle, `applyMovementDelta`). Nenhum dado de teste ficou
  residual; o estoque foi restaurado ao valor original.

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

1. **Ativar o gate temporário (`APP_ACCESS_*`) na Vercel** — agora que há dado real persistente,
   esta é a pendência de maior prioridade.
2. Priorizar autenticação completa (sessão + papéis) para poder habilitar `recordPayment`/
   `recordMovement` na UI — arquitetura e testes já provam que funcionam no banco real.
3. Confirmação dos 3 contratos PJ assinados, para então autorizar cadastro real de RH.
4. Se/quando confirmar novos recebimentos da Funerária ou Don Juan, criar as respectivas
   `accounts_receivable` (hoje só a IESA tem registro).
5. Prioridade entre Contas a Pagar, CRM real e RH (Fases 3, 4 e 5 do backlog).
6. Qual integração da Fase 9 (Stone, WhatsApp, câmeras, marketing) ativar primeiro.
