# Auditoria Geral do Santa Monica OS — 04/08/2026 (Missão 24)

Inventário técnico completo do sistema, feito sob demanda explícita do proprietário para
**pausar o roadmap e diagnosticar o estado real do projeto antes de definir os próximos passos**.
Nada foi implementado, corrigido ou alterado nesta missão — é um raio-x, não uma correção.

Método: leitura direta do código-fonte (`src/`), consulta direta ao Postgres de produção (Neon,
via `information_schema` + `COUNT(*)` real por tabela), `vercel env ls` para confirmar quais
variáveis de ambiente existem em produção (sem poder ler seus valores — ver seção 3), e 5 agentes
de exploração em paralelo, cada um cobrindo uma fatia horizontal do produto. HEAD no momento desta
auditoria: `ad4e5ff` ("docs(jumppark): auditoria completa da integração + correção do diagnóstico
401").

---

## 1. Inventário por módulo

Legenda de status: **Não iniciado** (não existe ou é 100% mock/placeholder) · **Parcial** (mistura
dado real com mock, ou tem lacuna funcional relevante) · **Funcional** (dado real, sem mock, mas
sem confirmação de uso real por usuários) · **Produção** (dado real E evidência de uso real —
linhas no banco, ou é infraestrutura como redirect/health-check).

### Home (`/`)
- **Status**: Produção (trivial).
- **Rotas**: `/` → redirect para `/dashboard`.
- **Banco/APIs**: nenhum.
- **O que falta**: nada — é intencionalmente um redirect puro (`src/app/page.tsx`).

### Dashboard / Central de Operações (`/dashboard`)
- **Status**: Parcial.
- **Rotas**: `/dashboard`.
- **Componentes**: `src/components/operations/*` (central-header, priority-panel, today-panel,
  agenda-block, movement-timeline-block, cash-today-block, financial-block, operation-block,
  top-clients-block, alerts-by-severity, zezinho-summary-card).
- **Banco utilizado**: agrega Financeiro (contas a pagar/receber, caixa), Estoque
  (`inventory_items`, `inventory_movements`), sem tabela própria.
- **APIs utilizadas**: JumpPark, condicional a `isJumpParkConfigured()`.
- **Prontas**: consolidação de alertas por severidade, timeline de movimentação do dia, blocos
  financeiros/estoque com falha isolada por seção (nunca um erro derruba a tela inteira).
- **Parciais**: bloco de Agenda e "Top clientes"/CRM mostram aviso explícito de indisponibilidade
  (nunca dado inventado) — dependem de Agenda real e de um CRM que hoje não alimenta este bloco.
- **Falta**: Agenda real; unificar "Top clientes" com o `/crm` real (ver duplicação na seção 4);
  não tem auto-refresh nem botão de atualizar (diferente de `/operacao`, que tem os dois — sem
  explicação no código para a diferença).

### Central de Operações — nome duplicado
Ver achado dedicado na seção 4 (Código): tanto `/dashboard` quanto `/operacao` reivindicam o
título "Central de Operações" na UI.

### Operação ao Vivo (`/operacao`)
- **Status**: Funcional.
- **Rotas**: `/operacao`.
- **Banco utilizado**: `customers`, `vehicles`, `serviceVisits`, `serviceOrders`,
  `serviceOrderItems`, `services`, `diagnostics`, `technicalRecommendations`, `goals`,
  `goalBonusTiers` — **todas com 0 linhas em produção hoje** (ver seção 2).
- **APIs**: nenhuma direta.
- **Prontas**: quadro ao vivo por estágio, estatísticas do dia, bloco "Precisa da sua atenção",
  timeline, auto-refresh 30s + botão manual.
- **Falta**: nada tecnicamente — mas como as tabelas que alimenta estão vazias, a tela hoje
  reflete um dia real sem nenhum atendimento registrado via este fluxo.

### Gestão do Dia / Atendimento (`/atendimento/**`)
- **Status**: Parcial.
- **Rotas**: `/atendimento`, `/atendimento/buscar`, `/atendimento/novo` (wizard 7 passos),
  `/atendimento/execucao`, `/atendimento/entregas`, `/atendimento/ordens/[orderId]`,
  `/atendimento/veiculos[/[id]]`, `/atendimento/clientes/[id]`, `/atendimento/timeline`.
- **Banco utilizado**: `customers`, `vehicles`, `serviceVisits`, `serviceOrders`,
  `serviceOrderItems`, `services`, `diagnostics`, `diagnosticPhotos`, `technicalRecommendations`.
- **Prontas**: busca por telefone/placa/nome, cadastro sem duplicar, wizard completo de
  diagnóstico → recomendação → OS, avanço de status, check-in rápido, timeline por
  cliente/veículo.
- **Parciais**: upload de foto grava só metadado (`diagnosticId`+`area`), `url` sempre `null` —
  botão "Tirar Foto" não abre câmera/upload real (`src/components/attendance/mobile/wizard/step-fotos.tsx:9-13`,
  decisão de escopo documentada em código, não bug escondido); "Próximo Cliente" na home é
  placeholder estático sem Agenda real conectada.
- **Falta**: upload real de imagem; conectar Agenda real; saudação da home tem nome de usuário
  fixo `"Vinicius"` (`src/app/atendimento/page.tsx:33`) em vez de vir de sessão/autenticação real
  (não existe autenticação individual — ver módulo Usuários).
- **Nota crítica de status**: 100% do código está pronto e sem mock, mas `customers`,
  `vehicles`, `service_orders`, `service_visits`, `diagnostics` estão todas em **0 linhas** em
  produção — ou seja, código completo, **zero uso real confirmado até hoje**.

### Planejamento Operacional (`/planejamento`)
- **Status**: Funcional (mesma ressalva de 0 linhas em `appointments`).
- **Rotas**: `/planejamento`, `/planejamento/novo`.
- **Banco utilizado**: `appointments` (0 linhas), `customers`, `vehicles`, `services`,
  `serviceOrders`, `operationalCapacityConfig` (0 linhas).
- **Prontas**: quadro por dia/faixa, busca, criação de agendamento, "Próximo Cliente" com sinais
  históricos, "Preparação de Amanhã" com forecast de capacidade.
- **Falta**: nada de óbvio no código — módulo coeso, testado (`capacity.test.ts`,
  `clientSignals.test.ts`). Mesma nota: zero uso real confirmado (tabela vazia).

### Assistente do Gerente (`/assistente-gerente`)
- **Status**: Funcional.
- **Rotas**: `/assistente-gerente`.
- **Banco utilizado**: `notifications` (0 linhas), `serviceOrderDiscounts` (0 linhas), + leitura de
  Atendimento.
- **Prontas**: alertas gerenciais ao vivo, prioridades do dia, "Clientes que Merecem Atenção",
  resumo do dono, registro de desconto sem aprovação prévia.
- **Falta**: nada no código; a própria tela já avisa que nada é enviado por WhatsApp/e-mail/push,
  só exibido (`alertas/page.tsx:20`).

### CRM (dois, não um — achado central desta auditoria)
- **`/crm` (CRM Inteligente, Missão 21)** — **Status**: Funcional/Produção parcial. Rota no menu
  principal. Postgres real via `src/lib/crm-intelligente/*`. Fonte de verdade para o time
  gerencial.
- **`src/lib/crm/*` (sem rota própria)** — segunda implementação (`service.ts`, `aggregate.ts`,
  `normalize.ts`, `types.ts`), consumida **só** pela ferramenta `crm_customers` do Zézinho.
  Deriva status/oportunidade do cliente **ao vivo, direto de JumpPark + Contas a Receber**, com
  lógica própria — não lê as mesmas tabelas nem usa o mesmo cálculo que `/crm`.
- **Risco real**: `/crm` (o que o gerente vê) e o Zézinho (o que ele responde em texto) podem
  divergir sobre o mesmo cliente (VIP, em risco, etc.) porque calculam isso de formas diferentes.
  `normalize.ts` é legitimamente compartilhado e não é código morto; só `service.ts`+`aggregate.ts`
  duplicam a lógica de agregação de `crm-intelligente`.

### Clientes (`/clientes`)
- **Status**: Não iniciado — 100% mock (`src/data/mock/customers.ts` + `vehicles.ts`), com
  `<DemoDataBadge />` e texto explicativo (honestamente sinalizado, nunca um clique morto).
  Duplica o conceito do `/crm` real — dá a impressão de dois módulos de clientes.

### Veículos
- Não existe como rota própria fora de Atendimento/CRM — dado de veículo é tratado dentro de
  `/atendimento/veiculos` (real, Postgres) e dentro do `/crm` (real). Não há uma tela "Veículos"
  isolada solicitada pelo usuário que ainda não exista — o conceito está coberto, mas fragmentado
  entre dois módulos.

### Diagnóstico
- Coberto dentro do wizard de Atendimento (`/atendimento/novo`, passo de diagnóstico) — real,
  Postgres, sem mock, exceto a lacuna de upload de foto já descrita acima.

### Ordens de Serviço
- Coberto dentro de Atendimento (`serviceOrders`, `serviceOrderItems`) — real, mas **0 linhas em
  produção hoje**.

### JumpPark (como módulo de consumo de dados, distinto da integração em si — ver seção 3)
- Coberto por `/movimentacoes`, `/lavacao`, `/estacionamento` (leitura ao vivo da API) e por
  `/estoque/ordens` + `/estoque/consumos` (consumo de estoque a partir das ordens). Ver detalhe
  em cada um abaixo e na seção 3 (Integrações).

### Movimentações (`/movimentacoes`, distinta de `/estoque/movimentacoes`)
- **Status**: Funcional. 100% dado ao vivo do JumpPark, sem tabela própria.
- **Prontas**: listagem de ordens finalizadas por período, resumo agregado, detalhe por
  `externalId`, link cruzado para consumo de estoque.
- **Parciais**: a própria tela reconhece explicitamente que "nenhum link foi inventado" para
  cliente/contas a receber cruzado (`[externalId]/page.tsx:127-129`) — cross-reference ainda não
  existe.

### Lavação (`/lavacao`) e Estacionamento (`/estacionamento`)
- **Status**: Funcional — mesmo padrão de Movimentações, filtrado por tipo de ordem
  (`lavacao`/`estacionamento`), 100% JumpPark ao vivo, sem tabela própria, com tratamento de erro
  honesto.

### Agenda (`/agenda`)
- **Status**: Não iniciado — 100% mock (`src/data/mock/schedule.ts`), `<DemoDataBadge />`, texto
  explícito "Criação e edição reais serão habilitadas em fase futura" (`agenda/page.tsx:23`). Não
  é a mesma coisa que Planejamento Operacional (`/planejamento`, que é real) — os dois nomes
  convivem e podem confundir o usuário sobre qual é a agenda "de verdade".

### JumpPark — consumo de estoque
Ver "Ordens" e "Consumos" dentro de Estoque, abaixo.

### Financeiro (visão geral)
- **Status**: Parcial/Produção — módulo mais maduro do sistema em termos de dado real
  configurado (29 categorias financeiras, 15 regras de classificação, 11 fornecedores, 7 centros
  de custo, 4 parceiros, 3 contratos), mas com **volume de transação real ainda baixo**
  (`accounts_receivable`: 1 linha, `payments`: 1, `invoices`: 1, `accounts_payable`: 0,
  `cash_movements`: 2).
- **Rotas**: `/financeiro`.
- **Achado**: card "Histórico e formas de pagamento" (`financeiro/page.tsx:238`) é
  incondicionalmente `<Unavailable>` — um texto estático, não um estado computado-e-vazio. Vale
  confirmar com o negócio se é lacuna real de dado ou placeholder esquecido.

### Fluxo de Caixa (`/financeiro/fluxo-de-caixa`)
- **Status**: Funcional — `computeCashFlowDashboard`/`computeCashFlowProjection`/
  `computeCashFlowAlerts` em `src/lib/finance/service.ts`, dado real (`cash_movements`,
  `financial_accounts`).

### Contas a Receber / Contas a Pagar
- **Status**: Funcional, com lacuna de RBAC **auto-documentada no próprio código**: ações
  sensíveis (excluir, etc.) hoje são protegidas só pelo Basic Auth único do app, não por
  permissão por usuário (`contas-a-receber/[id]/page.tsx:219-222`,
  `contas-a-pagar/[id]/page.tsx:221-224`) — mapeia diretamente para a lacuna real do módulo
  Usuários/Permissões (ver abaixo).
- **Duplicação de código confirmada**: `validateAccountsPayableForm`/
  `validateAccountsReceivableForm` e helpers (`parseOptionalString`, `parsePaymentMethod`,
  `isValidDate`) quase idênticos entre `contas-a-pagar/actions.ts` e
  `contas-a-receber/actions.ts`; estrutura de página de detalhe (badges, histórico de baixa,
  bloco Cancelar/Excluir, aviso de RBAC, helper `Row`) também duplicada quase verbatim entre os
  dois `[id]/page.tsx`.

### Estoque (visão geral)
- **Status**: Funcional — `InventoryRepository` usa Postgres quando `DATABASE_URL` configurada,
  memória (não persistente) quando não. **65 produtos reais**, **67 movimentações reais**.
- **Rotas**: `/estoque`.
- **Prontas**: cards de indicadores completos, navegação para todos os submódulos.

### Auditoria do Estoque (Missão 23)
- **Status**: Funcional, mas **Postgres-only** — lança erro genérico `"Banco não configurado."`
  sem fallback em memória (diferente do resto do módulo).
- **Rotas**: `/estoque/auditoria`, `/consolidar`, `/exportar` (CSV).
- **Prontas**: 13 categorias de qualidade de dado, detecção de duplicidade, índice de saúde,
  assistente de consolidação transacional, exportação CSV.
- **Falta**: reversão de consolidação (mencionada em comentário, nunca implementada — decisão
  deliberada, "reverter seria uma nova movimentação, nunca um DELETE").

### Compras — duas telas com o mesmo nome
- **`/estoque/compras-sugeridas`** (real, no hub de Estoque): **bug funcional confirmado** —
  `fetchPurchaseSuggestions` (`src/lib/inventory/purchase-suggestions.ts:18-29`) **nunca** calcula
  `suggestedQuantity`; mesmo com `minimumStock` já preenchido no produto, cai sempre no branch
  "lead time não configurado". A tela está, na prática, sempre vazia de sugestões reais, apesar de
  a UI sugerir que o cálculo existe.
- **`/compras`** (também no menu principal, fora do hub de Estoque): 100% mock
  (`src/data/mock/purchases.ts`, "oportunidades Mercado Livre" fictícias), com `DemoDataBadge`.
  Não compartilha nenhum código com `/estoque/compras-sugeridas` e não está linkada a partir do
  hub `/estoque` — parece protótipo legado esquecido, mas continua visível e clicável no menu
  lateral principal.

### Produtos (`/estoque/produtos`)
- **Status**: Funcional/Produção — saldo sempre derivado do livro-razão de movimentações, nunca
  sobrescrito diretamente. Edição de metadados (fornecedor, localização, mínimo/ideal) real.

### Entradas / Saídas / Movimentações de Estoque / Contagem física
- **Status**: Funcional/Produção — todas operam sobre o livro-razão `inventory_movements`
  (67 linhas reais), nada sobrescrito, cada ajuste vira uma movimentação nova.

### Receitas / Calibração
- **Status**: Funcional, mas depende de Postgres em dois pontos que hoje falham
  silenciosamente sem ele: `getRecipeRepository()` tem fallback vazio, e `listServices()`
  (`services-catalog.ts:14-15`) chama `getDb()` direto e retorna `[]` sem Postgres — telas de
  Nova Receita/Calibração carregam sem nenhum serviço disponível em modo memória.
- **Guardrail testado**: nenhuma baixa automática de estoque nesta fase (`no-auto-consumption.test.ts`).

### Mapeamentos (`/estoque/mapeamentos`)
- **Status**: Funcional/Produção — **26 sugestões reais** em `process_step_product_suggestions`.
- **Achado de UX**: bloco fixo "Pretinho dos pneus ainda não identificado"
  (`mapeamentos/page.tsx:21-26`) parece exemplo hardcoded de fase anterior, sem relação dinâmica
  com o dado real — vale revisão.

### Consumo (Consumos de Estoque, `/estoque/consumos`) e Ordens JumpPark (`/estoque/ordens`)
- **Status**: Funcional, condicional a `INVENTORY_CONSUMPTION_MODE`. Sem essa env explícita em
  `preview_and_confirm`, a tela opera só em modo de prévia (nunca grava). Confirmação
  transacional idempotente, com estorno restaurando saldo. Tabelas de confirmação
  (`inventory_consumption_confirmations`, `inventory_consumption_lines`) hoje em **0 linhas** —
  ou seja, pronto tecnicamente, nunca confirmado de fato em produção.

### Receitas (como módulo de estoque) — ver "Receitas / Calibração" acima. Não confundir com "DRE"/receita financeira.

### Configurações (`/configuracoes`)
- **Status**: Parcial — mistura real (JumpPark, Stone) com mock (card "Agentes": 11 personas
  fictícias de `src/data/mock/agents.ts`, todas `status: "planejado"`, sem badge de "demo" como
  as outras telas mock têm) e texto hardcoded não editável ("Perfil da empresa").
- **Achado relevante**: essas 11 personas ("Carlos", "Bia", "Vini", "Nina", "Eva", "Beto",
  "Marta", "Radar", "Memória", "Vigia") **não correspondem à arquitetura real** do Zézinho, que é
  um assistente único com "diretoria" interna de módulos, não um time multiagente nomeado —
  conteúdo aspiracional desalinhado do que existe de fato.

### Integrações (visão consolidada) — ver seção 3 completa.
- Meta, Google, Mercado Livre, WhatsApp, Câmeras: **Não iniciado** — 100% placeholder
  (`isXConfigured()` retorna `false` hardcoded nos 5 arquivos, nenhuma env var realmente lida via
  `process.env`).
- JumpPark, Stone: implementados de verdade (ver seção 3).

### Usuários
- **Status**: Não iniciado — só o schema Drizzle (`users`, `src/db/schema/auth.ts:19-36`) existe;
  **nenhum outro arquivo do projeto importa esse schema**; 0 linhas na tabela; nenhuma tela de
  CRUD; `passwordHash` nunca é escrito em lugar nenhum.

### Permissões
- **Status**: Não iniciado — `src/lib/auth/roles.ts` define 7 papéis (owner, manager, parking,
  detailing, finance, hr, read_only) só como tipo TypeScript, **nunca consumido por nenhuma
  lógica de autorização real**. O único controle de acesso hoje é o Basic Auth de senha única do
  `middleware.ts` — sem noção de identidade individual nem papel.

### Logs
- **Status**: Parcial, só dentro do Financeiro — `auditLogs` (`src/db/schema/system.ts:28-41`) é
  escrito extensivamente (15+ pontos) pelo repositório financeiro (pagamentos, classificações,
  fechamentos), mas **0 linhas hoje** (nenhuma transação real ainda gravou uma) e **nenhuma tela
  lê essa tabela** — não existe "Central de Logs" como conceito de produto. Os "loggers" técnicos
  de integração (Stone, JumpPark) são logs de execução de servidor, não de auditoria de usuário, e
  também não têm UI própria.
- **Conclusão honesta**: Usuários e Permissões **não existem como produto** — apenas schema não
  utilizado. Logs existe parcialmente como infraestrutura interna do Financeiro, sem exposição.

### Alertas (`/alertas`)
- **Status**: Funcional, mas 100% derivado — recalcula `computeConsolidatedAlerts` do mesmo
  `fetchCentralOverview` do Dashboard, sem fonte/tabela própria e sem estado (não dá para marcar
  como resolvido). A própria tela avisa que nada é enviado por WhatsApp/e-mail/push
  (`alertas/page.tsx:20`).

### Módulos adicionais encontrados (fora da lista original, relevantes o suficiente para reportar)
- **Painel Gerencial** (`/painel-gerencial`) — Funcional/Produção: combina vendas reais (JumpPark)
  com despesas reais (Financeiro); rotula explicitamente "resultado operacional" como não sendo
  lucro contábil, por transparência.
- **Zézinho** (`/zezinho`) — Funcional em modo analítico local, mas o "modo IA generativa" é uma
  abstração pronta (`ai-provider.ts`) **nunca de fato chamada** — nenhum SDK de IA externo
  integrado ("Nenhum SDK de IA é chamado nesta sprint", comentário no código). 3 ferramentas
  (`unanswered_clients`, `agenda_summary`, `marketing_summary`) sempre retornam `not_configured`
  porque dependem de WhatsApp/Agenda real/Meta Ads, nenhum dos três implementado.
- **`/admin/diagnostico`** — Funcional, novo (desta semana), não está no menu de navegação
  principal (só acessível via link em `/configuracoes/status`), protegido só pelo mesmo Basic
  Auth compartilhado do resto do app.
- **Login (`/login`)** — Não iniciado de fato: `getAuthStatus()` sempre retorna
  `fullAuthConfigured: false`, hardcoded; a proteção real do sistema é o Basic Auth de credencial
  única do `middleware.ts`, não este login individual.
- **`/operacoes`** (com "s") — redirect legado intencional para `/movimentacoes`, documentado no
  próprio código; não confundir com `/operacao` (sem "s"), que é uma tela ativa e diferente.
- **Segurança/Vigia** (`/seguranca`) e **Marketing** (`/marketing`) — ambos Não iniciado, 100%
  mock com `DemoDataBadge`, sem nenhuma chamada real de API.

---

## 2. Auditoria do banco de dados (Neon/Postgres — consulta direta e real, feita nesta auditoria)

**66 tabelas no total.** **40 tabelas com 0 linhas** (61% do schema hoje vazio), **26 tabelas com
dado real**. 86 relacionamentos de chave estrangeira confirmados via `information_schema`.

### Tabelas com dado real (26), da maior para a menor
| Tabela | Linhas | Módulo |
|---|---|---|
| `stone_reconciliation_results` | 815 | Stone |
| `stone_divergences` | 510 | Stone |
| `stone_normalized_transactions` | 418 | Stone |
| `inventory_movements` | 67 | Estoque |
| `inventory_items` | 65 | Estoque |
| `jumppark_service_mappings` | 40 | Mapeamentos / JumpPark |
| `stone_import_runs` | 31 | Stone |
| `financial_categories` | 29 | Financeiro |
| `process_step_product_suggestions` | 26 | Mapeamentos |
| `services` | 19 | Catálogo de serviços |
| `classification_rules` | 15 | Financeiro |
| `suppliers` | 11 | Estoque |
| `recurring_bill_templates` | 10 | Financeiro |
| `organizational_beliefs` | 8 | Zézinho (memória organizacional) |
| `cost_centers` | 7 | Financeiro |
| `partners` | 4 | Financeiro |
| `contracts` | 3 | Financeiro |
| `financial_accounts` | 3 | Financeiro |
| `goal_bonus_tiers` | 3 | Metas |
| `cash_movements` | 2 | Fluxo de Caixa |
| `contract_value_periods` | 2 | Financeiro |
| `accounts_receivable` | 1 | Financeiro |
| `contract_benefits` | 1 | Financeiro |
| `goals` | 1 | Metas |
| `invoices` | 1 | Financeiro |
| `payments` | 1 | Financeiro |

### Tabelas vazias (40) — por que importa cada uma
- **Núcleo de Atendimento, zero uso real confirmado**: `customers`, `vehicles`, `service_orders`,
  `service_visits`, `diagnostics`, `diagnostic_photos`, `technical_recommendations`,
  `appointments`, `service_order_items`, `service_order_discounts`,
  `operational_capacity_config`, `notifications`. Código completo (Atendimento, Planejamento,
  Assistente do Gerente), mas nenhuma linha real ainda — não há evidência de uso em produção por
  Robério/Vinícius através desses fluxos.
- **Auditoria de Estoque / consumo JumpPark→estoque, pronto mas nunca confirmado**:
  `inventory_audit_events`, `inventory_consolidations`, `inventory_consolidation_members`,
  `inventory_consumption_confirmations`, `inventory_consumption_lines`, `purchase_imports`,
  `purchase_import_lines`, `recipe_calibration_samples`, `service_consumption_rules`.
- **Financeiro, ainda não usado**: `accounts_payable` (0, apesar de `accounts_receivable` ter 1),
  `accounting_periods`, `account_transfers`, `allocation_rules`, `allocation_rule_shares`,
  `financial_classifications`, `reconciliation_records`, `audit_logs` (auditoria interna nunca
  disparada de fato ainda).
- **Dormente por decisão de arquitetura, não bug**: `jumppark_service_orders`,
  `jumppark_sync_logs` — schema existe, zero código de aplicação referencia essas tabelas fora do
  próprio arquivo de schema, exatamente como `docs/jumppark-sync-strategy.md` já documenta:
  "arquitetura preparada, nunca ativada, aguardando autorização explícita do dono".
- **Usuários/RH, nunca populados**: `users`, `employees`, `contractors`, `employee_documents` —
  confirma que "Usuários"/"Permissões" não existem como produto (seção 1).
- **Zézinho/Diretoria, nunca gravado**: `director_daily_snapshots`, `director_learnings`,
  `strategic_memory_items` — só `organizational_beliefs` tem 8 linhas reais; o resto da memória
  organizacional da "diretoria" nunca foi persistido.
- **Categoria de veículo por JumpPark**: `vehicle_category_assignments` — schema pronto, nunca
  usado.

### Leitura honesta do conjunto
O banco mostra dois perfis bem distintos: um **Financeiro/Estoque configurado e com dado real,
mas de baixo volume transacional** (poucas contas, poucos pagamentos — sugere sistema recém-
colocado em uso real ou ainda em fase de configuração), e um **núcleo de Atendimento
tecnicamente completo mas com zero evidência de uso real** — não há como saber, só pelos dados,
se isso é porque a equipe ainda não começou a operar por ali ou se há alguma fricção de adoção;
essa é uma pergunta de negócio, não uma conclusão que os dados sozinhos respondem.

---

## 3. Auditoria de integrações

Confirmado via `vercel env ls production` (lista nomes de variáveis reais configuradas na Vercel —
não consigo ler os *valores*, porque todas são "Sensitive"/write-only por design da plataforma;
isso já havia sido confirmado e documentado na missão anterior, `docs/jumppark-integration-audit-2026-08-04.md`, seção 6).

| Integração | Vars na Vercel (produção)? | Status real |
|---|---|---|
| **Neon (Postgres)** | Sim — `DATABASE_URL` + 13 variáveis relacionadas (`PGHOST`, `POSTGRES_*`, `NEON_PROJECT_ID` etc.), há 24 dias | **Produção** — banco vivo, 66 tabelas, `pingDatabase()` real via `/admin/diagnostico` |
| **JumpPark** | Sim — as 5 variáveis exigidas pelo código (`JUMPPARK_API_BASE_URL`, `JUMPPARK_API_TOKEN`, `JUMPPARK_API_USER_ID`, `JUMPPARK_ESTABLISHMENT_ID`, `JUMPPARK_API_ORIGIN`) existem como entradas configuradas, há 25 dias | **Implementada e historicamente funcional** (evidência indireta forte: 40 linhas reais em `jumppark_service_mappings`, que só existem se `fetchServiceOrders` já teve sucesso). Causa raiz do 401 já diagnosticada e documentada na missão anterior (`JUMPPARK_API_ORIGIN` ausente/errada é a causa mais provável, não token expirado); `GET /reports/financial` retorna 404 hoje mesmo com credencial válida (possível descontinuação pela JumpPark, achado novo e independente). **Não consigo confirmar se os *valores* atuais na Vercel estão corretos** — só o próprio Robério pode ver isso no painel. |
| **Stone** | Sim — `STONE_ACCOUNT_ID`, `STONE_API_KEY`, há 10 dias | **Produção confirmada** — 1.774 linhas reais somadas em `stone_reconciliation_results`+`stone_divergences`+`stone_normalized_transactions`+`stone_import_runs`. O ambiente local (`.env.local`) não tem essas variáveis, por isso qualquer auditoria feita só a partir do código local reportaria "não configurado" — isso é esperado, não uma inconsistência: produção e dev local têm configurações diferentes por design. |
| **WhatsApp Business** | Não — nenhuma variável (`WHATSAPP_*`) aparece na Vercel | **Não iniciado** — `src/lib/integrations/whatsapp/index.ts` é 100% placeholder, `isWhatsAppConfigured()` sempre `false` |
| **Google** (Business/Calendar/Sheets) | Não | **Não iniciado** — mesmo padrão placeholder |
| **Meta Ads/Instagram/Facebook** | Não | **Não iniciado** — mesmo padrão placeholder |
| **Mercado Livre** | Não | **Não iniciado** — mesmo padrão placeholder |
| **Câmeras (Intelbras/Mibo)** | Não | **Não iniciado** — mesmo padrão placeholder |
| **Evolution API** | Não — nenhuma variável, nenhuma referência de código | **Não existe no projeto.** Busca dedicada (`grep -rli "evolution"`) só encontra ocorrências de "evolução" no sentido de "evolução ao longo do tempo" (`diagnosticEvolution.ts` no CRM, `purchase-audit.ts` no Estoque) — nada relacionado a uma API Evolution de WhatsApp. Confirmando por completude, já que o usuário pediu explicitamente para checar. |
| **Vercel** (a própria plataforma de deploy) | — | **Operacional** — hospeda produção, pipeline de deploy testado e funcionando ao longo de toda a sessão. Gate de Basic Auth (`APP_ACCESS_ENABLED`) ativo no app inteiro (exceto `/api/health`); essa variável também é "Sensitive" e não pôde ser lida por CLI em nenhuma tentativa desta ou de missões anteriores — só confirmável indiretamente (o gate está de fato ativo, testado). |

**Resumo de integrações**: 2 de 7 integrações citadas pelo usuário estão implementadas de verdade
(JumpPark, Stone) e com evidência real de uso em produção; 1 (Evolution) não existe no projeto;
as outras 4 (WhatsApp, Google, Meta, Mercado Livre) mais Câmeras são placeholders honestos —
código estruturado (metadados, riscos, dependências documentadas), zero chamada real.

---

## 4. Auditoria de código

### Duplicações confirmadas
1. **Dois CRMs** — `/crm` (real, nav, Postgres) vs `src/lib/crm/*` (sem rota, só usado pelo
   Zézinho, deriva dado ao vivo de JumpPark+Contas a Receber com lógica própria). Risco: os dois
   podem divergir sobre o mesmo cliente.
2. **Financeiro**: `validateAccountsPayableForm`/`validateAccountsReceivableForm` e helpers
   (`parseOptionalString`, `parsePaymentMethod`, `isValidDate`) duplicados quase verbatim entre
   `contas-a-pagar/actions.ts` e `contas-a-receber/actions.ts`; estrutura de página de detalhe
   (badges, histórico, bloco Cancelar/Excluir, aviso de RBAC, helper `Row`) duplicada entre os
   dois `[id]/page.tsx`; duplicação menor entre os helpers `groupSum`/`groupSumByAmount` de
   `computeCashFlowDashboard` e `computeAccountsReceivableSummary`/`computeAccountsPayableSummary`
   dentro do mesmo `src/lib/finance/service.ts`.
3. **"Compras" com dois significados**: `/compras` (mock/legado) e
   `/estoque/compras-sugeridas` (real, mas com bug que zera o cálculo) — mesmo nome, zero código
   compartilhado.
4. **Nomenclatura confusa (não é duplicação de lógica, mas gera confusão real de produto)**:
   `/operacao` (ativa) vs `/operacoes` (redirect legado); `/movimentacoes` (ordens JumpPark) vs
   `/estoque/movimentacoes` (livro-razão de estoque); título "Central de Operações" usado tanto em
   `/dashboard` quanto no cabeçalho de `/operacao`.

### Bug funcional confirmado (não é só TODO)
- `src/lib/inventory/purchase-suggestions.ts:18-29` — `fetchPurchaseSuggestions` nunca calcula
  `suggestedQuantity`; mesmo com `minimumStock` preenchido, sempre cai no branch de "lead time não
  configurado". `/estoque/compras-sugeridas` está, na prática, sempre vazia de sugestões reais.

### Dado mockado/fictício remanescente (todos com badge honesto, exceto onde indicado)
- `src/data/mock/customers.ts` + `vehicles.ts` → `/clientes`
- `src/data/mock/schedule.ts` → `/agenda`
- `src/data/mock/purchases.ts` → `/compras`
- `src/data/mock/cameras.ts` → `/seguranca`
- `src/data/mock/marketing.ts` → `/marketing`
- `src/data/mock/agents.ts` (`agentProfiles`) → card "Agentes" em `/configuracoes` — **este é o
  único sem `DemoDataBadge` nem aviso explícito de dado demonstrativo**, ao contrário de todos os
  outros acima.

### Código órfão / nunca importado (confirmado via grep cruzado)
- `mockRecommendations` em `src/data/mock/agents.ts:94-135` — exportado, nunca importado em
  lugar nenhum.
- Nenhum componente React órfão encontrado em nenhuma das 5 fatias auditadas — todos os
  componentes de `src/components/{operations,operations-center,manager-assistant,planning,
  attendance,inventory}` têm ao menos um importador real.

### TODO/FIXME
- **Nenhum marcador literal de TODO/FIXME/XXX encontrado em nenhuma das 5 fatias auditadas.** As
  pendências do projeto estão documentadas como comentários JSDoc descritivos ("sem upload real
  nesta sprint", "ainda não integrada", "Nenhum SDK de IA é chamado nesta sprint") em vez de
  marcadores de TODO — um padrão de disciplina de código acima da média, mas que também significa
  que uma busca por "TODO" subestimaria o trabalho pendente real; esta auditoria por isso se apoiou
  em leitura de código, não em grep de marcadores.

### Documentação desatualizada (relevante porque pode enganar quem ler depois)
- `docs/current-state-audit.md` (10/07/2026) descreve `/dashboard` como ainda usando mock de
  clientes/agenda diretamente — não reflete mais o código atual (hoje usa dado real, com aviso
  explícito nas seções que faltam). Deveria ser marcado como superseded por este documento.
- `docs/inventory-module.md` descreve a versão pré-Postgres do Estoque ("por que não há banco de
  dados") — totalmente obsoleto frente ao `PostgresInventoryRepository` real e às Missões 22/23.
- `src/app/estoque/pendencias/page.tsx:130-145` afirma que os campos `supplier`/`location` "ainda
  não existem no schema" e que a integração JumpPark "ainda não foi implementada" — **ambos
  falsos hoje**: os campos existem desde a Missão 22 e são editáveis; a integração JumpPark→estoque
  está implementada e em uso real (`jumppark_service_mappings` tem 40 linhas).

### Dependência oculta de Postgres sem fallback consistente
Vários módulos usam `getDb()` diretamente, fora da camada de repositório com fallback em memória
do resto do Estoque: `consolidation.ts`, `duplicate-decisions.ts`, `purchase-import-service.ts`
(lançam erro genérico sem Postgres), e `services-catalog.ts`, `suggestions.ts` (retornam vazio
silenciosamente sem Postgres, sem avisar o usuário que é por falta de configuração).

---

## 5. Auditoria de UX (botões, links, formulários)

Esta seção reaproveita — sem repetir do zero — o resultado já exaustivo da missão de
"estabilização" anterior nesta mesma sessão, mais o guardrail automatizado
(`src/lib/testing/route-integrity.ts`) criado naquela missão, que varre `src/app` para achar toda
rota real e todo `href` literal em `src/app`+`src/components`, falhando o build se algum link
interno apontar para uma rota inexistente ou se existir `href="#"` em qualquer lugar.

- **Zero botões mortos encontrados em todo o sistema** — cada elemento clicável foi rastreado até
  uma server action real com escrita real no banco, ou até uma rota real.
- **Zero links quebrados** (garantido pelo teste automatizado, que passa hoje).
- Onde não há dado real, o padrão consistente é **avisar** (`<Unavailable>`, `<DemoDataBadge>`),
  nunca fingir ou travar silenciosamente — com uma exceção conhecida: o card "Agentes" de
  `/configuracoes`, que mostra 11 personas fictícias sem nenhum aviso de que são dado
  demonstrativo (ver seção 4).
- **Limitação do teste automatizado, documentada por design**: ele não pega `href` construído
  dinamicamente (template literal com variável) nem valida o corpo de uma server action — só
  garante que o link, quando é uma string literal, aponta para algo que existe.

---

## 6. Relatório final

### 1. O que já está pronto
- Núcleo de Atendimento completo: busca, cadastro, wizard de diagnóstico→recomendação→OS,
  execução, entrega, timeline (Postgres real, zero mock).
- Planejamento Operacional, Assistente do Gerente, Operação ao Vivo — todos com dado real, sem
  mock, testados.
- CRM Inteligente (`/crm`), Estoque (produtos, entradas/saídas, movimentações, contagem,
  receitas/calibração, mapeamentos), Financeiro (fluxo de caixa, contas a pagar/receber, DRE,
  classificação, fechamento).
- Auditoria e Consolidação de Estoque (Missão 23), Importação de compras históricas.
- Consumo de estoque a partir de ordens JumpPark, com confirmação transacional idempotente e
  estorno.
- Painel Gerencial, Zézinho (modo analítico local), painel de diagnóstico técnico
  (`/admin/diagnostico`).
- Diagnóstico honesto e classificação de causa da integração JumpPark (missão anterior).

### 2. O que já funciona em produção (com evidência real de uso, não só código pronto)
- **Neon/Postgres**: 66 tabelas, banco vivo.
- **Stone**: 1.774 linhas reais de conciliação — a integração mais usada do sistema hoje.
- **JumpPark**: evidência forte de uso histórico real (40 mapeamentos de serviço só existem se a
  API já respondeu com sucesso), mas com uma falha ativa não confirmada como corrigida (causa já
  diagnosticada, correção pendente do lado do Robério na Vercel).
- **Estoque** (produtos, movimentações, mapeamentos): dado real, volume relevante (65 produtos,
  67 movimentações, 26 sugestões de mapeamento confirmadas).
- **Financeiro**: configuração real (categorias, regras, fornecedores, centros de custo), mas
  volume de transação real ainda muito baixo (1-2 linhas nas tabelas de movimento).
- **Deploy/Vercel**: pipeline funcionando, testado repetidamente ao longo da sessão.

### 3. O que ainda não funciona
- Núcleo de Atendimento/Planejamento/Assistente do Gerente: código 100% pronto, mas **zero
  evidência de uso real** (todas as tabelas centrais em 0 linhas) — não dá para saber, só pelos
  dados, se é falta de adoção ou se a equipe simplesmente não começou a operar por ali ainda.
- Upload real de foto no diagnóstico (metadado grava, arquivo não).
- `/estoque/compras-sugeridas`: bug confirmado zera o cálculo de sugestão sempre.
- Agenda real (`/agenda` é mock); Google Calendar não conectado.
- WhatsApp, Meta Ads, Mercado Livre, Câmeras: 100% placeholder, nenhuma chamada real.
- Zézinho: modo "IA generativa" nunca ativado (nenhum SDK externo chamado); 3 ferramentas sempre
  retornam "não configurado".
- Usuários/Permissões: não existem como produto (só schema não usado); controle de acesso hoje é
  um único Basic Auth compartilhado, sem identidade individual.
- JumpPark `GET /reports/financial`: retorna 404 mesmo com credencial válida (achado novo,
  independente da correção de variável pendente).
- Card "Agentes" em `/configuracoes`: 11 personas fictícias sem badge de demo, desalinhadas da
  arquitetura real do Zézinho.

### 4. O que está duplicado
- Dois CRMs com lógica e fonte de dado diferentes (`/crm` vs `src/lib/crm/*` do Zézinho).
- Validação e estrutura de página quase idênticas entre Contas a Pagar e Contas a Receber.
- Duas telas de "Compras" sem código compartilhado (`/compras` mock vs `/estoque/compras-sugeridas`
  real-mas-quebrada).
- Nomenclatura sobreposta sem duplicação de lógica: `/operacao` vs `/operacoes`;
  `/movimentacoes` vs `/estoque/movimentacoes`; "Central de Operações" usado em duas telas.

### 5. O que pode ser removido (candidatos — nenhum removido nesta missão, por instrução explícita)
- `mockRecommendations` em `src/data/mock/agents.ts` (nunca importado).
- `/compras` (protótipo mock desconectado do fluxo real, sem link a partir do hub de Estoque, com
  duplicata funcional real em `/estoque/compras-sugeridas`) — candidato a remoção **depois** que
  `/estoque/compras-sugeridas` for corrigida, para não perder a única tela de "compras" que
  existe hoje.
- `docs/current-state-audit.md` e `docs/inventory-module.md` — não remover, mas marcar
  explicitamente como superseded por este documento e pela arquitetura Postgres atual.
- Texto desatualizado em `src/app/estoque/pendencias/page.tsx:130-145` (afirma lacunas que já
  foram resolvidas).

### 6. O que deve ser priorizado (ordem sugerida, não decidida — ver ponto 8)
1. Confirmar/corrigir as variáveis JumpPark na Vercel (já diagnosticado, falta só a correção do
   lado do Robério) — reativa Movimentações/Lavação/Estacionamento/Operação ao Vivo com dado
   confiável.
2. Corrigir o bug de `fetchPurchaseSuggestions` (zera sugestões de compra sempre).
3. Adicionar aviso de "dado demonstrativo" ao card "Agentes" em `/configuracoes`, ou remover o
   card até refletir a arquitetura real do Zézinho.
4. Decidir, com o negócio: o núcleo de Atendimento está pronto e sem uso real — é uma decisão de
   adoção/treinamento da equipe, não de desenvolvimento?
5. Consolidar os dois CRMs numa única fonte de verdade.
6. Resolver a duplicação de "Compras" (corrigir a real, decidir o destino do mock).

### 7. O percentual real de conclusão do Santa Monica OS
Não existe uma métrica única honesta aqui — o sistema tem perfis muito diferentes por camada:
- **Código/arquitetura**: majoritariamente pronto para os módulos operacionais centrais
  (Atendimento, Estoque, Financeiro, CRM, Zézinho analítico) — a maior parte do trabalho de
  engenharia descrito no roadmap já foi implementada, sem mock, com testes.
- **Integrações externas reais**: 2 de 7 citadas pelo usuário implementadas e com uso real
  (Stone, JumpPark); as demais são placeholders honestos, não iniciadas.
- **Uso real confirmado em produção**: concentrado em Stone (alto volume) e Estoque
  (volume moderado); Financeiro com configuração pronta mas baixíssimo volume transacional;
  núcleo de Atendimento com **zero uso real confirmado** apesar do código estar pronto.
- **Produto formal ainda inexistente**: Usuários, Permissões, autenticação individual, Agenda
  real, WhatsApp, Marketing/Ads reais.

Se a pergunta é "quanto do roadmap técnico já foi escrito e funciona sem mock": **alto, a maior
parte dos módulos centrais está lá**. Se a pergunta é "quanto do sistema está sendo usado de
verdade, todo dia, pela operação": **a evidência de dado real é concentrada em poucos módulos**
(Stone, Estoque, parte do Financeiro) — o resto é, hoje, capacidade instalada sem uso comprovado.
Essas são duas perguntas diferentes e nenhum número único as responde honestamente sem mascarar
uma das duas.

### 8. Uma nova ordem recomendada para as próximas missões (proposta, aguardando decisão do Robério)
1. **Correção da variável JumpPark na Vercel** (já diagnosticada — ação é do Robério no painel).
2. **Correção do bug de sugestão de compras** (`fetchPurchaseSuggestions`).
3. **Decisão de negócio sobre adoção do núcleo de Atendimento** — antes de construir mais em cima,
   entender por que zero uso real até agora.
4. **Consolidação dos dois CRMs** em uma única fonte de verdade.
5. **Usuários/Permissões reais**, se o RBAC hoje ausente (já auto-documentado como lacuna no
   Financeiro) for um risco aceito ou não pelo negócio.
6. Só depois disso, retomar integrações novas (WhatsApp, Agenda/Google, Marketing/Meta) — todas
   dependem de decisões de produto (não só código) que ainda não foram tomadas.

---

*Este documento não altera nenhum código, configuração ou dado. É um diagnóstico ponto-no-tempo,
04/08/2026, HEAD `ad4e5ff`. Substitui `docs/current-state-audit.md` (10/07/2026) como referência
de estado atual do sistema.*
