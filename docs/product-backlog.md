# Backlog oficial do produto — Santa Monica OS

Auditoria feita em 10/07/2026, no início da execução que implementa a primeira versão do módulo
Financeiro (Contas a Receber + contratos reais). Este documento é a referência oficial de
prioridades — substitui conversas soltas sobre "o que fazer depois". Deve ser atualizado a cada
execução relevante, junto com `docs/next-session-handoff.md`.

Legenda de status: **concluído** · **em andamento** · **preparado** (arquitetura pronta, sem
tela/uso real) · **não iniciado** · **bloqueado**.

## Dashboard

- **Objetivo:** visão executiva única do negócio, mesclando dados reais e demonstrativos com
  indicação clara de origem.
- **Prontas:** receita hoje/mês reais via JumpPark (`totalRevenue`, corrigida); badge "JumpPark
  conectado"; demais cards demonstrativos claramente rotulados.
- **Pendentes:** migrar cards de estoque/clientes/agenda para dados reais conforme os módulos
  correspondentes saírem do estado mock; unificar "No estacionamento" quando existir um endpoint
  confiável (ver `docs/jumppark-open-orders-investigation.md`).
- **Prioridade:** média.
- **Dependências:** CRM (Fase 4), Estoque persistente (Fase 3).
- **Riscos:** mistura de fonte real/mock na mesma tela pode confundir se o usuário não notar os
  badges.
- **Critério de aceite:** todo card real indica a fonte; nenhum card mock aparenta ser real.
- **Status:** em andamento.

## Operações

- **Objetivo:** tela operacional do dia a dia com movimentações reais do estacionamento/lavação.
- **Prontas:** `/operacoes` — ordens finalizadas do dia, filtros, resumo, dados 100% reais do
  JumpPark, máscara de placa/telefone.
- **Pendentes:** unificar com `/estacionamento` (hoje mock, duplicado conceitualmente); mostrar
  veículos atualmente no pátio (bloqueado — sem endpoint confiável, ver investigação já feita).
- **Prioridade:** baixa (já funcional).
- **Dependências:** nenhuma nova.
- **Riscos:** nenhum novo identificado.
- **Critério de aceite:** já atendido para o escopo atual (ordens finalizadas).
- **Status:** concluído (para o escopo de ordens finalizadas); "veículos no pátio" bloqueado.

## JumpPark

- **Objetivo:** integração oficial de leitura para estacionamento/lavação.
- **Prontas:** autenticação, `fetchDailyFinancial`, `fetchTodayOperations`, `fetchOverviewMetrics`,
  correção de subcontagem de receita, rota de diagnóstico segura (`/api/jumppark/status`).
- **Pendentes:** sincronização periódica para banco interno (`jumppark_service_orders`) —
  arquitetura pronta em `docs/jumppark-sync-strategy.md`, não implementada; classificação das
  ordens por tipo de receita (esta execução, ver `docs/financial-classification-rules.md`).
- **Prioridade:** alta (base de tudo que é real no sistema).
- **Dependências:** nenhuma para o que já funciona; banco de dados para a sincronização.
- **Riscos:** dependência de terceiro — se a API cair, `/dashboard` e `/operacoes` mostram erro
  controlado, não quebram.
- **Critério de aceite:** já atendido para leitura; sincronização terá critério próprio quando
  implementada.
- **Status:** em andamento (leitura concluída, sincronização preparada).

## Financeiro

- **Objetivo:** visão consolidada de faturamento, caixa e contas, sem confundir os três conceitos.
- **Prontas (nesta execução):** `/financeiro` reescrito para separar faturamento operacional,
  entradas de caixa, contas a receber, vencidos, contratos recorrentes e recebimentos recentes,
  cada um com origem indicada.
- **Pendentes:** Contas a Pagar (fora do escopo desta execução); conciliação bancária/Stone;
  gráficos reais (hoje ainda usam parte de `mock/finance.ts` para séries históricas que não têm
  fonte real ainda).
- **Prioridade:** alta.
- **Dependências:** Contas a Receber (este mesmo backlog), JumpPark, contratos.
- **Riscos:** duplicar receita ao somar JumpPark + contratos sem excluir sobreposição — mitigado
  nesta execução mantendo as duas fontes separadas na UI, nunca somadas automaticamente.
- **Critério de aceite:** o recebimento de R$ 900,00 da IESA aparece como entrada de caixa e como
  baixa de conta a receber, nunca como faturamento operacional do dia 10/07/2026. **Atendido.**
- **Status:** concluído (para o escopo desta execução — falta apenas banco real em produção).

## Contas a Receber

- **Objetivo:** controlar o que é devido, por quem, quando e se já foi recebido.
- **Prontas (nesta execução):** modelo `accounts_receivable` completo (com pagamento parcial,
  competência separada de recebimento); seed real (IESA); tela `/financeiro/contas-a-receber` com
  resumo, filtros e tabela; 23 testes unitários (`npm run test`); classificação de ordens JumpPark
  documentada (`docs/financial-classification-rules.md`).
- **Pendentes:** geração automática de novas contas a receber a partir dos contratos (hoje é
  manual/seed); edição/baixa manual pela UI (desabilitada até haver autenticação e banco real).
- **Prioridade:** alta (era o entregável principal desta execução — concluído).
- **Dependências:** contratos, partners, customers.
- **Riscos:** nenhuma cobrança automática foi implementada de propósito — não confundir "modelo
  pronto" com "cobrança ativa".
- **Critério de aceite:** a conta da IESA aparece com status `paid`, valor recebido = R$ 900,00,
  forma de pagamento "não informado", nota fiscal emitida = sim, sem valores inventados.
  **Atendido — verificado por teste automatizado.**
- **Status:** concluído (para o escopo desta execução — falta apenas persistência real em banco).

## Contas a Pagar

- **Objetivo:** controlar despesas e obrigações de pagamento (aluguel, produtos, salários, PJs).
- **Prontas:** plano de contas de despesas modelado (`financial_categories`), sem lançamentos.
- **Pendentes:** tudo — modelo de `accounts_payable`, seed de despesas reais, tela.
- **Prioridade:** média (próxima depois de Contas a Receber estar sólido).
- **Dependências:** Contas a Receber (padrão de tela/modelo a reaproveitar), plano de contas.
- **Riscos:** nenhum lançamento deve ser inventado — só cadastrar quando o proprietário informar
  valores reais.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** não iniciado.

## Estoque

- **Objetivo:** controle de produtos, quantidade e movimentações.
- **Prontas:** 48 itens da contagem física; repositório com fallback automático Postgres/memória;
  seed idempotente; UI de consulta, busca e filtros.
- **Pendentes:** ativar `PostgresInventoryRepository` em produção (precisa de banco); habilitar UI
  de movimentação manual (precisa de banco + autenticação); baixa automática por consumo de
  serviço (Fase 7 do roadmap).
- **Prioridade:** alta (Fase 3 do roadmap consolidado).
- **Dependências:** banco de dados, autenticação.
- **Riscos:** sem banco, qualquer movimentação futura não persiste — já documentado e a UI de
  escrita já está desabilitada por esse motivo.
- **Critério de aceite:** já atendido para consulta; persistência real terá critério próprio.
- **Status:** preparado (consulta concluída, persistência bloqueada por falta de banco).

## Compras

- **Objetivo:** sugestões de reposição e comparação de preços.
- **Prontas:** tela demonstrativa (`/compras`, `mock/purchases.ts`); integração Mercado Livre
  documentada como metadado (`src/lib/integrations/mercadolivre`), não conectada.
- **Pendentes:** tudo que depende de dado real — precisa de Estoque persistente com mínimos
  cadastrados para gerar sugestões reais.
- **Prioridade:** baixa.
- **Dependências:** Estoque persistente (Fase 3), integração Mercado Livre (Fase 9).
- **Riscos:** nenhuma compra deve ser executada automaticamente (já é princípio do projeto).
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** não iniciado.

## CRM

- **Objetivo:** histórico e segmentação de clientes.
- **Prontas:** modelo `customers`/`vehicles` no banco (preparado); tela demonstrativa
  (`/clientes`, `mock/customers.ts`).
- **Pendentes:** popular com dados reais (parcialmente disponível via `jumppark_service_orders`
  quando a sincronização existir); segmentação real (novo/recorrente/VIP) calculada, não mock.
- **Prioridade:** média.
- **Dependências:** banco de dados, sincronização JumpPark (Fase 9/Sprint 2 histórico).
- **Riscos:** dado de cliente é PII — não popular em produção sem autenticação completa.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** preparado (modelo pronto, tela ainda mock).

## Marketing

- **Objetivo:** acompanhar campanhas e desempenho de anúncios.
- **Prontas:** tela demonstrativa (`/marketing`); integração Meta Ads/Google documentada como
  metadado, não conectada.
- **Pendentes:** tudo que depende de conexão real com Meta/Google.
- **Prioridade:** baixa.
- **Dependências:** Fase 9 (integrações externas), autorização do proprietário para credenciais.
- **Riscos:** nenhuma alteração de orçamento/publicação automática sem aprovação humana (já
  documentado em `src/lib/integrations/meta/index.ts`).
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** não iniciado.

## RH

- **Objetivo:** gestão de CLT e PJ, separadamente.
- **Prontas:** arquitetura completa (`docs/hr-module-architecture.md`), modelo `employees`/
  `contractors`/`employee_documents` no banco.
- **Pendentes:** tela; cadastro real (aguardando os 3 contratos PJ serem assinados); upload de
  documentos (depende de decisão de storage).
- **Prioridade:** média — mas **bloqueada** por um fator externo (contratos PJ ainda não
  assinados na data desta auditoria).
- **Dependências:** banco de dados, autenticação, contratos PJ assinados.
- **Riscos:** dado trabalhista tem implicação legal — nenhum cálculo automatizado sem revisão
  contábil.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** bloqueado (arquitetura pronta, aguardando evento externo).

## Segurança

- **Objetivo:** proteger o app e, futuramente, monitorar câmeras (módulo Vigia).
- **Prontas:** gate de acesso temporário (`APP_ACCESS_*`, Basic Auth via `middleware.ts`);
  headers de segurança; error boundary; papéis modelados (não aplicados ainda); integração de
  câmeras documentada como metadado, não conectada.
- **Pendentes:** autenticação completa com sessão e papéis por pessoa; módulo Vigia (câmeras)
  real.
- **Prioridade:** alta (Fase 1 do roadmap consolidado — a mais crítica em aberto).
- **Dependências:** banco de dados.
- **Riscos:** app publicamente acessível por padrão até o gate ser ativado ou a autenticação
  completa existir — maior risco atual do projeto.
- **Critério de aceite:** nenhuma página/rota privada acessível sem login; `/api/health` continua
  público.
- **Status:** em andamento.

## Contratos

- **Objetivo:** formalizar e acompanhar parcerias e contratos recorrentes (B2B).
- **Prontas:** modelo `partners`/`contracts`/`contract_value_periods`/`contract_benefits` no
  banco; seed real dos 3 contratos (IESA, Funerária, Don Juan); regras de negócio documentadas
  (`docs/finance-module.md`); contratos visíveis em `/financeiro` (tabela "Contratos recorrentes",
  com valor vigente calculado por `resolveContractValue`).
- **Pendentes:** tela dedicada só de contratos (hoje aparecem dentro de `/financeiro` e
  `/financeiro/contas-a-receber`, não numa tela própria); renovação/reajuste automatizado (ex.:
  Don Juan R$ 550 → R$ 800 em 15/08/2026) — a regra de vigência está pronta e testada, só não
  gera nenhuma ação automática.
- **Prioridade:** alta (parte do escopo desta execução, via Contas a Receber — concluído).
- **Dependências:** banco de dados para persistir novos contratos além do seed.
- **Riscos:** nenhuma cobrança automática — reforçado nesta execução.
- **Critério de aceite:** os 3 contratos aparecem com suas regras corretas refletidas nas contas
  a receber correspondentes. **Atendido.**
- **Status:** concluído (para o escopo desta execução).

## Relatórios

- **Objetivo:** exportação e visão consolidada sob demanda (mensal, por contrato, por categoria).
- **Prontas:** nenhuma.
- **Pendentes:** tudo — depende de Financeiro, Estoque e CRM estarem com dado real suficiente
  para relatórios terem valor.
- **Prioridade:** baixa.
- **Dependências:** Fases 2–5 do roadmap consolidado.
- **Riscos:** nenhum identificado ainda.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** não iniciado.

## Configurações

- **Objetivo:** perfil da empresa, integrações, status do sistema.
- **Prontas:** `/configuracoes` (perfil, integrações, agentes); `/configuracoes/status` (visão
  administrativa sem dados sensíveis — banco, autenticação, armazenamento, versão/commit).
- **Pendentes:** gestão de usuários/papéis pela UI (depende de autenticação completa).
- **Prioridade:** baixa (já atende ao necessário hoje).
- **Dependências:** autenticação completa, para a parte de usuários.
- **Riscos:** nenhum.
- **Critério de aceite:** já atendido para o escopo atual.
- **Status:** concluído (para o escopo atual).

## Agentes de IA

- **Objetivo:** Zézinho (gerente geral) e especialistas, com recomendações e alertas.
- **Prontas:** arquitetura documentada (`docs/agents.md`); interface de chat demonstrativa
  (`/zezinho`); estrutura de auditoria preparada (`AgentAuditLog`/`audit_logs`).
- **Pendentes:** conexão com modelo real; dados reais (depende de todas as fases anteriores
  terem dado real suficiente para o agente ser útil).
- **Prioridade:** baixa por enquanto (valor real depende de dado real disponível primeiro).
- **Dependências:** Fases 1–6 do roadmap consolidado.
- **Riscos:** nenhuma ação financeira/comercial/destrutiva automática — princípio já documentado.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** preparado (arquitetura pronta, sem modelo real conectado).

## Centro de Conhecimento

- **Objetivo:** documentação centralizada do negócio e do sistema, acessível pelo time e pelos
  agentes de IA (base de conhecimento para respostas consistentes).
- **Prontas:** documentação técnica extensa em `docs/*.md` (arquitetura, segurança, banco, RH,
  privacidade, esta auditoria) — mas ainda não organizada como um "centro" navegável dentro do
  produto, só no repositório.
- **Pendentes:** tela dentro do app agregando essa documentação (ou parte dela) de forma
  consultável pelo time operacional, não só por quem lê o código-fonte.
- **Prioridade:** baixa.
- **Dependências:** nenhuma técnica — é principalmente uma decisão de produto (o que expor e para
  quem).
- **Riscos:** nenhum.
- **Critério de aceite:** a definir quando a fase começar.
- **Status:** não iniciado.

---

## Visão por fases

Consolida a priorização entre todos os módulos acima. Não substitui `docs/roadmap.md` (que detalha
entregas/dependências/critérios por fase) — aqui é só o mapa de prioridade em uma tela.

| Fase | Foco | Módulos envolvidos | Status geral |
| --- | --- | --- | --- |
| **Fase 1** | Segurança e banco | Segurança, (todos os módulos dependem indiretamente) | Em andamento — gate temporário pronto, autenticação completa e banco real pendentes |
| **Fase 2** | Financeiro e contratos | Financeiro, Contas a Receber, Contratos | Concluído (escopo desta execução) — falta apenas banco real e Contas a Pagar |
| **Fase 3** | Estoque persistente | Estoque | Preparado — falta banco em produção |
| **Fase 4** | CRM | CRM, Dashboard (parcial) | Preparado — modelo pronto, tela ainda mock |
| **Fase 5** | RH | RH | Bloqueado — aguarda contratos PJ assinados |
| **Fase 6** | Compras | Compras, Estoque | Não iniciado |
| **Fase 7** | Centro de Conhecimento | Centro de Conhecimento | Não iniciado |
| **Fase 8** | Agentes de IA | Agentes de IA | Preparado — arquitetura pronta, sem modelo real |
| **Fase 9** | Integrações externas | JumpPark (sincronização), Marketing, Segurança (câmeras), Financeiro (Stone) | Não iniciado — depende de credenciais autorizadas pelo proprietário |

## Como manter este backlog atualizado

Sempre que uma execução mudar o status de um módulo, atualizar a seção correspondente aqui **e**
`docs/next-session-handoff.md`. Este arquivo responde "o que fazer" e "em que ordem"; o handoff
responde "onde paramos exatamente".
