# Santa Monica OS

Sistema operacional empresarial para a **Estética Automotiva e Estacionamento Sta. Mônica**
(Florianópolis/SC). Centraliza gestão executiva, indicadores, lavação, estacionamento, agenda,
clientes, financeiro, marketing, estoque, compras, segurança e agentes de inteligência artificial.

## Recursos

- Dashboard executivo com indicadores, gráficos e alertas
- Módulos: Visão Geral, Lavação, Estacionamento, Agenda, Clientes, Financeiro, Marketing,
  Estoque, Compras, Segurança (Vigia), Zézinho IA, Configurações
- Camada segura de integração com o JumpPark (somente leitura)
- Arquitetura de agentes de IA documentada (Zézinho e especialistas)
- Dados demonstrativos claramente identificados enquanto integrações reais não estão conectadas

## Arquitetura

Ver [docs/architecture.md](./docs/architecture.md), [docs/data-model.md](./docs/data-model.md) e
[docs/integrations.md](./docs/integrations.md).

## Instalação

```bash
npm install
```

## Execução (desenvolvimento)

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm run start
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com credenciais reais (nunca commitadas):

```bash
cp .env.example .env.local
```

Ver a lista completa de variáveis por integração em
[docs/integrations.md](./docs/integrations.md).

## Segurança

- Credenciais somente no backend, nunca expostas ao frontend.
- Nenhuma ação financeira, comercial ou destrutiva é executada automaticamente.
- Detalhes completos em [docs/security.md](./docs/security.md).

## Roadmap

Ver [docs/roadmap.md](./docs/roadmap.md).

## Status

🚧 Sprint 1 (Fundação) concluída: interface, navegação, dashboard, módulos demonstrativos,
documentação e camada segura de integração JumpPark (aguardando credenciais reais para ativação).
