# Integrações — Santa Monica OS

## JumpPark (ativa nesta fase — camada preparada, sem credenciais no repositório)

- **Status**: não configurado (depende de variáveis de ambiente reais)
- **Descrição**: fonte oficial de dados operacionais do estacionamento e ordens de serviço.
- **Fonte**: API pública JumpPark — https://docs.jumpparkapi.com.br/public/
- **Modo**: somente leitura
- **Base URL**: `https://new-web.jumpparkapi.com.br`
- **Autenticação**: `Authorization: Bearer <token>`
- **Padrão de rota**: `/api/{userId}/public/establishment/{establishmentId}/...`
- **Endpoints reaproveitados de uma integração anterior já validada** (script local
  `referencias/jumppark_api.py` e `Atualizar Dashboard.command`, no repositório
  `cliente-sta-monica`):
  - `GET /reports/financial?startDate&endDate` — resumo financeiro (faturamento, veículos,
    formas de pagamento)
  - `GET /serviceorders/export/json?startDate&endDate` — ordens de serviço (estacionamento,
    lavação, martelinho)
- **Variáveis de ambiente**: `JUMPPARK_API_BASE_URL`, `JUMPPARK_API_TOKEN`,
  `JUMPPARK_API_USER_ID`, `JUMPPARK_ESTABLISHMENT_ID`, `JUMPPARK_API_ORIGIN` (tecnicamente
  opcional no código, mas **na prática obrigatória**: sem ela, credenciais corretas ainda
  tomam HTTP 401 — o painel "API Aberta" da JumpPark exige Origin/Referer autorizados. Ver
  `docs/jumppark-integration-audit-2026-08-04.md`.)
- **Implementação**: `src/lib/integrations/jumppark/`
- **Riscos**: nenhum nesta fase (somente leitura, sem exposição de token ao frontend)
- **Auditoria completa (04/08/2026)**: `docs/jumppark-integration-audit-2026-08-04.md` — linha do
  tempo confirmada por commits, teste real contra a API de produção, e achado de que
  `GET /reports/financial` está retornando HTTP 404 (endpoint possivelmente descontinuado pela
  JumpPark) mesmo com credenciais válidas.

## Meta Ads / Instagram / Facebook (planejado)

- **Descrição**: campanhas, alcance e leads.
- **Fonte**: Meta Marketing API
- **Modo**: não conectado
- **Variáveis**: `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`
- **Implementação**: `src/lib/integrations/meta/`

## Google Business Profile / Calendar / Sheets (planejado)

- **Descrição**: avaliações, Maps, agenda e planilhas de apoio.
- **Fonte**: Google Business Profile API, Calendar API, Sheets API
- **Modo**: não conectado
- **Variáveis**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- **Implementação**: `src/lib/integrations/google/`

## Mercado Livre (planejado)

- **Descrição**: pesquisa de preços e oportunidades de compra.
- **Fonte**: API oficial do Mercado Livre
- **Modo**: não conectado (sem scraping agressivo)
- **Variáveis**: `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET`
- **Implementação**: `src/lib/integrations/mercadolivre/`

## Stone (Sprint 7.0, Z1 — arquitetura/provider prontos, ainda não conectado a nenhum Diretor/tool)

- **Descrição**: conciliação financeira — vendas, recebimentos, antecipações, cancelamentos,
  chargebacks, posição de carteira e PIX.
- **Fonte**: Conciliação Cliente Stone —
  https://conciliacao.stone.com.br/reference/overview-da-api-cliente-stone
- **Modo**: somente leitura
- **Base URL**: `https://conciliation.stone.com.br/v2` (sem sandbox — a doc oficial confirma que
  não há ambiente de teste)
- **Autenticação**: HTTP Basic (API key do Portal Stone como usuário, senha vazia) + header
  `x-user-type: client`
- **Endpoint principal**: `GET /merchant/{affiliationCode}/conciliation-file/{referenceDate}` —
  arquivo diário único (XML gzip, Layout 2.2 ou 2.4), disponível só a partir de 5h do dia
  seguinte. **Não é uma API REST granular** — não existem endpoints separados por métrica.
- **PIX**: fluxo separado e assíncrono — `POST .../conciliation-file/pix/{referenceDate}` (202),
  arquivo entregue depois via webhook (`POST /webhook` para cadastro, uma vez só).
- **Rate limit**: 7 req/hora (arquivo principal, por StoneCode+data), 45 req/min (PIX).
- **Variáveis de ambiente**: `STONE_API_KEY`, `STONE_ACCOUNT_ID` (mapeado para `affiliationCode`)
- **Implementação**: `src/lib/integrations/stone/` (`types.ts`, `client.ts`, `xml.ts`, `cache.ts`,
  `logger.ts`, `service.ts` — único ponto de entrada público)
- **Riscos**: nenhum nesta fase (somente leitura, sem exposição de credencial). Saldo/agenda
  futura NÃO são fornecidos prontos pela Stone — ver
  docs/stone-integration-architecture.md, seção 3, para as decisões de arquitetura sobre isso.

## WhatsApp Business — WhatsApp Cloud API oficial da Meta (preparado, desabilitado)

- **Descrição**: agendamentos e relacionamento com clientes.
- **Fonte**: WhatsApp Cloud API oficial da Meta (Graph API) — decisão de arquitetura confirmada na
  Missão Z6.1 (auditoria: nem Evolution API nem n8n/Cloudfy existem ou são usados neste projeto).
- **Modo**: código real implementado (Missão Z6.2), mas DESABILITADO — `WHATSAPP_ENABLED=false` é
  o padrão e nenhuma variável de credencial está configurada em produção. `MessageChannel.send()`
  do canal (`whatsappCloudApiChannel`) falha fechado antes de qualquer chamada HTTP externa sempre
  que `WHATSAPP_ENABLED !== "true"`, credencial ausente, mensagem não aprovada, ou destinatário não
  resolvido.
- **Fluxo de aprovação**: nenhuma mensagem sai sem aprovação explícita e específica do gestor — ver
  `outbound_messages`/`assertMessageApproved` (Missão "Regra Absoluta de Envio"). O canal em si
  nunca é a autorização; é só o transporte, chamado depois que o gate já aprovou.
- **Variáveis**: `WHATSAPP_ENABLED`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
- **Implementação**: `src/lib/integrations/whatsapp/` (config, normalização de telefone E.164,
  resolução de destinatário por `customerId`, templates, canal, webhook), rota
  `src/app/api/whatsapp/webhook/route.ts` (GET de verificação + POST com assinatura
  `X-Hub-Signature-256`), `src/lib/management/inboundMessages.ts` (recebimento, idempotente por
  `externalMessageId`, allowlist administrativa em `whatsapp_admin_numbers` preparada mas vazia e
  não conectada a nenhuma ação nesta fase).
- **Pendências reais para ativar** (fora do escopo de código, decisão do gestor): conta Meta
  Business, número comercial verificado, credenciais reais nas variáveis acima, e então
  `WHATSAPP_ENABLED=true`.

## Intelbras / Mibo Smart (planejado — módulo Vigia)

- **Descrição**: monitoramento de câmeras via ponte local segura.
- **Fonte**: Intelbras iM3 C Black, app Mibo Smart
- **Modo**: não conectado
- **Riscos**: nunca expor porta RTSP (554) na internet; nunca versionar usuário/senha
- **Variáveis**: `CAMERAS_BRIDGE_URL`, `CAMERAS_BRIDGE_TOKEN`
- **Implementação**: `src/lib/integrations/cameras/`
