# Santa Monica OS — Integração Stone (Sprint 7.0)

Documento de arquitetura + Checkpoint Z1 (arquitetura, provider, tipagens, plano de integração —
**nenhum código conectado a Diretores/tools/UI ainda**). Baseado exclusivamente na documentação
oficial: https://conciliacao.stone.com.br/reference/overview-da-api-cliente-stone.

## 1. O que a API realmente é (achado central, antes de qualquer desenho)

Diferente do que uma lista de "endpoints por métrica" sugere, a API "Conciliação Cliente Stone"
**não é uma API REST granular** (não existe `/saldo`, `/pix`, `/cartoes` como recursos
independentes). É, na prática, duas coisas:

1. **Um arquivo diário único** — `GET /merchant/{affiliationCode}/conciliation-file/{referenceDate}`
   — devolve um XML (gzip) com **todas** as transações, eventos financeiros, pagamentos,
   cancelamentos e chargebacks daquele dia. Layout 2.4 (o que usamos — decisão da seção 3) também
   inclui `WalletPosition` (posição de carteira/saldo).
2. **Um fluxo assíncrono separado para PIX** — `POST /merchant/{document}/conciliation-file/pix/
   {referenceDate}` pede a geração do arquivo (202 Accepted); o arquivo fica pronto ~30 min depois
   e é entregue via **webhook** (não por polling) com uma URL pré-assinada para download direto.

Isso significa: **não existe** um "saldo em tempo real" nem uma "agenda financeira" prontos —
ambos precisam ser **derivados** por nós a partir dos fatos brutos que a Stone entrega. Essa
descoberta molda toda a arquitetura abaixo e já foi validada com você (seção 3).

### 1.1 Autenticação e ambiente

- **Base URL**: `https://conciliation.stone.com.br/v2` (não existe ambiente de sandbox — a doc é
  explícita: "Hoje ainda não oferecemos um ambiente de teste para integração").
- **Autenticação (Cliente Stone, nosso caso — nunca o fluxo de parceiro/conciliador)**: HTTP Basic
  Auth com a API key como usuário e senha vazia (`Authorization: Basic base64("<key>:")`).
- **Header obrigatório**: `x-user-type: client` (a doc destaca este como o erro mais comum quando
  omitido).
- **Recomendado**: `Accept-Encoding: gzip`.
- **Variáveis de ambiente** (já reservadas desde o stub original, `src/lib/integrations/stone/
  index.ts`): `STONE_API_KEY`, `STONE_ACCOUNT_ID` (mapeado para o `affiliationCode`/StoneCode da
  documentação).

### 1.2 Limites e erros (moldam cache/timeout/retry)

- **Rate limit — arquivo principal**: 7 requisições/hora, por combinação exata (StoneCode +
  data de referência). Ultrapassar devolve 429.
- **Rate limit — PIX**: 45 requisições/minuto.
- **Códigos de erro documentados**: 400 (parâmetro ausente/inválido), 401 (credencial incorreta),
  403 (forbidden), 429 (rate limit), 500 (erro interno), 503 ("tente novamente às 4h" — o serviço
  atualiza dados de madrugada).
- **Disponibilidade**: o arquivo do dia D só pode ser pedido a partir de 5h do dia D+1 (PIX: 3h do
  dia D+1). Pedir antes disso é um erro de uso nosso, não uma falha da Stone.

## 2. As 11 informações pedidas — mapeadas contra a documentação real

| Pedido do usuário | Cobertura real | Fonte |
|---|---|---|
| Cartões / vendas | `FinancialTransactions.Transaction` (+ `Poi`, `BrandId`, `InstallmentType`) | Arquivo diário |
| Recebimentos (repasses) | `Payments.Payment` (+ `FavoredBankAccount`) | Arquivo diário |
| Antecipações | `WalletTypeId` (variantes "Antecipação" por bandeira) + `EventType` 17-20 (`PrepaymentDisbursement`/`Withdraw`/`Deposit`/`Fee`) + campos `AdvanceRateAmount`/`AdvancedReceivableOriginalPaymentDate` em `FinancialTransactionsAccounts` | Arquivo diário |
| Conciliação | O arquivo inteiro É a conciliação | Arquivo diário |
| PIX recebidos | Arquivo CSV separado, campos `pix_transaction__*` | Fluxo PIX (assíncrono + webhook) |
| Cancelamentos | `Cancellations` (+ `Billing` quando cancelado fora do dia de captura) | Arquivo diário |
| Chargebacks | `Chargeback`/`ChargebackRefund` | Arquivo diário |
| Vendas por período | **Sem endpoint de intervalo** — a API é só por dia; um "período" é N chamadas diárias agregadas por nós | Composição nossa |
| Resumo diário | **Sem endpoint pronto** — computado por nós a partir do arquivo do dia (`Trailer` já traz contadores, mas não um resumo de negócio) | Composição nossa |
| Saldo disponível | **Sem saldo em tempo real** — `WalletPosition.Amount` (Layout 2.4) é a posição do último arquivo processado, nunca "agora". Decisão do usuário (seção 3.1): nunca chamar isso de "saldo disponível" | Arquivo diário (2.4) |
| Saldo futuro / agenda financeira | **Sem endpoint dedicado** — só calculável comparando `PrevisionPaymentDate` (previsto) com `PaymentDate` (efetivo) ao longo de múltiplos dias acumulados. Decisão do usuário (seção 3.2): vira um cálculo do Diretor Financeiro, não da Stone | Derivado pelo Diretor Financeiro |

## 3. Decisões já confirmadas com o usuário

### 3.1 `WalletPosition` nunca é "saldo disponível"

O campo existe (`Amount`, "valor total do saldo", só no Layout 2.4) mas reflete a posição do
**último arquivo diário processado** — nunca o saldo em tempo real. Regra travada:

- Nunca aparece no sistema como "Saldo disponível" ou "Saldo em tempo real".
- Aparece sempre como **"Última posição financeira processada pela Stone"**, sempre junto de:
  valor, data de referência do arquivo, hora em que nosso sistema processou o arquivo, e um aviso
  explícito de que não representa saldo em tempo real.
- Sem nenhum arquivo processado ainda: `status: "no_data"` — nunca uma estimativa.

### 3.2 Agenda Financeira é um ativo do Santa Monica OS, não uma dependência da Stone

A Stone **não fornece** agenda de recebíveis futuros nem saldo futuro prontos. O usuário decidiu:
construir uma **Agenda Financeira própria**, calculada pelo **Diretor Financeiro** (nunca pela
camada de integração) a partir dos fatos brutos que a Stone entrega — `PrevisionPaymentDate`,
`PaymentDate`, `Amount`, tipo da transação (via `Installments`/`FinancialTransactionsAccounts`).

A partir desses fatos, o Diretor Financeiro (não a Stone, não o provider) calcula: valores
previstos por dia, valores efetivamente recebidos, atrasos (previsto vs. efetivo), antecipações,
média de recebimento, curva de caixa. **Isto fica fora do escopo do Z1** — o Z1 só garante que os
fatos brutos necessários (`PrevisionPaymentDate`/`PaymentDate`/`Amount`/tipo) estão tipados e
disponíveis; o cálculo em si é um checkpoint futuro do módulo financeiro, não deste documento.

## 4. Arquitetura de camadas — regra "ninguém conhece a Stone além do provider"

```
src/lib/integrations/stone/
  types.ts     — Header, Transaction, Poi, Cancellations, Billing, Installments, Chargeback,
                 ChargebackRefund, Event (FinancialEvents), Payment, FavoredBankAccount,
                 WalletPosition, Trailer, ConciliationFile (raiz), PixTransaction,
                 WebhookNotificationPayload, enums (EventType, WalletTypeId, WalletNatureId),
                 StoneResultStatus — nenhum "any", nenhum tipo do Zézinho importado aqui
                 (mesma independência de camada de integrations/weather e integrations/jumppark)
  client.ts    — HTTP puro: Basic Auth, header x-user-type, timeout, gunzip, parse XML→objeto
  xml.ts       — fast-xml-parser + mapeamento para os tipos de types.ts (nunca `any` no meio do
                 caminho — todo campo passa por um mapper explícito)
  cache.ts     — TTL cache em memória, mesmo padrão de integrations/weather/cache.ts
  logger.ts    — log estruturado, mesmo padrão de integrations/weather/logger.ts, nunca loga a chave
  service.ts   — ÚNICO ponto de entrada público (getConciliationFile, getWalletPosition,
                 requestPixFile) — todo o resto do sistema só importa daqui, nunca de client.ts
  index.ts     — metadado da integração (IntegrationMeta, já existe desde antes)
```

**Regra do usuário, reforçada pela estrutura**: nenhum módulo fora de `integrations/stone/` importa
`client.ts`/`xml.ts` diretamente — só `service.ts`. Idêntico ao que já vale para clima
(`getWeatherForecast()` é a única porta de entrada) e JumpPark (`jumpParkClient`/`service.ts`).

### 4.1 Status — o mesmo padrão desde a Sprint 4/5, sem inventar um novo

Reaproveitado **literalmente** o enum já usado em todo resultado de ferramenta do Zézinho
(`ToolResultStatus`, `src/lib/zezinho/tools/types.ts:80`) — replicado localmente em
`stone/types.ts` como `StoneResultStatus` (mesma independência de camada que `WeatherResultStatus`
já pratica, nunca um import cruzado `integrations/` → `zezinho/`):

```
StoneResultStatus = "ok" | "not_configured" | "temporary_failure" | "stale_data"
                   | "insufficient_permission" | "no_data"
```

Mapeamento real por cenário:
- `not_configured` — `STONE_API_KEY`/`STONE_ACCOUNT_ID` ausentes.
- `ok` — arquivo obtido e parseado com sucesso.
- `temporary_failure` — erro 500/503/timeout/network.
- `stale_data` — arquivo servido do cache além de um limite de "frescor" (arquivo de dias
  passados nunca muda, então isto na prática só se aplica quando o cache serve uma leitura antiga
  por indisponibilidade momentânea da Stone — nunca finge que é dado novo).
- `insufficient_permission` — 401/403 (credencial errada ou sem permissão para o merchant).
- `no_data` — 404 (arquivo ainda não gerado, ex.: pedido antes das 5h) ou `WalletPosition`
  ausente do arquivo (Layout 2.2 não traz esse container).

### 4.2 Cache — "não chamar a Stone desnecessariamente"

Diferente do clima (dado muda a cada minuto), um arquivo de conciliação de uma data passada **é
imutável** — uma vez obtido, nunca precisa ser buscado de novo. Estratégia:

- Chave: `affiliationCode:referenceDate:layout`.
- TTL: **sem expiração** para datas já fechadas (ontem ou antes) — uma vez em cache, fica até o
  processo reiniciar. Para a data de hoje (arquivo do dia anterior ainda "quente", já que só fica
  disponível às 5h), TTL curto (ex.: 15 min), para não bater 7x/hora à toa enquanto o usuário
  navega.
- Nunca cacheia erro/indisponibilidade — só respostas `ok`.

### 4.3 Timeout

Mesmo padrão de `jumppark/client.ts` (`AbortController` + `setTimeout`) — 15s para o arquivo
principal (pode ser um XML grande), 10s para as chamadas de PIX/webhook (payloads pequenos).

## 5. Fluxo até Financeiro/Estratégico/Reflection Engine/Executive State/CEO Virtual — sem duplicar lógica

```
StoneProvider (service.ts) — só fatos brutos tipados, nenhum cálculo de negócio
        ↓
Diretor Financeiro (runDirector, capacidade nova — Z2+) — único responsável por transformar fato
bruto em Fact/Finding/Diagnóstico/Hipótese/Agenda Financeira, exatamente como já faz com
JumpPark/Contas a Pagar/Receber hoje
        ↓
DirectorReport.facts (Fact[], já existe desde a Sprint 3.0) — os fatos da Stone entram como Facts
igual a qualquer outro Fact, mesma forma, mesmo pipeline
        ↓
Diretor Estratégico / Reflection Engine / Executive State / CEO Virtual — CONTINUAM SEM MUDANÇA
NENHUMA — eles já consomem Fact/DirectorReport/ConsolidatedReport genericamente, nunca sabendo
de onde um Fact veio (JumpPark, clima, Stone — tanto faz). Nenhuma dessas camadas precisa saber
que a Stone existe.
```

Isto é a resposta direta à regra 12 do pedido ("toda nova informação deve ficar imediatamente
disponível para Financeiro/Estratégico/Reflection Engine/Executive State/CEO Virtual sem duplicar
lógica"): como todas essas camadas já operam sobre `Fact`/`DirectorReport` genéricos (desde a
Sprint 3.0/5.0), **conectar uma fonte nova nunca exige tocar nelas** — só o Diretor Financeiro
ganha uma capacidade nova que sabe ler `ConciliationFile`/`WalletPosition` e produzir `Fact`s no
mesmo formato de sempre. Nenhuma lógica financeira é escrita duas vezes porque só o Diretor
Financeiro calcula; a Stone só fornece.

## 6. Roadmap — Sprint 7.0

- **Z1 (este checkpoint)** — arquitetura, `types.ts` completo, `client.ts`/`xml.ts`/`cache.ts`/
  `logger.ts`/`service.ts` funcionais e testados isoladamente, `getStoneEnv()`. **Nada conectado**
  a Diretores/tools/UI. Testes unitários + de integração (contra HTTP mockado — sem credencial
  real disponível).
- **Z2** — Nova capacidade no Diretor Financeiro (`stone_conciliation` ou similar, seguindo o
  mesmo padrão de `Capability`/`CAPABILITY_TOOL` da Sprint 3.0), tradução de `ConciliationFile`
  para `Fact[]` (vendas do dia, recebimentos, cancelamentos, chargebacks) — primeira funcionalidade
  real e visível (dado Stone aparecendo no Financeiro).
- **Z3** — `WalletPosition` honesto na UI ("Última posição financeira processada pela Stone") +
  início da Agenda Financeira (cálculo de previsto vs. efetivo, atrasos) no Diretor Financeiro.
- **Z4** — Fluxo PIX completo (registro de webhook, rota receptora, download do arquivo assinado),
  Agenda Financeira completa (antecipações, média de recebimento, curva de caixa), testes de
  aceitação, quality gate final, documentação, commit/push. Ainda com decisão pendente de onde a
  rota webhook pública vai morar (`/api/webhooks/stone-pix` — implica expor um endpoint público,
  peço sua confirmação nesse checkpoint antes de criar).

## 7. O que fica fora do Z1 (explícito)

- Nenhuma capacidade nova em `planner/capabilities.ts`/`directors/registry.ts` — o Diretor
  Financeiro não aprende sobre Stone ainda.
- Nenhuma tela nova — Z1 não tem UI.
- Nenhuma tabela nova no banco — a integração em si não persiste nada (mesmo padrão de
  `integrations/weather`, que também não tem tabela própria).
- Nenhuma chamada de rede real acontece nesta sessão (não há credencial `STONE_API_KEY` real
  configurada neste ambiente) — os testes usam HTTP mockado, mesmo padrão de
  `weather/service.test.ts`.
- Fluxo de webhook PIX: tipagem do payload pronta, registro/rota receptora ficam para o Z4 (exige
  uma decisão de infraestrutura — endpoint público — que ainda não foi confirmada).
