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

## 8. Checkpoint Z2 (concluído, commit `2796c44`) — resumo

Primeira funcionalidade Stone real e visível ao Diretor Financeiro:

- `normalize.ts` — camada intermediária **Stone XML → tipos normalizados internos** (nomes
  legíveis, ex.: `WalletPosition.Amount` → `NormalizedFinancialPosition`), separada dos tipos XML
  brutos (Z1) e dos fatos financeiros (camada seguinte). Nenhum cálculo de negócio nesta camada —
  só tradução/normalização de nomes e formatos.
- `identity.ts` — chave externa determinística por parcela (`buildTransactionExternalKey`, SHA-256
  sobre NSU + código de autorização + identificador do cliente + terminal + data de captura +
  parcela + valor) — nunca valor+data isolados, que colidem entre vendas diferentes no mesmo dia.
  Preparada desde já para servir de índice único numa futura tabela (ver seção 9.8).
- `reconciliationSummary.ts` — primeira capacidade real: `stone_reconciliation_summary`, no
  Diretor Financeiro, com fatos cents-safe (vendas brutas, valor líquido, cancelamentos,
  chargebacks, `stone_financial_position` respeitando a regra da seção 3.1 — nunca "saldo
  disponível").
- 20 cenários de teste nomeados + fixture oficial anonimizada (`__fixtures__/official-sample.ts`).

## 9. Checkpoint Z3 (concluído, commit `b0749ba`) — Agenda Financeira e Conciliação Stone × JumpPark

Objetivo do Z3: transformar os fatos normalizados da Stone (Z1/Z2) em inteligência financeira útil,
sem tocar em tela, chat, CEO Virtual, sincronização agendada ou correção automática de nada — só
cálculo e apresentação de fatos ao Diretor Financeiro. Retomado exatamente do commit `2796c44`, sem
alterar nenhuma decisão do Z1/Z2.

### 9.1 Agenda Financeira própria (`financialSchedule.ts`)

Ativo do Santa Monica OS, **nunca uma dependência da Stone** (decisão da seção 3.2, agora
implementada): opera só sobre `NormalizedConciliation[]` já buscados (nenhuma projeção além dos
recebíveis realmente presentes nos arquivos processados). Liga cada parcela prevista
(`expectedPayments`, de `FinancialTransactions`) à sua liquidação real quando existir
(`settlements`, de `FinancialTransactionsAccounts` — no Z3 sem o filtro de antecipação usado no Z2,
para cobrir toda liquidação, não só antecipada) e aos sinalizadores de cancelamento/chargeback.

Saídas, todas em `R$` (centavos internamente, nunca float impreciso):

- **`daily: DailyScheduleBucket[]`** — um bucket por `expectedPaymentDate`, com bruto previsto,
  taxas previstas, líquido previsto, valor liquidado, valor pendente, valor em atraso, contagem de
  vendas/parcelas/liquidadas-antecipadas/atrasadas/pendentes, e a diferença
  `settledAmount - netAmountExpected` — **sempre exposta, mesmo pequena**, nunca escondida.
- **`curves: FinancialScheduleCurve[]`** — quatro janelas fixas: `hoje`, `proximos_7_dias`,
  `proximos_30_dias`, `mes_atual`. Cada uma agrega os buckets diários dentro da janela — nenhuma
  curva de caixa projetada além do que os arquivos realmente contêm.
- **`limitations`** — sempre declara que a cobertura é limitada aos arquivos já processados, e
  sinaliza explicitamente quando nenhum recebível foi encontrado.

### 9.2 Estados do recebível (`receivableState.ts`) — 9 valores, ordem de precedência fixa

`chargeback` → `cancelled`/`reversed` (reversed se já havia liquidação registrada antes do
chargeback/cancelamento) → `unknown` (sem `expectedPaymentDate`) → `settled_early` /
`settled_on_time` → `overdue` / `due_today` / `scheduled` (comparados contra
`dataAvailableThroughDate`, nunca contra o relógio de parede — evita "atraso" falso durante a
defasagem de publicação do arquivo diário da Stone, de até 29h).

Simplificação deliberada e documentada: a taxonomia de 9 estados não tem um 10º estado
"liquidado com atraso" — uma parcela liquidada depois do previsto conta como `settled_on_time`,
com o atraso numérico preservado em `differenceExpectedVsSettled` (seção 9.1), em vez de inventar
um estado não pedido pelo usuário.

### 9.3 Conciliação Stone × JumpPark (`jumpparkReconciliation.ts`)

Motor de correspondência puro, sem I/O. Escopo **só cartão (débito/crédito)** — dinheiro e Pix são
estruturalmente excluídos do lado JumpPark, porque o arquivo de conciliação da Stone só cobre
transações de adquirência; incluir dinheiro/Pix geraria divergência falsa por rail diferente, não
por erro real.

Achado honesto documentado no código: o modelo real de dados do JumpPark (`OperationalOrder`) não
tem NSU, código de autorização, bandeira, número de parcelas nem terminal — então `exact_match`
(via identificadores fortes) só é alcançável, na prática, através de um vínculo não confirmado
entre `InitiatorTransactionKey` (Stone) e `serviceOrderCode`/`serviceOrderId` (JumpPark), um
detalhe de configuração de POS que este checkpoint não pode confirmar. O caminho está implementado
e testado via fixtures sintéticas — pronto, mas dormente até essa configuração ser confirmada. O
mecanismo real de correspondência hoje é o `probable_match`, por pontuação combinada de sinais
(valor, horário, método de pagamento).

12 tipos de resultado (`ReconciliationMatchType`): `exact_match`, `probable_match`, `ambiguous`,
`unmatched_jumppark`, `unmatched_stone`, `value_mismatch`, `payment_method_mismatch`,
`installment_mismatch`, `date_mismatch`, `duplicate`, `reversed`, `pending_processing`.

- **Confiança** é sempre qualitativa (`high`/`medium`/`low`) — a fonte de verdade apresentável.
  Existe também um `heuristicScore` numérico interno, usado só para ordenar candidatos durante o
  matching; é explicitamente documentado e testado como **nunca uma probabilidade**, e nunca
  exposto como tal ao Diretor Financeiro.
- **`probable_match` e `ambiguous` nunca são apresentados como certeza** — regra do usuário,
  refletida tanto no nome dos tipos quanto nos textos de fato gerados (seção 9.5).
- **Janela de processamento** (`FILE_PROCESSING_LAG_HOURS = 29`, mesma defasagem da seção 9.2):
  uma venda JumpPark sem correspondente Stone só vira `unmatched_jumppark` depois que a janela de
  processamento do arquivo do dia já deveria ter passado; antes disso, é `pending_processing` —
  nunca tratada como erro.

Algoritmo em estágios: (1) correspondência por identificador forte → (2) pontuação combinada de
sinais, com ramificação para ambíguo/estornado/divergente → (3) vendas Stone restantes sem par →
(4) detecção de duplicidade.

### 9.4 Divergências estruturadas (`divergences.ts`)

Mapeia um subconjunto de 8 dos 12 `ReconciliationMatchType` para os 11 `DivergenceType` pedidos
(o código documenta explicitamente por que `date_mismatch` e `pending_processing` nunca geram
divergência — o primeiro é tolerado dentro da janela de liquidação esperada, o segundo é uma
ausência de dado temporária, não um erro). Chargeback/estorno são derivados diretamente dos dados
Stone (independente do matching com JumpPark), e `arquivo_stone_ausente_ou_defasado` é derivado de
falhas de busca por dia.

Toda divergência nasce com `status: "identificado"` (mesma convenção do `ActionPlanStatus` da
Diretoria Inteligente) — **nunca cria conta, lançamento ou correção automaticamente**. Cada
divergência carrega tipo, prioridade, evidências, impacto financeiro, registros envolvidos,
confiança e recomendação.

### 9.5 Três novas capacidades no Diretor Financeiro

`stone_financial_schedule` e `stone_jumppark_reconciliation` somam-se a `stone_reconciliation_summary`
(Z2) em `directors/registry.ts`. **Nenhum novo Diretor foi criado** — ambas vivem no Financeiro,
como pedido. Nenhuma das três foi adicionada a `planner/capabilities.ts`'s `INTENT_CAPABILITIES`
— Sprint 7.0 continua fora do chat/CEO Virtual, por decisão do usuário.

Frases reais produzidas em `reasoning/facts.ts` (nunca inventadas — só geradas quando
`status === "ok"`):

- "Há R$ X líquidos previstos para os próximos sete dias."
- "Há R$ X líquidos previstos para os próximos trinta dias."
- "R$ X já foram liquidados no período."
- "Existem N recebível(is) pendente(s)."
- "Existem N recebível(is) em atraso."
- "Foram encontradas N correspondência(s) exata(s) entre Stone e JumpPark."
- "Foram encontradas N correspondência(s) provável(is) entre Stone e JumpPark — nunca tratadas como certeza."
- "Existem N divergência(s) que precisam de conferência."
- "N venda(s) permanece(m) como processamento pendente e ainda não deve(m) ser tratada(s) como erro."

### 9.6 Regra de valor oficial

Quando o valor líquido calculado pela Agenda Financeira diverge do valor oficial informado pela
Stone para a mesma parcela, **o dado oficial da Stone prevalece** — a diferença nunca é
"corrigida" silenciosamente, é sinalizada como divergência para auditoria humana (seção 9.4,
`diferenca_de_valor`, derivada de um resultado de conciliação `value_mismatch`).

### 9.7 O que o Z3 nunca inventa (lista de honestidade, reforçada)

Saldo em tempo real, extrato bancário, Pix direto da Conta Stone, transferência, boleto, pagamento
de despesa, disponibilidade para saque, agenda "pronta" da Stone, venda futura. Ausência de arquivo
nunca vira R$ 0,00 — vira `no_data`/lista de limitações.

### 9.8 Persistência — decisão do checkpoint

Auditados `src/lib/finance/` (repositórios memory/postgres já existentes) e
`src/db/schema/finance.ts` antes de decidir. Achado relevante: já existe uma tabela
`reconciliation_records` (comentário no schema: "Preparado para conciliação futura — ex.: extrato
Stone/banco x cash_movements. Nenhuma integração real foi implementada"), mas seu modelo
(`matched`/`unmatched`/`partial`, ligada a `cash_movement_id`) é para uma conciliação **Stone ×
livro-caixa interno**, um problema diferente da conciliação **Stone × JumpPark** construída neste
checkpoint (o par de comparação e a granularidade dos estados são outros). Reaproveitá-la sem
adaptação seria uma escolha errada, não uma economia.

**Decisão: o Z3 não persiste nada.** Agenda Financeira, conciliação e divergências continuam
sendo cálculos puros e sem estado, executados sobre janelas de arquivos Stone já buscados
(`multiDay.ts`, reaproveitando o cache do Z1) e sobre dados JumpPark já buscados no momento da
chamada. Isso é seguro porque:

1. Os arquivos-fonte da Stone já são cacheados (Z1) e imutáveis por data de referência — reprocessar
   os mesmos dias sempre produz o mesmo resultado.
2. `identity.ts` (Z2) já gera uma chave externa determinística por parcela, pronta para virar índice
   único numa tabela futura sem nenhum redesenho.
3. Nenhuma capacidade do Z3 precisa de histórico além da janela de busca (`DEFAULT_LOOKBACK_DAYS =
   30`) — não há necessidade de acumular estado entre execuções para este checkpoint.

**Plano de idempotência para o Z4**, caso a persistência se torne necessária (ex.: auditoria de
divergências ao longo do tempo, ou Agenda Financeira além de 30 dias sem re-buscar tudo):

- `stone_import_runs` — uma linha por tentativa de busca de arquivo diário (`referenceDate`,
  `status`, hash SHA-256 do arquivo bruto recebido, `importedAt`, erro sanitizado) — permite saber
  se um dia já foi processado sem repetir a chamada à Stone.
- `stone_reconciliation_results` / `stone_divergences` — append-only, chave primária/índice único
  na `buildTransactionExternalKey` (`identity.ts`) combinada com a data de referência — garante que
  reprocessar o mesmo arquivo nunca duplica um resultado ou uma divergência.
- Nenhuma dessas tabelas foi criada nesta sessão — ficam propostas para quando o Z4 (ou um
  checkpoint futuro) precisar delas de fato.

### 9.9 Testes

34 cenários nomeados obrigatórios (15 "AGENDA FINANCEIRA" + 19 "CONCILIAÇÃO", cobrindo os 12 tipos
de resultado e os limites do algoritmo), mais verificações de honestidade adicionais: clima/CRM
nunca são consultados pelo Financeiro, nenhuma integração desnecessária é acionada,
`probable_match`/`ambiguous` nunca viram certeza, ausência de arquivo nunca vira R$ 0,00, falha da
Stone (500) nunca derruba o `DirectorReport`, e JumpPark indisponível nunca inventa uma
divergência. Total do arquivo: 869 testes / 80 arquivos, `tsc --noEmit` limpo.

### 9.10 O que fica fora do Z3 (explícito)

Tela da Stone, chat/CEO Virtual, Executive State, Observer, sincronização agendada/cron, webhook
Pix público, importação automática, correção automática de divergências, baixa automática,
alteração de lançamentos financeiros, integração bancária real, nova API externa, qualquer dado
fictício em produção, e as tabelas de persistência descritas na seção 9.8 (propostas, não criadas).

## 10. Checkpoint Z4 (concluído) — persistência, importação real e entrega visível

Objetivo do Z4: transformar a arquitetura/cálculo dos checkpoints anteriores numa funcionalidade
real, persistente e visível — a primeira sprint que entrega Stone "de verdade" ao usuário final.
Retomado exatamente do commit `b0749ba`, sem refazer Z1/Z2/Z3.

### 10.1 Fluxo real confirmado (reaudição contra a documentação ao vivo)

Reconfirmado sem mudanças: `GET /v2/merchant/{affiliationCode}/conciliation-file/{referenceDate}`,
Basic Auth (chave do Portal como usuário, senha vazia) + `x-user-type: client`, gzip, sem sandbox,
arquivo do dia D publicado a partir das 5h do dia D+1. Achado novo: a Stone pode responder **307**
com `Location` para arquivo já cacheado — o `fetch` do Node já segue redirects automaticamente,
nenhuma mudança em `client.ts`.

**Webhook Pix reaudicionado ao vivo** (`/reference/cadastro-de-webhook`,
`/reference/notificação-via-webhook`): cadastro via `POST /v2/webhook` com `{url, headers}`; a
notificação (`{type:"pix", url, document, referenceDate}`) **não tem assinatura, HMAC nem
proteção contra replay documentada**. Decisão (seção 13 do pedido do usuário, fallback
pré-autorizado): **nenhuma rota pública publicada neste checkpoint** — só contrato/tipos/serviço
interno (`pix.ts`), com status `"aguardando_configuracao"`. O único mecanismo de autenticação
verificável disponível é um segredo próprio anexado ao campo `headers` do cadastro (a Stone ecoa
esse header em toda notificação futura) — implementado e testado, mas nunca ligado a uma rota.

### 10.2 Credenciais e gap de autorização (decisão registrada)

Credenciais continuam `STONE_API_KEY`/`STONE_ACCOUNT_ID`, só em variável de ambiente — nunca no
banco (mesmo padrão de todas as integrações do projeto; satisfaz "nunca sem criptografia" por
nunca tocar o banco). Auditoria confirmou: **não existe sistema real de sessão/papel em nenhum
lugar do app** (`getAuthStatus().fullAuthConfigured` é sempre `false`; nenhuma Server Action
financeira existente valida papel de usuário). As ações da Stone Conciliação recebem exatamente a
mesma proteção que toda outra ação financeira do sistema — o gate Basic Auth de `middleware.ts`
(`APP_ACCESS_ENABLED`), que cobre `/financeiro/stone-conciliacao`, `/api/stone/*` e as Server
Actions. Autorização por papel fica para quando existir autenticação completa — não é reinventada
seletivamente aqui.

### 10.3 Persistência (`src/db/schema/stone.ts`, migration `0014_illegal_mongoose.sql`)

Quatro tabelas aditivas, todas com enums mirrorados (nunca importados) dos tipos já aprovados em
Z1-Z3:

- **`stone_import_runs`** — uma linha por dia realmente buscado. Único por
  (`reference_date`, `layout`) via `onConflictDoUpdate` — reprocessar o mesmo dia nunca cria uma
  segunda linha, só atualiza. `failure_status` guarda o `StoneResultStatus` estruturado da falha
  (nunca precisa casar texto de erro para saber se foi permissão vs. falha temporária).
- **`stone_normalized_transactions`** — uma linha por parcela, única por `external_key`
  (`identity.ts`, Z2). Upsert: campos factuais (estado, liquidação) são atualizados; identificação
  nunca muda depois de criada.
- **`stone_reconciliation_results`** / **`stone_divergences`** — únicas por `natural_key`
  (montada em código, `persistence/types.ts`, nunca uma coluna composta com `NULL`, que o Postgres
  trataria como sempre distinto). Divergências: reprocessar **nunca sobrescreve** `status`/
  `assignee`/`resolution_note` de uma linha já revisada por humano — só os campos factuais
  (`evidence`, `financial_impact`, `recommendation`). Nova divergência sempre nasce `"open"`.

Nenhum XML bruto é armazenado — só `file_hash` (SHA-256 do conteúdo já normalizado, não do
gzip bruto, decisão registrada em `mapping.ts`: imune a diferenças de codificação do transporte).

### 10.4 Idempotência e concorrência

Import runs e transações usam `INSERT ... ON CONFLICT DO UPDATE` sobre índice único real — nunca
"ler antes de escrever" para decidir insert/update (evita condição de corrida em importação
concorrente do mesmo dia). Testado em `importRun.test.ts` com chamadas sobrepostas
(`Promise.all`) para o mesmo dia: nunca duplica. Reconciliação/divergências usam a mesma
estratégia por `natural_key`.

### 10.5 Pipeline de importação (`persistence/importRun.ts`)

`syncStonePeriod(fromDate, toDate, origin)`: busca o período uma única vez (`multiDay.ts`, Z3,
cache de `service.ts`, Z1) → para cada dia, abre `stone_import_runs` → normaliza → persiste
transações → fecha a execução. Depois, chama `reconcileStoneWithJumpparkForPeriod` (Z3, já
existente — reaproveita o cache em vez de buscar de novo) e persiste resultados/divergências. A
Agenda Financeira **nunca é persistida** — continua um cálculo puro sob demanda (Z3), recalculado
a partir dos arquivos já cacheados/persistidos sempre que a tela é aberta.

### 10.6 Status e saúde (`healthStatus.ts`) — 11 valores

`not_configured` / `credentials_pending` (configurado, nunca sincronizado) / `access_pending`
(falha de permissão sem nunca ter tido dado real — aguardando liberação do lado Stone) /
`auth_error` (falha de permissão depois de já ter tido dado real — credencial revogada) /
`syncing` / `temporary_failure` / `no_data` / `connected` / `stale_data` (>48h sem dado real) /
`degraded` / `healthy`. Toda distinção vem de um sinal real do histórico de `stone_import_runs`
— nunca uma suposição (`access_pending` vs. `auth_error` é honestamente derivado do histórico
"já teve sucesso antes?", não do código HTTP bruto, que `service.ts` já colapsa em
`insufficient_permission` desde o Z1).

### 10.7 Interface

- **`/financeiro/stone-conciliacao`** — Resumo (Z2), Posição Financeira (honesta, seção 3.1),
  Agenda Financeira (Z3), Conciliação com revisão manual, Divergências com revisão manual
  (nunca corrige nada sozinho), histórico de importações com reprocessamento com confirmação.
- **Configurações > Integrações** — cartão dedicado (`StoneIntegrationCard`): status real, última
  sincronização, último arquivo, período coberto, registros, última falha, ações
  testar/sincronizar/reprocessar. Nunca mostra credencial. Stone saiu da lista genérica
  "Integrações planejadas" de `/configuracoes/status` — não é mais planejada, é real.
- **Upload manual**: não implementado — a integração oficial busca o arquivo diretamente (a
  própria Stone), então a seção 6 do pedido do usuário não se aplica ("não permitir upload
  arbitrário... se a integração oficial puder buscar o arquivo diretamente").

### 10.8 Diretor Financeiro e Zézinho

Duas capacidades novas — `stone_divergences_summary`, `stone_integration_health` — somam-se às
três do Z2/Z3, todas exclusivas do Financeiro (`directors/registry.ts`, testado: nenhum outro
Diretor as possui). A partir do Z4, três das cinco capacidades Stone (`stone_reconciliation_summary`,
`stone_financial_schedule`, `stone_jumppark_reconciliation`, mais `stone_divergences_summary` em
`financial_status`) entram seletivamente em `INTENT_CAPABILITIES` para `financial_status`/
`cash_position` — nunca em intenções sem relação financeira (testado explicitamente: estoque,
clientes, clima, marketing, agenda nunca ganham capacidade Stone). `stone_integration_health`
nunca entra no chat — é dado operacional (Configurações + Diretor Financeiro), não uma pergunta
que o Zézinho responde. Quando não configurada, a ferramenta devolve `not_configured` honesto —
nunca derruba a resposta do Zézinho (mesmo padrão desde a Sprint 3.0).

### 10.9 Segurança

- **XXE**: `xml.ts` usa `fast-xml-parser` (Z1) — não implementa expansão de `DOCTYPE`/`ENTITY`
  externa por construção (não é uma limitação configurável, é uma propriedade estrutural da
  biblioteca), portanto não é explorável para XXE.
- **Limite de tamanho**: `client.ts` agora limita a descompressão gzip a 100MB
  (`gunzipSync(buffer, { maxOutputLength })`) — nunca deixa uma resposta anômala esgotar memória.
- **Logs**: `stoneLogger` nunca recebe a API key; `errorSanitized` persistido vem sempre de
  mensagens já sanitizadas (`service.ts:mapError`, decisão desde o Z1).
- **Transações de banco**: todo upsert em lote roda dentro de `db.transaction()`
  (`postgres-repository.ts`).
- **Segredos**: só em variável de ambiente, nunca no banco, nunca no cliente (todo módulo
  `server-only`).
- **CSRF**: Server Actions do Next.js validam `Origin` automaticamente — nenhuma proteção manual
  adicional necessária.
- **Autorização administrativa**: ver seção 10.2 — mesma proteção de toda ação financeira do
  sistema (gate de app), autorização por papel ainda não existe no projeto.

### 10.10 Testes (66 novos, todos reais — nenhum mockado além do HTTP da Stone/JumpPark)

`persistence/mapping.test.ts` (11), `healthStatus.test.ts` (12), `persistence/memory-repository.test.ts`
(13, idempotência/preservação de revisão), `persistence/importRun.test.ts` (9, pipeline completo
incluindo concorrência e período misto), `divergencesSummary.test.ts` (4), `pix.test.ts` (12,
autenticação por segredo/validação de payload), mais 5 testes adicionais em `registry.test.ts`/
`capabilities.test.ts` (exclusividade das capacidades Stone) e a atualização do "teste 33" de
`runDirector.test.ts` (ver seção 10.11). Total do projeto: **935 testes / 86 arquivos**.

Itens do checklist de 62 do usuário que **não se aplicam honestamente** a este projeto, em vez de
simulados:

- **Testes de UI (estados de carregamento/vazio/erro/conectado)** — este projeto nunca teve
  testes de componente/DOM (`vitest.config.ts`: `environment: "node"`, `include` só cobre
  `*.test.ts`, nunca `*.test.tsx`; nenhum `@testing-library` instalado, em nenhum checkpoint desde
  a Sprint 2.0). Verificado por leitura de código e pelo build de produção bem-sucedido, não por
  teste automatizado — mesmo padrão de toda UI já entregue neste projeto.
- **"Usuário sem permissão"/"usuário sem autorização"** — não existe sistema de papel para testar
  (seção 10.2); testar isso simularia um sistema que não existe.
- **Assinatura Pix válida/inválida, replay, evento duplicado** — não há rota pública para testar
  contra (seção 10.1); `pix.test.ts` cobre a validação de segredo/payload que EXISTE (contrato),
  não uma rota que não existe.

### 10.11 Correção de teste existente (Z2/Z3, justificada)

`runDirector.test.ts`, "teste 33" (Z2): antes verificava que **nenhum** fato `stone_` aparecia
quando a Stone falhava com 500. Isso deixou de ser verdade com a nova capacidade
`stone_integration_health` (Z4) — que existe justamente para reportar o histórico de importação
mesmo quando a chamada ao vivo falha. Corrigido para verificar que os fatos que dependem do
arquivo do dia (`stone_transaction_count`, `stone_schedule_pending_count`, etc.) continuam
ausentes, enquanto `stone_integration_health_status` honestamente reporta o estado real
(`credentials_pending` no ambiente de teste, sem nenhuma importação bem-sucedida ainda).

### 10.12 Migration aplicada e validada no Neon real

`0014_illegal_mongoose.sql` aplicado com sucesso no banco Neon deste ambiente (`npm run db:migrate`)
— 4 tabelas + 9 enums criados, confirmados por consulta direta a `information_schema`. Idempotência
validada com uma linha de teste (upsert 2x → 1 linha, removida logo em seguida). Rollback validado
em modo dry-run (`BEGIN` → `DROP TABLE`/`DROP TYPE` de todos os objetos novos → confirmado que os
4 objetos somem → `ROLLBACK`, nunca commitado) — a migration é puramente aditiva (nenhuma tabela
existente alterada), então o rollback é mecânico: `DROP TABLE stone_normalized_transactions,
stone_reconciliation_results, stone_divergences, stone_import_runs` seguido de `DROP TYPE` dos 9
enums novos, nessa ordem (FKs antes dos tipos).

### 10.13 O que fica fora do Z4 (explícito)

Rota pública de webhook Pix, sincronização agendada/cron (arquitetura pronta para receber, nunca
criada), autorização por papel (não existe no projeto), correção automática de qualquer
divergência, importação automática sem ação do usuário, integração bancária real, nova API
externa, upload manual de XML (desnecessário — a Stone é buscada diretamente).
