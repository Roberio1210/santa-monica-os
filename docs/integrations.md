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
  `JUMPPARK_API_USER_ID`, `JUMPPARK_ESTABLISHMENT_ID`
- **Implementação**: `src/lib/integrations/jumppark/`
- **Riscos**: nenhum nesta fase (somente leitura, sem exposição de token ao frontend)

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

## Stone (planejado)

- **Descrição**: conciliação financeira.
- **Fonte**: Stone API
- **Modo**: não conectado
- **Variáveis**: `STONE_API_KEY`, `STONE_ACCOUNT_ID`
- **Implementação**: `src/lib/integrations/stone/`

## WhatsApp Business (planejado)

- **Descrição**: agendamentos e relacionamento com clientes.
- **Fonte**: WhatsApp Business Platform (Meta)
- **Modo**: não conectado (envio real exigirá aprovação humana)
- **Variáveis**: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`
- **Implementação**: `src/lib/integrations/whatsapp/`

## Intelbras / Mibo Smart (planejado — módulo Vigia)

- **Descrição**: monitoramento de câmeras via ponte local segura.
- **Fonte**: Intelbras iM3 C Black, app Mibo Smart
- **Modo**: não conectado
- **Riscos**: nunca expor porta RTSP (554) na internet; nunca versionar usuário/senha
- **Variáveis**: `CAMERAS_BRIDGE_URL`, `CAMERAS_BRIDGE_TOKEN`
- **Implementação**: `src/lib/integrations/cameras/`
