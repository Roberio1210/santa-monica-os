# Segurança — Santa Monica OS

## Credenciais

- Todas as credenciais vivem em variáveis de ambiente (`.env.local`, nunca versionado).
- `.env.example` contém apenas os nomes das variáveis, sem valores reais.
- `src/lib/config/env.ts` é o único ponto de leitura de variáveis sensíveis e é importado
  exclusivamente por módulos `server-only`.
- Nenhum token, senha ou chave de API é logado, retornado em respostas de API ou enviado ao
  frontend.

## Variáveis esperadas

Ver [integrations.md](./integrations.md) para a lista completa por integração.

## LGPD

- Dados pessoais de clientes (telefone, placa) são exibidos mascarados nas telas gerais.
- Minimização de dados: apenas o necessário para a operação é exibido por padrão.

## Logs

- Erros de integração nunca incluem o valor do token ou de outras credenciais.
- Mensagens de erro expõem apenas status HTTP e contexto operacional.

## Permissões e confirmação humana

- Nenhuma ação financeira, comercial, publicitária, operacional ou destrutiva é executada
  automaticamente. Toda ação sugerida por um agente exige aprovação explícita do proprietário
  (estrutura de auditoria preparada em `src/types/agent.ts`).

## Câmeras (módulo Vigia)

- Proibido expor a porta RTSP (554) diretamente na internet.
- Proibido versionar usuário/senha das câmeras.
- Transmissão ao vivo depende de uma ponte local segura ou integração oficial — não implementada
  nesta fase.

## Checklist de release

- [x] Nenhum `.env` com valores reais commitado
- [x] `.gitignore` cobre `.env*`
- [x] Nenhum token hardcoded em código-fonte
- [x] Rotas de diagnóstico (`/api/health`, `/api/jumppark/status`) não retornam segredos
