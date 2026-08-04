# Auditoria completa da integração JumpPark — 04/08/2026

Auditoria pura (sem trocar token, sem alterar variáveis na Vercel) motivada pelo achado do
proprietário ao inspecionar as variáveis reais de produção:

- `JUMPPARK_API_TOKEN` possui valor.
- `JUMPPARK_API_BASE_URL` está configurada como `https://api.example.com` (placeholder).
- `JUMPPARK_API_USER_ID` aparentemente vazia.
- `JUMPPARK_ESTABLISHMENT_ID` aparentemente vazia.

## 1. O que foi encontrado no projeto (histórico completo)

Toda referência à JumpPark no projeto foi levantada: `.env.example`, `docs/integrations.md`,
`docs/jumppark-data-map.md`, `docs/jumppark-open-orders-investigation.md`,
`docs/jumppark-sync-strategy.md`, `docs/decisions.md`, o histórico completo do git, e o script
de referência `referencias/jumppark_api.py` no repositório `cliente-sta-monica`.

### Linha do tempo confirmada por commits reais

| Data | Commit | O que prova |
| --- | --- | --- |
| 09/07/2026 | `1eef7eb` | Integração criada do zero, sem credenciais no repo. |
| 10/07/2026 06:40 | `d2749ca` | Dados reais da JumpPark passam a alimentar o dashboard. |
| 10/07/2026 07:48 | `6c252db` | **Achado crítico histórico**: a mensagem do commit diz literalmente *"A nova integração no painel JumpPark exige Origin/Referer autorizados (causa provável do HTTP 401 mesmo com token e USER_ID corretos)"*. `JUMPPARK_API_ORIGIN` foi criada exatamente para resolver isso. |
| 10/07/2026 08:06 | `acda698` | Rota de diagnóstico temporária confirma a integração respondendo em produção com dados reais (1.708 ordens, período 01/01–10/07/2026). |
| 10/07/2026 | `61265c8` | `docs/jumppark-data-map.md` documenta a estrutura real das respostas — prova definitiva de que a integração funcionou em produção nesta data. |

**Conclusão da linha do tempo**: a integração funcionou de verdade em produção em 10/07/2026,
com as 4 variáveis obrigatórias configuradas corretamente na Vercel. Alguma alteração posterior
(não documentada em nenhum commit, porque variáveis de ambiente não ficam no histórico do git)
substituiu `JUMPPARK_API_BASE_URL` por um placeholder e esvaziou `USER_ID`/`ESTABLISHMENT_ID`.

### Valores corretos confirmados

- **Base URL**: `https://new-web.jumpparkapi.com.br` — documentada em `docs/integrations.md`
  desde a criação da integração, idêntica ao script de referência, e **testada com sucesso
  agora** (seção 8).
- **Padrão de rota**: `/api/{userId}/public/establishment/{establishmentId}/...`.
- **Autenticação**: header `Authorization: Bearer <token>`.
- **Endpoints usados pelo projeto** (só estes dois, em todo o código): `GET /reports/financial` e
  `GET /serviceorders/export/json`.
- **Origin/Referer**: o script de referência (`referencias/jumppark_api.py`, linhas 42–43) envia
  `Origin: https://claude.ai` e `Referer: https://claude.ai/`. Isso não é um erro nem algo a
  esconder — é literalmente o que está autorizado hoje no cadastro "API Aberta" do painel
  JumpPark, e **é a causa mais provável do HTTP 401 atual** (ver seção 8).

### `USER_ID` e `ESTABLISHMENT_ID` são obrigatórios de verdade?

Sim, estruturalmente — não é uma validação nossa que poderia ser relaxada. Os dois entram
diretamente no path da URL (`/api/{userId}/public/establishment/{establishmentId}/...`,
`src/lib/integrations/jumppark/client.ts:43`). Sem eles a URL fica malformada e a JumpPark
nunca vai nem processar a autenticação.

## 2. Auditoria completa do código

| Item | Situação |
| --- | --- |
| Nomes das variáveis no código vs. Vercel | ✅ Idênticos — `JUMPPARK_API_BASE_URL`, `JUMPPARK_API_TOKEN`, `JUMPPARK_API_USER_ID`, `JUMPPARK_ESTABLISHMENT_ID`, `JUMPPARK_API_ORIGIN`. Nenhuma inconsistência de nome encontrada. |
| Variáveis lidas em mais de um lugar (duplicidade) | ✅ Não — só `src/lib/config/env.ts` lê `process.env.JUMPPARK_*` no projeto inteiro (confirmado por busca em todo o código-fonte). |
| Variáveis declaradas e nunca usadas | ✅ Não há nenhuma — as 5 do `.env.example` são as 5 lidas em `env.ts`. |
| Headers enviados | ✅ `Authorization: Bearer`, `Accept`, `Content-Type`, `User-Agent`; `Origin`/`Referer` só quando `JUMPPARK_API_ORIGIN` está definida (hoje, vazia → nunca enviados). |
| Timeout | ✅ 15s via `AbortController` (`client.ts:15`). |
| Retry | ⚠️ **Não existe.** Uma falha de rede ou 5xx nunca é tentada de novo. A integração Stone (`src/lib/integrations/stone/`) já tem esse padrão implementado (backoff + jitter) — não foi replicado aqui. Não é a causa do problema atual, mas é uma lacuna real. |
| Tratamento de erro | ✅ Erros HTTP viram `JumpParkRequestError` com status; erros de rede/timeout são distinguidos. Nunca inclui o token na mensagem de erro. |
| Logs | ✅ Adicionados nesta sessão (`jumpParkLogger`) — path chamado, status HTTP, causa classificada. Nunca loga token/userId/establishmentId. |
| Cache | ✅ `cache: "no-store"` — nunca cacheado, sempre ao vivo. Correto para dados operacionais do dia. |
| Endpoints obsoletos | ⚠️ **Sim — achado novo desta auditoria.** `GET /reports/financial` responde **HTTP 404** agora (seção 8), mesmo com credenciais válidas. O endpoint parece ter sido descontinuado ou movido pela JumpPark. `GET /serviceorders/export/json` continua funcionando normalmente. |
| Código morto / implementação escondida conflitante | ✅ Nenhuma encontrada — busca por qualquer outra construção de URL/fetch para a JumpPark fora de `src/lib/integrations/jumppark/client.ts` não encontrou nada. Nenhuma rota de debug esquecida (a única que existiu, `/api/jumppark/debug-map`, foi removida no commit `61265c8`, confirmado). |
| Módulos derivados (`operations-summary.ts`, `operation-detail.ts`, `historical-pattern.ts`, `wash-grouping.ts`) | ✅ Nenhum faz chamada HTTP própria — todos consomem `fetchServiceOrders`/`fetchTodayOperations` já existentes. Nenhuma duplicação de lógica de rede. |

## 3. O que depende da JumpPark vs. do nosso código

**Depende só da JumpPark (nada a corrigir no projeto):**
- Reverter/corrigir `JUMPPARK_API_BASE_URL`, `JUMPPARK_API_USER_ID`, `JUMPPARK_ESTABLISHMENT_ID`
  na Vercel (variáveis de ambiente, não código).
- `GET /reports/financial` retornando 404 — precisa ser confirmado com o suporte/documentação
  da JumpPark se o endpoint mudou de lugar ou foi descontinuado.
- Se o token atual (o que "possui valor" na Vercel) não for o mesmo testado nesta auditoria, só
  o painel da JumpPark tem o `userId` que pertence a ele.

**Depende só do nosso código (nada a esperar da JumpPark):**
- Nada bloqueante. A arquitetura, os nomes de variável e o padrão de autenticação já estão
  corretos — comprovado pelo teste real da seção 8 usando exatamente o mesmo código de produção
  (`jumpParkClient.request`), sem nenhuma alteração.
- Melhorias não-bloqueantes identificadas: adicionar retry com backoff (como a Stone já tem) e
  investigar o campo `resume`/`totalPeriod` de `/serviceorders/export/json` (seção 8) como
  possível substituto parcial do `/reports/financial` descontinuado.

## 4. Se os valores corretos não existissem — lista para recuperar no painel JumpPark

Não foi necessário usar esta lista (os valores corretos foram encontrados e confirmados por
teste real — seção 8), mas documentando conforme pedido, caso o token atual da Vercel **não**
seja o mesmo testado aqui:

1. Acessar `admin.jumppark.com.br` → **Configurações → API Aberta**.
2. Localizar a integração ativa (ou criar uma nova, se a antiga foi revogada).
3. Copiar o **User ID** da integração (não é o CPF/login do operador — é o ID numérico da
   integração, ex.: formato `52216`).
4. Copiar o **Token** — a JumpPark avisa que ele só é exibido uma vez.
5. Copiar o **Establishment ID** do estabelecimento (visível na URL do painel administrativo).
6. Confirmar qual **Origin/Referer** está autorizado para essa integração na mesma tela (campo
   de origem/domínio autorizado) — hoje é `https://claude.ai` (achado real, seção 1). Se for
   trocado para o domínio de produção (`https://santa-monica-os.vercel.app`), `JUMPPARK_API_ORIGIN`
   precisa acompanhar essa troca.

## 5. Estado das variáveis: correto vs. incorreto

| Variável | Estado relatado pelo proprietário | Deveria ser |
| --- | --- | --- |
| `JUMPPARK_API_BASE_URL` | `https://api.example.com` (placeholder) | `https://new-web.jumpparkapi.com.br` |
| `JUMPPARK_API_TOKEN` | Possui valor (não verificável por mim — Vercel trata como "Sensitive", ver seção 6) | Token de uma integração ativa no painel JumpPark |
| `JUMPPARK_API_USER_ID` | Aparentemente vazia | `52216`, se for a mesma integração testada na seção 8 |
| `JUMPPARK_ESTABLISHMENT_ID` | Aparentemente vazia | `26805`, se for a mesma integração testada na seção 8 |
| `JUMPPARK_API_ORIGIN` | Não mencionada — provavelmente vazia também | `https://claude.ai` (autorizado hoje) ou o novo domínio, se re-autorizado no painel |

## 6. Por que eu não conseguia ler as variáveis antes desta missão

`vercel env pull` e `vercel env ls` retornam essas variáveis como string vazia mesmo quando têm
valor real — o mesmo comportamento foi observado em `APP_ACCESS_ENABLED`, que está
comprovadamente `"true"` em produção (o gate HTTP 401 do site inteiro só liga com essa
variável assim) mas também lê vazia via CLI. Isso é consistente com variáveis marcadas como
**"Sensitive"** na Vercel (write-only por design — nem o dono consegue lê-las de volta via
CLI/API, só redefinir). Não é um bug do projeto nem uma falha minha em ler — é uma proteção
da própria Vercel.

## 7. Implementação escondida ou conflitante?

Não encontrada. Busca completa por qualquer segunda implementação de cliente HTTP para a
JumpPark, rota de debug esquecida, ou nome de variável alternativo não encontrou nada. A
integração tem uma única porta de entrada (`src/lib/integrations/jumppark/client.ts`), usada
por todos os módulos consumidores.

## 8. Teste real executado (não simulado)

Executado localmente contra a API real da JumpPark, usando o código de produção inalterado
(`jumpParkClient.request`), com as credenciais do script de referência
(`cliente-sta-monica/referencias/jumppark_api.py`) — **nunca persistidas em nenhum arquivo deste
projeto, nunca logadas em texto completo**. Essas credenciais podem ou não ser as mesmas que
estão hoje na Vercel (não verificável por mim, ver seção 6).

### Teste 1 — sem header Origin (reproduzindo o estado atual da Vercel: `JUMPPARK_API_ORIGIN` vazia)

- **Variáveis usadas**: `BASE_URL=https://new-web.jumpparkapi.com.br`, `USER_ID=52216`, `ESTABLISHMENT_ID=26805`, token do script de referência, `ORIGIN=(nenhum)`.
- **URL chamada**: `https://new-web.jumpparkapi.com.br/api/52216/public/establishment/26805/serviceorders/export/json?startDate=2026-08-03&endDate=2026-08-03`
- **Status HTTP**: **401 Unauthorized**

### Teste 2 — com header Origin/Referer = `https://claude.ai` (reproduzindo a configuração de 10/07/2026)

- **Variáveis usadas**: iguais ao Teste 1, mais `ORIGIN=https://claude.ai`.
- **Endpoint**: `GET /serviceorders/export/json`
- **URL chamada**: `https://new-web.jumpparkapi.com.br/api/52216/public/establishment/26805/serviceorders/export/json?startDate=2026-08-03&endDate=2026-08-03`
- **Status HTTP**: **200 OK**
- **Resposta real** (dados de hoje, 03/08/2026, já mascarando o que é pessoal neste relatório):
  - `establishment.establishmentName`: "ESTACIONAMENTO SANTA MONICA"
  - `establishment.addresses[0]`: Rua Vereador Guido Bott, Santa Mônica, Florianópolis/SC
  - 20 ordens de serviço retornadas para o dia, todas com dados reais e coerentes (veículo, valor, forma de pagamento, operador, horário de entrada/saída)
  - `resume`: `{ totalPaid: 4, totalAmount: "1710.00", totalPeriod: "85870", averagePeriod: "21467.5000" }`

- **Endpoint**: `GET /reports/financial`
- **URL chamada**: `https://new-web.jumpparkapi.com.br/api/52216/public/establishment/26805/reports/financial?startDate=2026-08-03&endDate=2026-08-03`
- **Status HTTP**: **404 Not Found**
- **Corpo da resposta real**: `{"message": "The route api/52216/public/establishment/26805/reports/financial could not be found."}`

### Conclusão do teste real

1. **O token, userId e establishmentId do script de referência ainda são válidos hoje** —
   não expiraram. Minha conclusão da missão anterior ("token expirado") estava **errada**: o
   401 que eu via antes era causado pela ausência do header Origin/Referer, exatamente como o
   commit `6c252db` já tinha diagnosticado em 10/07/2026 — eu simplesmente não tinha
   configurado `JUMPPARK_API_ORIGIN` no meu teste anterior.
2. **A causa raiz real e completa da falha em produção é a combinação de três problemas na
   Vercel, não um só**: `JUMPPARK_API_BASE_URL` como placeholder, `JUMPPARK_API_USER_ID` e
   `JUMPPARK_ESTABLISHMENT_ID` vazias, e `JUMPPARK_API_ORIGIN` também vazia (sem a qual até
   credenciais corretas tomam 401).
3. **Mesmo depois de corrigidas essas variáveis, `/reports/financial` continuará indisponível**
   (404) — isso afeta as métricas de faturamento do dia/mês na Central de Operações
   (`fetchDailyFinancial`, `fetchOverviewMetrics`), que dependem exclusivamente desse endpoint.
   `/serviceorders/export/json` (usado por Movimentações, Operação ao Vivo, diagnóstico) voltaria
   a funcionar normalmente.

## 9. O que foi alterado nesta auditoria

- **Nenhuma variável de ambiente foi escrita ou sobrescrita** (nem localmente, nem na Vercel).
- **Nenhum token foi trocado, gerado ou inventado.**
- Corrigida a mensagem de diagnóstico (`classifyJumpParkError`, HTTP 401/403): antes sugeria só
  "renove o token"; agora lista Origin/Referer ausente como causa mais provável primeiro, com
  renovação de token como segunda hipótese — refletindo o que este teste real provou.
- Este documento.

## 10. Recomendação final

Restaurar em produção (ação exclusiva do proprietário — variáveis Sensitive não podem ser
escritas por mim):

```
JUMPPARK_API_BASE_URL=https://new-web.jumpparkapi.com.br
JUMPPARK_API_ORIGIN=https://claude.ai
JUMPPARK_API_USER_ID=<confirmar se é 52216 ou o userId correspondente ao token atual>
JUMPPARK_ESTABLISHMENT_ID=<confirmar se é 26805 ou o establishmentId correspondente>
JUMPPARK_API_TOKEN=<manter o token atual, se for de uma integração ativa — ou usar o testado nesta auditoria>
```

Depois de atualizar, usar o botão **"Testar novamente"** em `/configuracoes/status` ou
**"Testar integrações agora"** em `/admin/diagnostico` para confirmar ao vivo — ambos já
mostram a causa real (incluindo a distinção entre "token rejeitado" e "endpoint não encontrado"),
sem precisar de outra sessão de auditoria.
