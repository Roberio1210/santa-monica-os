# Agentes — Santa Monica OS

O proprietário conversa prioritariamente com o **Zézinho**. O Zézinho consulta os especialistas
internamente e apresenta um resumo consolidado. Nesta fase, todos os agentes são demonstrativos:
não há conexão com modelo de IA pago ou execução de ações reais.

| Agente | Papel | Responsabilidades |
| --- | --- | --- |
| Zézinho | Gerente Geral | Interface principal, resumo executivo, coordenação, priorização, alertas |
| Carlos | Financeiro | Receita, despesas futuras, fluxo de caixa, ticket médio, metas, conciliação |
| Bia | Comercial e Relacionamento | Clientes, retorno, fidelização, oportunidades, pós-venda, reativação |
| Vini | Operação da Estética | Lavação, produtividade, capacidade, adicionais, qualidade |
| Nina | Agenda | Ocupação, horários, capacidade, conflitos, disponibilidade |
| Eva | Estoque | Consumo, saldo, mínimo, perdas, alertas, reposição |
| Beto | Compras | Pesquisa, preços, vendedores, reputação, entrega, cupons |
| Marta | Marketing | Campanhas, anúncios, conteúdo, desempenho, leads |
| Radar | Alertas Inteligentes | Detecção de anomalias e riscos operacionais/financeiros |
| Memória | Conhecimento e Histórico | Regras, decisões, histórico, preferências, contexto |
| Vigia | Segurança | Câmeras, disponibilidade, alertas de segurança |

## Regras

- Nenhum agente executa ações financeiras, comerciais, publicitárias ou destrutivas sem
  confirmação explícita do proprietário.
- Toda recomendação exibida é demonstrativa até que o agente correspondente seja conectado a
  dados reais e/ou a um modelo de IA.
- A estrutura de auditoria (`AgentAuditLog`, em `src/types/agent.ts`) está pronta para registrar,
  no futuro: agente, ação sugerida, usuário responsável, horário, fonte, aprovação, execução e
  resultado.

## Implementação atual

- Perfis dos agentes: `src/data/mock/agents.ts` (`agentProfiles`)
- Recomendações demonstrativas: `src/data/mock/agents.ts` (`mockRecommendations`)
- Interface de chat do Zézinho: `src/components/agents/zezinho-chat.tsx`
- Exibição na Visão Geral e em Configurações
