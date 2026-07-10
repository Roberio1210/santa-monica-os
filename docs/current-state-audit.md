# Auditoria do estado atual — Santa Monica OS

Auditoria realizada em 10/07/2026, ponto de partida para a fundação técnica (banco de dados,
autenticação, persistência) preparada nesta execução. Reflete o estado do repositório no commit
`e9e1ef1` (branch `main`).

## 1. Páginas e módulos existentes

| Rota | Status dos dados | Observações |
| --- | --- | --- |
| `/dashboard` | **Parcialmente real** | Receita hoje/mês vêm do JumpPark (`fetchOverviewMetrics`) quando configurado; demais cards (clientes, agenda, estoque crítico) são demonstrativos (`mock/*`). `force-dynamic`. |
| `/operacoes` | **Real** | Ordens finalizadas do dia via JumpPark (`fetchTodayOperations`). Único módulo 100% real além do estoque. `force-dynamic`. |
| `/estoque` | **Real (estático)** | 48 itens da contagem física de 10/07/2026, em repositório de memória (`StaticInventoryRepository`). Não persiste alterações. |
| `/estacionamento` | Demonstrativo | `mock/parking.ts`. Conceitualmente sobreposto a `/operacoes` (ver "Duplicações"). |
| `/lavacao` | Demonstrativo | `mock/wash.ts`. |
| `/agenda` | Demonstrativo | `mock/schedule.ts`. |
| `/clientes` | Demonstrativo | `mock/customers.ts` + `mock/vehicles.ts`. |
| `/financeiro` | Demonstrativo | `mock/finance.ts`. Não usa a receita corrigida do JumpPark. |
| `/marketing` | Demonstrativo | `mock/marketing.ts`. |
| `/compras` | Demonstrativo | `mock/purchases.ts`. |
| `/seguranca` | Demonstrativo | `mock/cameras.ts`. |
| `/zezinho` | Demonstrativo | Interface de chat sem modelo real conectado (`mock/agents.ts`). |
| `/configuracoes` | Metadados reais, sem dados operacionais | Lista integrações futuras (Meta, Google, Mercado Livre, Stone, WhatsApp, Câmeras) — todas `status: "nao_configurado"`, nenhuma chamada real. |
| `/` | Redirect | Redireciona para `/dashboard`. Nenhuma lógica própria. |

## 2. Integrações

| Integração | Estado | Observações |
| --- | --- | --- |
| JumpPark | **Ativa em produção** | `src/lib/integrations/jumppark/`. Único fornecedor de dados operacionais reais. Token/credenciais lidas via `src/lib/config/env.ts`, nunca expostas ao cliente. |
| Meta, Google, Mercado Livre, Stone, WhatsApp, Câmeras | Placeholders documentados | Cada uma é apenas um objeto `IntegrationMeta` (`src/lib/integrations/{id}/index.ts`) com `isXConfigured() => false` fixo. Nenhuma chamada de rede. Seguro por padrão. |

## 3. Rotas públicas (API)

| Rota | Expõe segredo? | Expõe PII? |
| --- | --- | --- |
| `GET /api/health` | Não | Não |
| `GET /api/jumppark/status` | Não (apenas `configured`/`reachable`/`message` genérica) | Não |

Nenhuma rota de diagnóstico temporária restante (`/api/jumppark/debug-map` foi removida em
`61265c8`). Nenhuma API de escrita existe hoje.

## 4. Maior risco de segurança atual

**Não existe nenhuma autenticação.** Todas as páginas (incluindo `/estoque`, `/operacoes`,
`/dashboard`) e ambas as rotas de API são publicamente acessíveis a qualquer pessoa com a URL de
produção. Não há middleware, não há sessão, não há login. Isso é aceitável enquanto os dados são
majoritariamente demonstrativos, mas se torna um risco real à medida que dados operacionais reais
(receita, movimentações, estoque) crescem. Esta é a motivação principal da Fase 1 do roadmap
atualizado (`docs/roadmap.md`).

## 5. Dados reais vs. demonstrativos

- **Reais**: JumpPark (`/dashboard` parcial, `/operacoes`), contagem de estoque de 10/07/2026
  (`/estoque`).
- **Demonstrativos, claramente sinalizados** com `DemoDataBadge` em toda tela que os usa: Lavação,
  Estacionamento, Agenda, Clientes, Financeiro, Marketing, Compras, Segurança, Zézinho.
- Nenhum dado real de cliente (nome, telefone, placa) foi encontrado fora do fluxo JumpPark
  mascarado (`maskPlate`/`maskPhone`, `src/lib/utils/mask.ts`) — os dados em `src/data/mock/*` são
  fictícios (nomes genéricos, já com campos `phoneMasked`/`plateMasked` pré-mascarados nos mocks).

## 6. Duplicações de tipos e mocks identificadas

1. **Estoque duplicado**: `src/types/inventory.ts` + `src/data/mock/inventory.ts` (modelo antigo,
   ainda usado por `/dashboard` para os cards "Itens críticos"/"Estoque") coexistem com
   `src/lib/inventory/types.ts` + dados reais (`src/lib/inventory/data/`). São dois modelos de
   domínio diferentes para o mesmo conceito. **Débito técnico intencional** (documentado em
   `docs/inventory-module.md`) — unificar exige migrar o dashboard para o repositório real.
2. **Estacionamento duplicado conceitualmente**: `/estacionamento` (mock, `ParkingEntry`) e
   `/operacoes` (real, `OperationOrder`) representam o mesmo domínio (movimentações de veículos)
   com esquemas diferentes e nenhuma relação de código entre si.
3. **`PaymentMethod`** está definido uma vez em `src/types/common.ts` e reutilizado
   corretamente — não há duplicação aqui, mas vale registrar que hoje só cobre dinheiro/débito/
   crédito/pix/outro; contratos B2B (Fase 3) vão precisar de um conceito de "forma de pagamento
   desconhecida", tratado nesta execução em `contracts`/`receivables` (ver
   `docs/database-architecture.md`).

## 7. Dados estáticos (fora de banco)

Todos os dados hoje vivem em arquivos TypeScript versionados:
- `src/data/mock/*.ts` — 11 arquivos de dados fictícios.
- `src/lib/inventory/data/initial-count-2026-07-10.ts` — dados reais da contagem física.

Nenhum arquivo `.json` gravável é usado como banco de dados (correto, evita a armadilha de
persistência falsa em serverless).

## 8. Débitos técnicos

1. Sem banco de dados — toda alteração de estoque é perdida a cada novo cold start em produção
   (documentado em `src/lib/inventory/static-repository.ts`).
2. Sem autenticação — ver seção 4.
3. `/estacionamento` e `/operacoes` não compartilham modelo de dados (item 6.2).
4. `/dashboard` mistura fonte real (JumpPark) e mock (`mockInventory`, `mockCustomers`,
   `mockSchedule`) na mesma tela sem um indicador por card de qual fonte alimenta cada número
   (existe apenas o badge geral "JumpPark conectado"/`DemoDataBadge`).
5. `/financeiro` ainda não usa a correção de receita (`totalRevenue`) aplicada em
   `/dashboard`/`/operacoes` — continua 100% mock.
6. Nenhum teste automatizado (unitário ou e2e) existe no projeto.

## 9. Itens que NÃO devem ser usados em produção como estão

- `StaticInventoryRepository` (`src/lib/inventory/static-repository.ts`) — persistência não
  garantida entre invocações serverless; a UI de movimentação manual já está desabilitada por
  este motivo.
- Qualquer variável de ambiente de integrações futuras (`STONE_*`, `WHATSAPP_*`, `META_*`,
  `GOOGLE_*`, `MERCADOLIVRE_*`, `CAMERAS_*`) — todas vazias em `.env.example`, nenhuma delas deve
  ser preenchida sem autorização explícita do proprietário.
- Ausência de autenticação — aceitável apenas enquanto o app é majoritariamente demonstrativo;
  deixa de ser aceitável à medida que mais dados reais (financeiro, RH, contratos) entram.

## 10. Conclusão da auditoria

O projeto está estruturalmente saudável: sem segredos versionados, sem rotas de debug residuais,
sem PII vazando em mocks, com uma separação clara entre dados reais e demonstrativos. As lacunas
são as esperadas para o estágio atual — ausência de banco de dados e de autenticação — e são o
foco desta execução (ver `docs/database-architecture.md`, `docs/privacy-and-access-control.md` e
o middleware de acesso temporário introduzido nesta tarefa).
