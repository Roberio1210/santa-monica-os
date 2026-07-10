# Estratégia de sincronização JumpPark → banco interno

Arquitetura preparada em 10/07/2026 para sincronizar ordens finalizadas do JumpPark
(`fetchTodayOperations`, já em produção em `/operacoes`) com o banco interno
(`jumppark_service_orders`, `src/db/schema/jumppark.ts`). **Nenhum cron ou sincronização
automática foi criado nesta tarefa** — apenas o modelo de dados e esta estratégia documentada, à
espera de autorização explícita do proprietário para ativação.

## Por que sincronizar (e não só consultar a API a cada acesso)

Hoje `/operacoes` e `/dashboard` chamam a API do JumpPark a cada requisição (`force-dynamic`).
Isso funciona, mas tem limites: sem histórico consultável localmente, sem cruzamento com
`contracts`/`receivables` (ex.: contar quantas "Lavação parceria IESA" ocorreram no mês para
conferir a fatura), e dependente de o JumpPark estar no ar no momento exato da consulta. Uma
cópia local sincronizada resolve os três pontos, mantendo o JumpPark como fonte de verdade.

## Idempotência

`jumppark_service_orders.external_id` (= `serviceOrderId` do JumpPark) é **`UNIQUE`** no banco
(ver `drizzle/0000_initial_schema.sql`). Toda sincronização deve usar
`INSERT ... ON CONFLICT (external_id) DO UPDATE` (upsert), nunca `INSERT` simples. Isso garante
que:

- Rodar a sincronização do mesmo intervalo de datas duas vezes nunca cria ordens duplicadas.
- Se uma ordem já sincronizada mudar de situação no JumpPark (ex.: `financialSituationName`
  passa de `"Pendente"` para `"Pago"`), o upsert atualiza o registro existente em vez de criar um
  segundo.

## Prevenção de duplicidade além da chave única

Além da constraint `UNIQUE`, a rotina de sincronização deve:

1. Buscar o intervalo de datas a sincronizar a partir do último `jumppark_sync_logs` com
   `status = 'success'` (campo `dateRangeEnd`), evitando reprocessar tudo desde o início a cada
   execução.
2. Sempre reprocessar pelo menos 1–2 dias para trás do último sucesso (o JumpPark pode atualizar
   `financialSituationName` de ordens de dias recentes após o fechamento), mesmo que isso
   signifique alguns upserts "sem mudança" — idempotência (item acima) torna isso seguro.

## Status, tentativas e erro sanitizado

Cada execução da sincronização cria uma linha em `jumppark_sync_logs`:

- `status`: `running` → `success` | `partial` (alguns dias sincronizados, outros falharam) |
  `error` (falha total).
- `attempt`: incrementado a cada nova tentativa do mesmo intervalo de datas após falha —
  permite política de retry com backoff (não implementada ainda) sem perder o histórico de
  tentativas anteriores.
- `errorMessage`: **sempre sanitizado**. Deve conter apenas status HTTP e uma descrição curta
  (ex.: `"Falha na requisição (HTTP 502)"`, no mesmo padrão já usado em
  `/api/jumppark/status` e `JumpParkRequestError`) — nunca o token, header `Authorization`,
  corpo da resposta bruto ou qualquer dado de cliente.
- `ordersFetched` / `ordersInserted` / `ordersUpdated`: contadores simples para auditoria rápida
  sem precisar reprocessar os dados.

## Preservação do payload bruto

`jumppark_service_orders.rawPayloadSanitized` (jsonb, nullable) existe para eventuais campos
futuros que a interface ainda não usa, mas **só deve ser preenchido quando o payload já estiver
sanitizado** (sem `clientName`/`clientPhone` em claro — usar as versões já mascaradas, como
`plateMasked`/`clientPhoneMasked`, que já são o padrão de todo o resto do sistema). Guardar o
JSON bruto da API tal como ela devolve NÃO é seguro por padrão, porque a API retorna nome e
telefone completos do cliente (`clientName`, `clientPhone`) — a sincronização deve montar esse
campo a partir do mesmo objeto `OperationOrder` já mascarado que alimenta `/operacoes`
(`src/lib/integrations/jumppark/service.ts`), nunca a partir da resposta HTTP crua.

## Origem dos dados

Todo registro criado por esta sincronização usa `source = "jumppark"` (coluna já presente em
`jumppark_service_orders`, ver `src/db/schema/common.ts`), distinguindo-o de eventuais correções
manuais futuras (`source = "manual"`).

## Reprocessamento

Como a chave de idempotência é `external_id`, reprocessar um intervalo de datas específico (ex.:
depois de corrigir um bug na sincronização) é seguro: basta rodar a rotina novamente para aquele
intervalo — os upserts corrigem os registros existentes, nenhuma duplicata é criada. Não é
necessário apagar dados antes de reprocessar.

## O que NÃO foi implementado nesta tarefa

- Nenhum cron/job agendado (Vercel Cron, etc.) — precisa de autorização explícita do proprietário
  antes de rodar automaticamente contra a API de produção do JumpPark.
- Nenhuma rotina de upsert real (`syncJumpParkOrders()`) — apenas o modelo de dados
  (`jumppark_service_orders`, `jumppark_sync_logs`) e esta estratégia estão prontos.
- Nenhuma política de retry com backoff exponencial — o campo `attempt` existe para viabilizar
  isso no futuro, mas a lógica de repetição não foi escrita.

## Próximo passo

Quando autorizado: (1) implementar `syncJumpParkOrders(startDate, endDate)` em
`src/lib/integrations/jumppark/sync.ts`, reaproveitando `fetchTodayOperations`/
`fetchServiceOrders` já existentes; (2) registrar um `jumppark_sync_logs` por execução; (3) só
então avaliar se um cron da Vercel deve chamar essa rotina automaticamente, ou se permanece
manual/sob demanda por enquanto.
