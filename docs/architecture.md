# Arquitetura — Santa Monica OS

## Visão

Santa Monica OS é o sistema operacional empresarial da Estética Automotiva e Estacionamento
Sta. Mônica (Florianópolis/SC). Centraliza gestão executiva, indicadores, operação, financeiro,
marketing, estoque, compras, segurança e agentes de inteligência artificial.

## Princípios

1. Modularidade — cada área é independente e expansível.
2. Segurança — credenciais somente no backend, nunca enviadas ao navegador.
3. JumpPark como fonte oficial dos dados operacionais nesta fase.
4. Somente leitura — nenhuma escrita real sem autorização futura.
5. Confirmação humana obrigatória para qualquer ação financeira, comercial, publicitária ou
   destrutiva.
6. Transparência — toda informação indica fonte, data/hora de atualização e status de sincronização.
7. Dados demonstrativos claramente identificados enquanto integrações reais não existirem.
8. Confiabilidade — nunca inventar dados ausentes; exibir "Informação indisponível".
9. Auditoria — estrutura preparada (`AgentAuditLog`) para registrar ações futuras dos agentes.
10. Privacidade — minimização de dados e mascaramento de informações sensíveis (LGPD).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 (tokens de tema em `src/app/globals.css`)
- Componentes de UI próprios em `src/components/ui` (padrão shadcn, sem geração via CLI)
- Recharts para gráficos
- Lucide para ícones
- Hospedagem: Vercel · Repositório: GitHub

## Módulos

Visão Geral, Lavação, Estacionamento, Agenda, Clientes, Financeiro, Marketing, Estoque, Compras,
Segurança (Vigia), Zézinho IA, Configurações.

## Fluxo de dados

```
JumpPark API (leitura)
  → src/lib/integrations/jumppark/client.ts   (HTTP + auth, server-only)
  → src/lib/integrations/jumppark/service.ts  (normalização de dados)
  → API Routes (src/app/api/**)               (camada de aplicação, sem token)
  → Server Components / futuros hooks         (renderização)
```

Enquanto não há integrações reais conectadas, as páginas consomem `src/data/mock/*`.

## Segurança

Ver [security.md](./security.md).

## Escalabilidade

- Camada de repositório (`src/lib/repositories`) preparada para conectar um banco de dados
  (preferencialmente PostgreSQL via Supabase, plano gratuito) sem acoplar as páginas a uma
  fonte específica.
- Agentes (`src/lib/agents`, `src/data/mock/agents.ts`) documentados e prontos para receber
  lógica real quando um modelo de IA for conectado.
- Integrações futuras isoladas em `src/lib/integrations/{meta,google,mercadolivre,stone,whatsapp,cameras}`,
  cada uma com metadados de status, permissões e riscos.
