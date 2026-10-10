# Santa Monica OS — Documento de continuidade

Escrito em 10/10/2026, ao encerrar uma sessão longa do Claude Code. Atualizado no fim do mesmo dia,
após a recuperação das ordens JumpPark de setembro (seção 8). Registra só o que foi confirmado
nos arquivos do projeto ou por consulta somente leitura ao banco. Não contém credenciais.

> Antes de qualquer código, leia `AGENTS.md`: esta versão do Next.js tem APIs e convenções diferentes;
> consulte `node_modules/next/dist/docs/`.

---

## 1. Arquitetura

**Stack (de `package.json`):**
- Next.js (App Router), React, TypeScript, Tailwind CSS v4, Radix UI, Recharts, Lucide, Zod.
- Drizzle ORM com o driver `postgres`; migrations com `drizzle-kit`.
- Testes com Vitest; scripts de carga com `tsx`.
- Hospedagem na Vercel, com deploy automático a cada push em `main`.
- Repositório no GitHub: `Roberio1210/santa-monica-os`.
- Banco: Neon Postgres (ver seção 4).
- Crons em `vercel.json`: `/api/jumppark/sync` às 09:00 e `/api/stone/sync` às 10:00.

**Caminhos principais:**

| O quê | Onde |
|---|---|
| Rotas (App Router) | `src/app/*`: dashboard, estoque, financeiro, estacionamento, lavacao, agenda, planejamento, crm, clientes, ordens, operacao/operacoes, departamento-pessoal, emergencia, zezinho, assistente-gerente, painel-gerencial, marketing, compras, seguranca, configuracoes, admin |
| Schema do banco | `src/db/schema/*.ts` (índice em `src/db/schema/index.ts`) |
| Migrations | `drizzle/0000` a `0066` e `drizzle/meta/_journal.json` |
| Scripts de carga | `src/db/seed/*.ts`, todos com script `db:seed:*` no `package.json` |
| Domínio e serviços | `src/lib/<módulo>`: inventory, finance, hr, planning, emergency, crm, crm-intelligente, commercial-agent, zezinho, jumppark-orders, recipes, services, etc. |
| Integrações | `src/lib/integrations/`: jumppark, stone, whatsapp, meta, google, mercadolivre, cameras, weather |
| Documentação | `docs/*.md` (arquitetura, módulos, decisões, auditorias) |
| Dados de importação (ignorado pelo git) | `dados-importacao/` |

**Integrações confirmadas:**
- **JumpPark:** somente leitura (`src/lib/integrations/jumppark/`). Sincroniza em
  `jumppark_service_orders` e `jumppark_service_order_items`. A chave de idempotência é
  `external_id` (o `serviceOrderId`, único). O teste `read-only-guard.test.ts` impede escrita no
  JumpPark.
- **Stone:** sincronização diária (`src/lib/integrations/stone/`). A conciliação de extrato fica em
  `src/lib/finance/bankStatement/`.
- **WhatsApp:** só a Cloud API oficial da Meta. O código proíbe Evolution API e n8n
  (`architecture-guardrails.test.ts`). O webhook atende apenas o Zézinho administrativo.
- **Supabase:** nenhuma dependência no código ou em produção. Existe só o `.env.supabase.local`,
  local e ignorado pelo git.

---

## 2. Estado do Git (10/10/2026)

- `origin/main` recebeu, em 10/10, três commits da recuperação JumpPark (seção 8), todos
  publicados a partir de worktrees limpos, só com os próprios arquivos:
  - `dadbbaf` — rota de auditoria somente leitura;
  - `7fa14cc` — rota de recuperação (só INSERT);
  - o commit de encerramento, que remove as duas rotas e adiciona este documento ao repositório.
- **A cópia local em `main` ficou em `6c49397`** (atrás do `origin/main`). Os arquivos desses
  commits existem na pasta local sem commit. Antes de `git pull`, apagar as cópias locais
  não rastreadas de `src/app/api/admin/jumppark-*` e `src/lib/integrations/jumppark/gap-*`
  (iguais às publicadas) para o pull não conflitar.
- Até 06/10, o último commit era `6c49397 feat(emergency): add emergency center and operational protocols`.
- **64 arquivos com alterações locais sem commit** (modificados e novos). Os grupos são:

| Grupo | Arquivos principais | Situação |
|---|---|---|
| Emergência, Fase 1.2 (contatos operacionais, layout desktop) | `src/app/emergencia/**`, `src/components/emergency/**`, `src/lib/emergency/**` (inclui o novo `protocol-contacts.ts`), `src/db/seed/emergency-foundation.ts`, `docs/emergency-module.md` | Local. Seed **não** aplicado em produção (o dry-run previu 2 inserções, 11 atualizações e 7 sem mudança) |
| Agenda (status, histórico, painel de previsão) | `src/lib/planning/**` (`statusFlow.ts`, `outlook.ts` e `agendaLifecycle.test.ts` são novos), `src/app/planejamento/**`, `src/components/planning/**`, `src/db/schema/planning.ts` | Local. Depende da migration 0065 |
| Agente Comercial | `src/lib/commercial-agent/`, `src/db/schema/commercial.ts`, `src/lib/services/catalog.ts` | Local. Depende da migration 0066. Ainda não ligado ao WhatsApp |
| Reativação no CRM | `src/lib/crm-intelligente/reactivation.ts` e o teste | Local |
| Estacionamento (aviso de limitação do pátio) | `src/components/operations/parking-view.tsx` | Local |
| Guarda de somente leitura do JumpPark | `src/lib/integrations/jumppark/read-only-guard.test.ts` | Local |
| Estoque (marco zero, ajuste de 07/10, compra de 08/10) | `src/lib/inventory/marco-zero.ts`, `src/lib/inventory/data/*`, os testes, `src/db/seed/inventory-marco-zero-2026-10-05.ts` | Local. **Carga já aplicada em produção** (seção 3) |
| Migrations | `drizzle/0065_agenda_status_lifecycle.sql`, `drizzle/0066_commercial_campaigns.sql`, os snapshots e o `_journal.json` | Local, **sem aplicar em produção** |
| Documentação | `docs/atualizacao-integrada-2026-10-06.md`, este arquivo | Local |
| **Não alterar** (instrução do gestor) | `src/lib/finance/bankStatement/autoReconciliationBatchSimulation.test.ts`, `autoReconciliationClassifier.test.ts`, `autoReconciliationClassifier.ts` | Não rastreados. Deixar como estão |

**Migrations em produção:**
- Aplicadas até a `0064_emergency_phase1`, junto com o seed de emergência da Fase 1.1.
- **Pendentes:**
  - `0065` (aditiva): status de agenda `chegou`, `pronto`, `entregue` e `nao_compareceu`; colunas
    `resource_label`, `created_by` e `updated_by`.
  - `0066`: tabela `commercial_campaigns`, que começa vazia.

---

## 3. Estoque: carga aplicada em produção

**Script:** `npm run db:seed:inventory-marco-zero-2026-10-05`
(`src/db/seed/inventory-marco-zero-2026-10-05.ts`). Com `-- --dry-run`, só lê o banco numa transação
READ ONLY.

- **Lógica:** `src/lib/inventory/marco-zero.ts`. Aplica três sessões em ordem, numa única transação:
  1. Marco zero, contagem física de 05/10/2026 (`data/stocktake-2026-10-05.ts`);
  2. Ajuste de inventário de 07/10/2026 (`data/stocktake-2026-10-07.ts`);
  3. Compra recebida em 08/10/2026 (`data/purchase-2026-10-08.ts`).
- **Execução:** uma única vez, em 10/10/2026 entre 08:50:54 e 08:51:36 (horário local), sem erro.
  Todos os movimentos ficaram com o mesmo horário (11:50:56.864 UTC), o que confirma que foram
  gravados numa só transação.
- **Não executar de novo.** Uma nova execução não grava nada, porque cada movimento tem `externalId`
  único e os já gravados são ignorados. Mesmo assim, não há motivo para rodar.

**Proteções adotadas:**
- Antes da carga:
  - foi criado o branch de backup no Neon;
  - foi feito um backup local num diretório fora do repositório
    (`~/santa-monica-os-backups/inventario-pre-carga-20261008-232024/`), com 95 produtos, 130
    movimentações e 10 eventos de auditoria, capturado numa transação REPEATABLE READ READ ONLY e com
    manifesto SHA-256;
  - as pré-condições foram conferidas de novo antes de gravar.
- Contagens gravam o saldo absoluto: `correcao_inventario` para produtos existentes e
  `contagem_fisica_inicial` para produtos novos. Compras gravam a diferença (`compra`).
- O script nunca faz DELETE, nunca inativa produto, nunca converte peso em volume e não toca nos
  vínculos com serviços.
- Grava só em `inventory_items`, `inventory_movements` e `inventory_audit_events`.

**Auditoria pós-carga (somente leitura, comparada ao backup local):**

| | Antes | Depois |
|---|---|---|
| Produtos | 95 | 106 (+11) |
| Movimentações | 130 | 184 (+54) |
| Eventos de auditoria | 10 | 26 (+16, todos `marco_zero_cadastro_atualizado`) |

- **Movimentações por sessão:**
  - `marco-zero-2026-10-05:` 39 (30 contagens + 9 produtos novos);
  - `compra-2026-10-05:` 1;
  - `ajuste-inventario-2026-10-07:` 8;
  - `compra-2026-10-08:` 6.
- **Saldos coerentes:** para os 51 produtos movimentados, o saldo do backup, o saldo anterior e
  posterior de cada movimento e o saldo atual batem, sem nenhuma diferença.
- **O que não mudou:**
  - nenhum produto foi excluído ou inativado;
  - custo e fornecedor de produtos já existentes não mudaram;
  - as 130 movimentações e os 10 eventos de auditoria anteriores estão idênticos;
  - nenhum vínculo de produto com serviço nem serviço foi alterado em 10/10.
- **Custos:** o único custo gravado foi o do Pano de Microfibra novo, R$ 7,15/un, aprovado. Os
  preços da compra de 08/10 não foram gravados como custo: o preço do Cleather, R$ 32,20 por
  embalagem, ficou só na observação do movimento.

**Saldos finais conferidos:**
- **Zerados em 07/10, todos continuam ativos:** Delet, Blend Black Edition, Shiny, Remox (Nobrecar),
  Goodzilla e Limpador de Pano SMF.
- **Depois da compra de 08/10:**
  - Cleather 3000 ml;
  - Plástico Revitalizador Farben 2500 ml;
  - Toalha Microfibra Soft Plus 17 un;
  - Remov Piche e Cola (Farben) 2500 ml;
  - Nograx 20000 ml (zerado em 07/10, depois recebeu a compra);
  - APC 6300 ml.
- **Outros:**
  - V-Floc 5000 ml;
  - Auto Brilho 1000 ml e Polidor Fino 1750 ml (cadastro corrigido de g para ml, sem conversão);
  - Hard Cleaner Wax Xtreme 400 ml;
  - Limpador de Pano DUB Boyz 300 ml (novo);
  - Pano de Microfibra 4 un.
- **Produtos novos (11):**
  - Bubble Foam Shampoo;
  - D-Rat;
  - Eco Box Finalizador;
  - Limpador de Pano DUB Boyz;
  - Micro Soft;
  - Pano de Microfibra;
  - Protectant Leather;
  - Removedor de Chuva Ácida;
  - Replex;
  - Replin;
  - Triplo X Pro.
- **Não contados:** cerca de 36 produtos ativos que nenhuma sessão tocou ficaram exatamente como
  estavam, por instrução do gestor. Ainda falta confirmar o saldo deles.

---

## 4. Neon (sem credenciais)

- **Produção:** endpoint `ep-sweet-waterfall`, banco `neondb`.
  - Ramo main: **`br-old-term-atvuryxf`**, confirmado pelo gestor no painel. O "atvurxyf" citado
    antes era erro de digitação.
  - Os scripts leem `DATABASE_URL` de `.env.local`, que é ignorado pelo git.
- **Backups (branches no Neon, sem expiração, confirmados pelo gestor no painel em 10/10):**
  - `backup-antes-inventario-2026-10-08`, criado antes da carga de estoque;
  - `backup-antes-recuperacao-jumppark-2026-10`, criado a partir do main em 10/10/2026 às 14:49:41,
    antes da recuperação JumpPark (seção 8).
- Projeto Neon: `bold-tree-01243857` (lido de `neon.project_id` numa consulta somente leitura).
- Daqui não há ferramenta nem chave de administração do Neon: branches só se conferem no painel.
- **Banco de teste:** endpoint `ep-steep-tooth`, com `TEST_DATABASE_URL` em `.env.test.local`. É
  usado pelos testes `*.postgres.test.ts`, que sempre fazem rollback.
- O nome do projeto Neon **não foi confirmado** nesta sessão.

---

## 5. Próxima missão: planilhas de estacionamento e lavação de 2026, atualizadas até 10/10/2026

**O que já existe e foi confirmado:**
- **Tabelas:**
  - `historical_spreadsheet_wash_records`, com uma linha por atendimento: data, cliente, veículo,
    placa, serviço, valores, forma de pagamento, conferência e "valor recebido na maquininha";
  - `historical_spreadsheet_parking_records`, com uma linha por dia: crédito, débito, Pix,
    dinheiro e total.
  - As duas usam `external_id` único (`src/db/schema/historicalSpreadsheet.ts`).
- **Importação anterior:**
  - `npm run db:seed:import-historical-spreadsheet` lê os JSONs gerados por
    `dados-importacao/extract.py` (openpyxl).
  - Foi aplicada em agosto de 2026 para o período de 01/01 a 30/04/2026. Segundo
    `docs/atualizacao-integrada-2026-10-06.md`, esse período está 100% importado.
- **Arquivos atuais em `dados-importacao/`:**
  - `Planilha Estacionamento 2026.xlsx`, de 11/08;
  - `Planilha Lavação 2026.xlsx`, de 08/08;
  - os JSONs extraídos, de 11/08.
  - **As versões atualizadas até 10/10/2026 ainda não estão no projeto.**
- **Regra de precedência** (`src/lib/config/historical-source-precedence.ts` e
  `docs/historical-data-precedence.md`):
  - `DATA_CORTE_JUMPPARK = 2026-05-01`;
  - antes do corte, a planilha é a fonte oficial;
  - a partir do corte, o **JumpPark é a fonte oficial exclusiva**;
  - nunca somar as duas fontes no mesmo período.
  - As linhas de maio a outubro da planilha servem **para conferência** e nunca podem entrar como
    faturamento.

**Etapas sugeridas (só começar com autorização explícita para cada uma):**
1. Receber as planilhas atualizadas e colocá-las em `dados-importacao/` com nome novo, sem
   sobrescrever as de agosto.
2. Analisar, só lendo: abas, colunas, linhas novas de 01/05 a 10/10 e mudanças de layout em
   relação a agosto.
3. Para 01/01 a 30/04: comparar com o que já está no banco e listar diferenças. Não sobrescrever;
   correções precisam de decisão do gestor.
4. Para 01/05 a 10/10: montar uma conferência da planilha contra o JumpPark (por dia, placa e
   valor) e contra o extrato bancário. Não gravar como faturamento.
5. Fazer um dry-run do que seria gravado, aprovar, criar um backup (branch Neon e cópia local) e só
   então aplicar.

---

## 6. Regras de importação

1. **Não duplicar o JumpPark:**
   - de 01/05/2026 em diante, nenhuma linha da planilha vira faturamento, ordem ou atendimento;
   - a fonte oficial é sempre o JumpPark (`jumppark_service_orders`, chave `external_id`);
   - toda gravação deve consultar `officialHistoricalSource(date)`, sem repetir a data do corte em
     outro arquivo.
2. **Idempotência:** `external_id` estável e determinístico (aba e linha, ou data), com
   `ON CONFLICT DO NOTHING`. Rodar de novo nunca pode duplicar.
3. **Preservar o histórico:**
   - nunca DELETE nem sobrescrita silenciosa de registros já importados ou sincronizados;
   - registros do JumpPark de março e abril continuam no banco, só não são fonte oficial desse
     período;
   - correções entram como novo registro auditável, nunca como edição do original.
4. **Separar as datas, quando a planilha trouxer:** data de entrada, data de saída, data de
   pagamento e data de recebimento bancário são campos distintos.
   - Hoje as tabelas da planilha só têm `record_date`; as datas extras exigiriam uma migration
     nova, que precisa de aprovação.
   - No JumpPark existem `entry_time`, `exit_time` e `order_date`.
   - Recebimento bancário vem da conciliação Stone e do extrato, nunca deduzido da planilha.
5. **Não inventar dados:**
   - se só há totais diários, não criar tickets, veículos ou clientes individuais;
   - texto em campo numérico (por exemplo "150/150") fica guardado como texto bruto (`*_raw`);
   - serviço ambíguo fica pendente, nunca mapeado por preço ou palpite (`SAFE_SERVICE_MAPPING`).
6. **Segurança operacional:**
   - nada de escrita no JumpPark;
   - dry-run READ ONLY antes de qualquer carga;
   - uma transação por carga;
   - backup antes de gravar;
   - autorização explícita do gestor para cada gravação em produção.

---

## 7. Pendências e próximos passos, por prioridade

1. **Commit das alterações locais:** separar por grupo (seção 2), rodar os testes antes e não
   incluir os 3 arquivos de `autoReconciliation*`. Precisa de autorização.
2. **Migrations 0065 e 0066 em produção:** dry-run, backup e aplicação, depois do commit e com
   autorização. O código de agenda e do Agente Comercial depende delas.
3. **Seed de emergência da Fase 1.2 em produção:** o plano previu 2 inserções, 11 atualizações e 7
   sem mudança. Precisa de autorização.
4. **Planilhas de 2025 e 2026:** arquivos recebidos; ver o andamento e a decisão pendente na seção 9.
4a. **JumpPark:** lacuna de setembro recuperada; pendências na seção 8.
5. **Estoque:**
   - confirmar o saldo dos cerca de 36 produtos não contados;
   - definir os custos das compras de 08/10, que hoje estão sem custo;
   - avaliar quando apagar o branch de backup do Neon, só com decisão do gestor.
6. **Precedência histórica:** módulos que ainda leem o JumpPark sem filtrar pelo corte estão
   listados em `docs/historical-data-precedence.md` (consumo teórico histórico, Serviços, Clientes,
   Veículos e CRM).
7. **Decisões do gestor que seguem abertas** (`docs/atualizacao-integrada-2026-10-06.md`):
   - divergências entre o catálogo e a base comercial (`listCatalogDivergences`);
   - canal para ler o grupo de agenda (a Cloud API não lê grupos);
   - quando ligar o Agente Comercial ao WhatsApp.

### Informações não confirmadas nesta sessão
- A causa exata da falha de 21–30/09 (seção 8): falta conferir o uso de setembro no painel do Neon e
  os logs do cron na Vercel.

---

## 8. JumpPark: lacuna de sincronização de 21 a 30/09/2026 e recuperação (concluída em 10/10)

**Diagnóstico (consultas somente leitura):**
- Não houve nenhuma execução do sync entre 21/09 e 30/09 (é a única lacuna desde 08/08). Nenhuma
  tabela do banco recebeu gravação nesses dias, e o serviço voltou sozinho em 01/10, sem commit.
  Causa provável: cota mensal do Neon esgotada (o commit de 25/09 tratava de reduzir transferência).
- Como cada sync busca só os últimos 5 dias, as saídas de 20/09 (após 06:12) a 25/09 nunca entraram.
- A API do JumpPark filtra por **data de saída/pagamento**. O sync grava `order_date` = data da
  **entrada** e `exit_time` só com a hora; o payload bruto não era guardado.
- As credenciais `JUMPPARK_*` e `CRON_SECRET` são **Sensitive** na Vercel: não podem ser lidas
  localmente (nem por `vercel env run`). Consultas à API só rodam dentro da Vercel.

**Auditoria (rota temporária de admin, somente leitura) — 19/09 a 01/10:**
- API: 104 ordens finalizadas; Neon: 58. **46 ausentes, R$ 8.242,00**: estacionamento
  R$ 1.182,00 e lavação/serviços R$ 7.060,00. Por dia de saída: 21/09 2 (630,00); 22/09 4
  (2.750,00); 23/09 6 (1.300,00); 24/09 13 (1.345,00); 25/09 21 (2.217,00).
- Nenhuma divergência nas 58 já existentes; sem paginação; sem duplicidade.
- Casos examinados:
  - `55471237` (só no Neon): entrada em 30/09, saída em 02 ou 03/10, depois do período. Legítima,
    não alterada.
  - `92971209`: lavação Bronze de R$ 140 lançada no JumpPark como estacionamento (`amount` 140,
    `amountServices` 0, ordem de 43 segundos). Recuperada como veio da API; reclassificar é decisão
    do gestor, sem editar o valor de origem.
- Arquivo: `dados-importacao/auditoria-jumppark-2026-09-19_2026-10-01.json` (sha256 `d2e07a48…`).

**Backups antes da gravação:**
- Branch Neon `backup-antes-recuperacao-jumppark-2026-10` (seção 4).
- Cópia local `~/santa-monica-os-backups/jumppark-pre-recuperacao-20261010-145221/`
  (`jumppark_service_orders`, itens, `customers`, `vehicles`; REPEATABLE READ READ ONLY; manifesto
  com SHA-256 dos arquivos e MD5 calculado no banco).

**Recuperação (10/10/2026, 15:41:54, pelo gestor, com o formulário de admin):**
- Só INSERT numa transação SERIALIZABLE, a partir de uma lista fixa de 46 hashes SHA-256 dos
  identificadores (o identificador do JumpPark embute a placa). Hash do plano aprovado:
  `1b7979a3…`. Registro em `audit_logs` (`action = jumppark_gap_recovery_2026_09`).
- Mesmo mapeamento do sync; data/hora completas de entrada e saída em `raw_payload_sanitized`.
- Nenhuma chamada a sync, backfill, recálculo de clientes, consumo de estoque ou financeiro.

**Verificações depois da carga (somente leitura):**
- 46 ordens e 24 itens inseridos uma única vez: R$ 1.182,00 + R$ 7.060,00 = R$ 8.242,00.
- As 2.687 ordens e os 1.003 itens já existentes, clientes (391) e veículos (536): MD5 idêntico ao
  backup. Estoque (184 movimentações, 106 produtos), confirmações de consumo (0) e receitas
  aprovadas (0) sem alteração.
- Auditoria ao vivo repetida (`auditoria-jumppark-pos-recuperacao-2026-10-10.json`): 104/104 ordens
  da API no Neon, 0 ausentes, 0 divergências.
- Setembro no JumpPark: R$ 27.502,95 → **R$ 35.744,95**. Diferença para a planilha: R$ 54,95.
- As duas rotas temporárias (`/api/admin/jumppark-auditoria` e `/api/admin/jumppark-recuperacao`)
  foram removidas no commit de encerramento. Ficam no repositório as bibliotecas e testes
  (`src/lib/integrations/jumppark/gap-*`), sem nenhum ponto de entrada.

**Pendências desta frente:**
1. Conferir o primeiro sync depois da recuperação (11/10, 06:12): o recálculo normal vai vincular
   as 46 ordens a clientes e veículos.
2. Três estadias longas (`55471205`, `2758288`, `92971194`) ficam no dia da entrada; pela regra do
   gestor, o pagamento é do dia da saída. Exige a coluna de data/hora de saída (migration aditiva) e
   o reprocessamento das ordens desde 01/05.
3. Prevenção: alerta para dia sem sync, janela maior no cron e acompanhamento da cota do Neon.
4. Brecha: o botão "Processar agora" em `/estoque/consumo-automatico` não confere
   `INVENTORY_CONSUMPTION_MODE` (`src/app/estoque/consumo-automatico/actions.ts`). Hoje não baixa
   nada (nenhuma receita aprovada), mas deve ser corrigido.
5. Regra financeira confirmada pelo gestor: pagamento depois da meia-noite pertence à data do
   calendário em que foi feito.

## 9. Planilhas de 2025 e 2026 (andamento em 10/10)

- Etapa A (análise) concluída: jan–abr/2026 da planilha nova é idêntico ao que está no Neon
  (406 lavações, 120 dias); maio–out/2026 é só conferência (JumpPark oficial).
- Etapa 1 (importador v2) desenvolvida **localmente, sem commit**: `scripts/historical-spreadsheet/`
  (extrator por cabeçalho), `src/lib/historical-spreadsheet/` (plano com identidade por conteúdo) e
  `src/db/seed/import-historical-spreadsheet.ts` (simulação por padrão). JSONs em
  `dados-importacao/extraido-v2/`.
- Simulações: 2026 sem nada novo; 2025 teria 802 lavações (R$ 143.534) e 211 dias de
  estacionamento (R$ 68.185) novos. **Decisão pendente:** gravar 2025 faz a receita de 2025
  aparecer no DRE (`historicalRevenue.ts` lê tudo antes do corte).
