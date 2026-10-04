# Módulo Emergência

Central operacional de emergências da Estética Automotiva e Estacionamento Santa Mônica.

## Fase 1 (04/10/2026) — implementada

- `/emergencia` — Central mobile-first, dentro do AppShell: destaque imediato dos contatos
  críticos com telefone (190, 192, 193, 199 e Tokio Marine — Assistência 24h), "O que aconteceu?"
  (12 protocolos), outros contatos por categoria (os sem telefone recolhidos em "Contatos a
  cadastrar") e resumo do seguro.
- `/emergencia/protocolo/[slug]` — protocolo operacional: contato prioritário, aviso destacado,
  passos ordenados (críticos em destaque), "Cobertura potencialmente aplicável" sempre com a
  ressalva obrigatória.
- `/configuracoes/emergencia` — administração de contatos (criar/editar/desativar) e protocolos
  (editar/desativar). Só admin autenticado (fail-closed, mesmo padrão de
  `departamento-pessoal/actions.ts`). Nada é excluído; toda escrita grava `audit_logs` na mesma
  transação, com controle de concorrência otimista (`expectedUpdatedAt`).

### Dados

| Onde | O quê |
|---|---|
| `emergency_contacts` | Contatos administráveis. `key` = chave natural do seed. Categoria em texto validado na aplicação. |
| `emergency_protocols` | Protocolos. `slug` = URL. `potential_coverage_keys` aponta para `INSURANCE_COVERAGES`. |
| `emergency_protocol_steps` | Passos ordenados (`UNIQUE (protocol_id, position)`). |
| `src/lib/emergency/insurance.ts` | Resumo da apólice Tokio Marine 01955436 + coberturas + ressalva (configuração tipada, padrão `COMPANY_INFO`). |
| `src/lib/emergency/seed-data.ts` | Conteúdo inicial (seed, modo memória e contingência). |

Migration: `drizzle/0064_emergency_phase1.sql` (só `CREATE TYPE`/`CREATE TABLE`/FKs entre as tabelas novas).
Seed idempotente e não destrutivo: `npm run db:seed:emergency` (lógica em `src/lib/emergency/seed.ts`;
só INSERT com `ON CONFLICT DO NOTHING`, nunca UPDATE/DELETE, nunca sobrescreve registro existente).
Alterar `seed-data.ts` depois de um banco carregado não muda esse banco — a fonte de verdade passa a
ser a tela administrativa.

Ordem para produção: `npm run db:migrate` → `npm run db:seed:emergency` → deploy. Antes disso a
página já funciona em modo de contingência (conteúdo inicial + aviso).

### Regras

- Nenhum telefone inventado: só 190, 192 (SAMU), 193, 199 e 0800 31 86546 vieram do gestor. Os
  demais contatos existem sem telefone, ficam recolhidos em "Contatos a cadastrar" e nunca geram
  botão; nenhum link é renderizado para dado ausente ou inválido.
- Destaque do topo = contatos ativos de prioridade "crítica" com telefone válido; eles não se
  repetem em "Outros contatos".
- Vínculo automático protocolo → cobertura só os aprovados pelo gestor (Missão 2.1): Incêndio →
  Incêndio e eventos correlatos; Dano/Acidente com veículo → RC Garagista; Roubo/Furto → RC
  Garagista, restrita a veículo de cliente sob guarda, com ressalva. Nenhum outro protocolo tem
  vínculo; a seção geral do seguro lista todas as coberturas contratadas.
- Seguro: nunca "está coberto", "seguro vai pagar", "pode consertar", "será indenizado" (teste
  automatizado varre conteúdo e código do módulo).
- Permissões: `/emergencia` liberada para OPERACIONAL (leitura); administração só ADMIN. Com
  `INDIVIDUAL_AUTH_ENABLED` desligado, ninguém edita (leitura continua aberta).
- Performance: sem polling; Central = 2 consultas, protocolo = 3, administração = 3; sem N+1.
- Contingência: falha do banco nunca deixa a Central em branco.
- Layout ~390px: largura útil ~358px (padding `p-4` do AppShell); grades começam com 1–2 colunas
  flexíveis; títulos com "/" recebem `<wbr>`; números de telefone `whitespace-nowrap`; alvos de
  toque ≥ 48px. Validação final em aparelho real é teste manual (ver relatório da Missão 2.1).

## Próximas fases (não implementadas)

Seguro em tabela (`insurance_policies`/`insurance_coverages`) e alertas de renovação; registro de
ocorrências (`incidents`/`incident_events`); anexos (storage externo com upload direto, nunca no
Postgres); vínculo JumpPark somente leitura (sem dado confiável de pátio — ver
`jumppark-open-orders-investigation.md`); Zézinho com ferramentas somente leitura; papel
`gerente` se necessário.
