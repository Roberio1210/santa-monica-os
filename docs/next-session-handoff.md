# Handoff para a próxima sessão — Santa Monica OS

Escrito em 10/07/2026, ao final da execução do módulo Financeiro (Contas a Receber + contratos
reais), que veio logo depois da execução de fundação técnica (banco de dados, segurança,
documentação). Este documento deve permitir que uma nova sessão do Claude continue sem reler todo
o histórico da conversa — substitui a versão anterior deste arquivo.

## Estado exato do projeto

- Repositório: `santa-monica-os` (GitHub: `Roberio1210/santa-monica-os`), branch `main`.
- Publicado na Vercel com deploy automático a cada push em `main`.
- Última execução concluída: módulo Financeiro (backlog oficial, schema ampliado para 25
  tabelas, Contas a Receber funcional, plano de contas, classificação de ordens JumpPark, 23
  testes automatizados). Ver `git log --oneline -15` para os hashes exatos dos commits desta
  execução (organizados por área: backlog/arquitetura, seeds, tela de contas a receber, resumo
  financeiro, testes/documentação).
- Build, lint, typecheck e testes passam limpos, **sem `DATABASE_URL` configurada** — validado
  nesta execução (`npm run build`, `npm run test` rodados sem a variável, com sucesso).

## O que funciona (real, em produção)

- Integração JumpPark (somente leitura) — `src/lib/integrations/jumppark/`.
- `/dashboard` — receita hoje/mês reais (corrigidas desde `079d7dc`); demais cards demonstrativos.
- `/operacoes` — "Movimentações de Hoje", 100% real, ordens finalizadas do dia.
- `/estoque` — 48 itens da contagem física de 10/07/2026, reais, mas **não persistentes**.
- **`/financeiro/contas-a-receber`** (novo) — conta real da IESA/Nissan (R$ 900,00, competência
  junho/2026, recebida em 10/07/2026), resumo, filtros, tabela completa. Roda em memória (sem
  banco), mas com dado real, não mock.
- **`/financeiro`** (reescrito) — separa faturamento operacional (JumpPark) de entrada de caixa,
  mostra contas a receber, contratos recorrentes com valor vigente calculado, recebimentos
  recentes. Gráficos históricos continuam demonstrativos (isolados, com `DemoDataBadge` próprio).
- `/configuracoes/status` — painel administrativo sem dados sensíveis.
- `/api/health` — sempre público, mesmo com o gate de acesso ativado.

## O que é temporário / não persiste

- **Estoque e Financeiro rodam em memória** (`StaticInventoryRepository`,
  `StaticFinanceRepository`) porque não há `DATABASE_URL` configurada. Qualquer alteração seria
  perdida a cada cold start em produção — por isso nenhuma ação de escrita (`recordPayment`,
  movimentação de estoque) está ligada a nenhuma UI. A arquitetura já escolhe Postgres
  automaticamente assim que `DATABASE_URL` existir (`repository-factory.ts` em ambos os módulos).
- **Autenticação é só o gate temporário**, desativado por padrão
  (`APP_ACCESS_ENABLED`/`APP_ACCESS_USERNAME`/`APP_ACCESS_PASSWORD`, via `middleware.ts`). A
  autenticação completa com papéis está **modelada mas não implementada** (`src/lib/auth/`).
- **Módulos Lavação, Estacionamento, Agenda, Clientes, Marketing, Compras, Segurança, Zézinho**
  continuam 100% demonstrativos (`src/data/mock/*`) — nada mudou neles nesta execução.
- **Contas a Pagar não existe** — só o plano de contas de despesas (`financial_categories`,
  estrutura, sem lançamentos).
- **Funerária e Don Juan** têm contrato/regra modelados e testados, mas **nenhuma conta a
  receber própria** — só a IESA tem um evento financeiro confirmado até agora.

## Decisões tomadas nesta execução (módulo Financeiro)

1. **`receivables` foi renomeada para `accounts_receivable`** e ganhou campos novos
   (`expectedAmount`/`receivedAmount`/`outstandingAmount` para suportar pagamento parcial,
   `competenceDate` separado de `receivedAt`). Como nada tinha sido aplicado a um banco real
   ainda, o rename foi seguro — a migration inicial foi só regenerada, não houve migração de
   dados.
2. **Status em inglês** (`draft`/`open`/`partially_paid`/`paid`/`overdue`/`cancelled`), conforme
   pedido explicitamente — quebra o padrão de enums em português usado no resto do schema, e
   está documentado como uma exceção intencional.
3. **`draft`/`cancelled` nunca são recalculados automaticamente** — são decisões manuais; os
   demais status são derivados de `outstandingAmount`/`dueDate` em tempo de leitura
   (`computeAccountsReceivableStatus`), não gravados de forma "presa" no banco.
4. **Nova tabela `contract_value_periods`** para representar o reajuste do Don Juan (R$ 550,00 →
   R$ 800,00) sem sobrescrever histórico. O período entre 16/07/2026 e 14/08/2026 não foi coberto
   por nenhuma informação do proprietário — `resolveContractValue()` retorna `null` para essa
   lacuna, nunca um valor adivinhado.
5. **`cash_movements` é uma tabela nova e central**: existe exatamente para nunca confundir
   faturamento operacional (JumpPark) com entrada de caixa. O recebimento de R$ 900,00 da IESA
   aparece lá com `date = "2026-07-10"`, apontando para a conta a receber de competência
   junho/2026 — as duas datas nunca são a mesma coisa na UI.
6. **Classificação de ordens JumpPark** (`src/lib/finance/classification.ts`) nunca infere
   `parceria`/`mensalista` a partir da forma de pagamento — só a partir de uma lista curada
   manualmente de nomes de clientes conhecidos. Documentado em detalhe em
   `docs/financial-classification-rules.md` porque é a regra mais fácil de violar por engano no
   futuro.
7. **Vitest adicionado** como test runner (`npm run test`) — zero testes existiam antes desta
   execução. 23 testes cobrindo cálculo de saldo, pagamento parcial, status paga/vencida,
   vigência do Don Juan, renovação da Funerária, separação faturamento/caixa, e o caso da IESA
   sem duplicidade.
8. **Plano de contas é só estrutura** (`financial_categories`, `cost_centers`) — 10 categorias de
   receita, 15 de despesa, 6 centros de custo, exatamente como especificado. Nenhum valor
   lançado.

## Próximos 10 passos (em ordem sugerida)

1. Proprietário decide se/quando criar o banco (Vercel Postgres ou Neon) — ver
   `docs/database-and-auth-setup-guide.md`.
2. Rodar `npm run db:migrate` e os três seeds (`db:seed:inventory`, `db:seed:contracts`,
   `db:seed:chart-of-accounts`).
3. Ativar o gate temporário (`APP_ACCESS_ENABLED=true` na Vercel) como proteção imediata,
   independente do banco — ainda não foi ativado.
4. Confirmar que `PostgresFinanceRepository`/`PostgresInventoryRepository` assumem
   automaticamente assim que `DATABASE_URL` existir (nenhuma mudança de código necessária).
5. Implementar autenticação completa (sessão + papéis) — só então habilitar `recordPayment` e a
   UI de movimentações de estoque.
6. Começar Contas a Pagar, reaproveitando o padrão de Contas a Receber (repositório, tela,
   filtros) — o plano de contas de despesas já está pronto.
7. Conectar `/financeiro` a uma série histórica real (hoje os gráficos de tendência ainda são
   `mock/finance.ts`).
8. Avaliar implementar `docs/jumppark-sync-strategy.md` — a classificação
   (`classifyJumpParkOrder`) já está pronta para ser usada assim que a sincronização existir.
9. Quando os 3 contratos PJ forem assinados, avaliar cadastro real de RH (Fase 5 do backlog).
10. Revisar `docs/product-backlog.md` a cada nova execução relevante — é a referência oficial de
    prioridade agora, criada nesta execução.

## Comandos para retomar

```bash
cd /Users/roberiofilho/projetos/santa-monica-os
npm install
npm run lint && npx tsc --noEmit && npm run build && npm run test   # confirma que tudo continua verde
git log --oneline -15                                                # confirma o commit mais recente
```

Sem `DATABASE_URL`, os comandos `db:migrate`/`db:seed:*` falham com uma mensagem clara — isso é
esperado, não é um erro a corrigir.

## Riscos conhecidos

- **App publicamente acessível por padrão** até o gate temporário ou a autenticação completa
  serem ativados — ainda o maior risco de segurança do projeto, não mudou nesta execução.
- **Estoque e Financeiro não persistem** em produção — qualquer expectativa de "salvar algo"
  antes do banco estar configurado vai falhar silenciosamente após um cold start.
- **`/estacionamento` (mock) e `/operacoes` (real) coexistem** sem modelo compartilhado — ainda
  não unificado.
- **Contas a Pagar não existe** — se o proprietário perguntar sobre despesas, hoje só há a
  estrutura do plano de contas, nenhum dado.
- Cobertura de teste existe agora só para o módulo Financeiro (`src/lib/finance/*.test.ts`) —
  Estoque e demais módulos continuam sem testes automatizados.

## Arquivos mais importantes para retomar contexto

| Arquivo | Por quê |
| --- | --- |
| `docs/product-backlog.md` | Referência oficial de prioridade por módulo — comece por aqui. |
| `docs/finance-module.md` | Tudo sobre o módulo Financeiro: modelo, regras reais, telas, limitações. |
| `docs/financial-classification-rules.md` | Por que a classificação de ordens JumpPark nunca infere parceria pela forma de pagamento. |
| `docs/database-architecture.md` | As 25 tabelas, ORM, driver, por que builda sem banco. |
| `docs/database-and-auth-setup-guide.md` | Roteiro que o proprietário segue sem o Claude. |
| `src/db/schema/finance.ts` | Fonte da verdade do modelo financeiro. |
| `src/lib/finance/status.ts` | Regras de saldo/status — leia antes de mexer em Contas a Receber. |
| `src/lib/finance/repository-factory.ts` | Como a escolha Postgres/memória acontece automaticamente (mesmo padrão do estoque). |
| `middleware.ts` | O gate de acesso temporário. |
| `docs/hr-module-architecture.md` | Por que CLT e PJ são modelados separadamente (ainda bloqueado). |

## Pendências que exigem decisão do proprietário (não técnicas)

1. Qual banco criar (Vercel Postgres vs. Neon) e quando.
2. Quando ativar o gate temporário (`APP_ACCESS_*`) — recomendado o quanto antes, é de baixo
   esforço e ainda não foi ativado.
3. Confirmação dos 3 contratos PJ assinados, para então autorizar cadastro real de RH.
4. Se/quando confirmar novos recebimentos da Funerária ou Don Juan, para então criar as
   respectivas `accounts_receivable` (hoje só existem os contratos/regras, sem cobrança).
5. Prioridade entre Contas a Pagar, CRM real e RH (Fases 3, 4 e 5 do backlog) — ordem sugerida,
   não obrigatória.
6. Qual integração da Fase 9 (Stone, WhatsApp, câmeras, marketing) vale mais a pena ativar
   primeiro, quando chegar a hora.
