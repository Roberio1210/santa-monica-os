# Visão de Produto — Santa Monica OS

Carta de operação definida por Robério (dono do produto) em 04/08/2026, durante a Missão 25.
Vale para toda decisão de engenharia deste projeto daqui em diante, não só para uma missão
específica — deve ser lida antes de propor ou executar qualquer nova funcionalidade.

## Mandato

A partir desta definição, toda decisão técnica é avaliada como a de um CTO responsável pelo
produto, não como uma tarefa isolada de desenvolvedor. Antes de implementar algo, a pergunta não
é "dá para construir isso", é:

1. Isso melhora a operação do Robério?
2. Isso economiza tempo da equipe?
3. Isso gera mais faturamento?
4. Isso reduz erros?
5. Isso torna o sistema mais inteligente?
6. Isso será realmente utilizado no dia a dia?

Se a resposta for não para a maioria dessas perguntas, a implementação deve ser questionada antes
de ser executada — inclusive quando pedida diretamente.

## O que o Santa Monica OS é

Não é apenas um ERP. É um gerente operacional inteligente: toda a operação da Sta Monica Estética
Automotiva deve ser controlável e explicável através dele.

**Regra central: nenhum número aparece sozinho.** Todo indicador mostrado em qualquer tela precisa
responder, sem exceção:
- Como esse número foi calculado?
- De onde veio?
- Quais registros geraram esse valor?

Um indicador que é só um número, sem caminho de investigação por trás, é considerado incompleto —
não uma versão aceitável de "pronto".

## Filosofia de navegação: nunca termina em um card

Todo card abre uma tela. Toda tela abre outra. Até chegar ao dado bruto. Exemplo dado pelo dono do
produto:

```
Faturamento → 23/05/2026 → Ordens do dia → Cliente → Veículo → Serviços →
Produtos utilizados → Funcionário → Pagamento → Histórico completo
```

O usuário (Robério ou Vinícius) precisa conseguir descobrir qualquer informação operacional em
poucos segundos: o que aconteceu em um dia específico, quais carros entraram/saíram, quanto foi
faturado/recebido, quais serviços foram feitos e por quem, quanto tempo demorou, qual produto foi
consumido e quanto resta, quando comprar de novo, quem não voltou, quem merece brinde/desconto/
contato, quem reclamou, quem indicou clientes, quem está parado. Nada fica escondido atrás de um
número sem caminho de clique.

## Estoque investigável

Ao abrir um produto, a expectativa é ver: quando entrou, quem cadastrou, quanto custou, quanto já
foi consumido, em quais serviços foi utilizado, consumo médio, tempo de duração, previsão de
término, quando comprar de novo, qual fornecedor historicamente vende mais barato, comparação
consumo previsto × consumo real, histórico completo.

## CRM inteligente, não uma lista

O CRM não lista clientes — descobre oportunidades: cliente sem retornar, VIP, recorrente, que
diminuiu frequência, aniversariante (do relacionamento), que indicou pessoas, com ticket alto,
parado, que merece cortesia/ligação/recuperação/oferta.

Nota honesta (válida enquanto o projeto não tiver esses dados): "cliente aniversariante" e "quem
indicou clientes" e "quem reclamou" não têm hoje uma fonte de dado real no schema — quando
implementados, devem ser declarados como não rastreados até existir o dado real correspondente,
nunca simulados.

## IA — sempre sugestão, nunca ação

A IA (Zézinho) nunca envia mensagem automaticamente. Ela só sugere, sempre gera texto editável, e
sempre explica por que aquela sugestão foi criada. Esta regra é absoluta e já está implementada
(ver `src/lib/crm-intelligente/messages.ts`, Missão 25) — deve ser preservada em qualquer evolução
futura do Zézinho ou de qualquer outro agente.

## Regras de desenvolvimento (permanentes)

- Nunca inventar dados.
- Nunca usar mock como se fosse produção — dado demonstrativo é sempre identificado como tal.
- Nunca esconder limitação — quando um dado ainda não existe, a tela diz isso explicitamente.
- Reutilizar componentes e módulos existentes em vez de duplicar.
- Documentar decisões arquiteturais.
- Manter a arquitetura limpa e preparada para crescimento.

## Modo de trabalho antes de qualquer implementação

1. Explicar o objetivo.
2. Explicar como aquilo melhora o sistema (referenciando as 6 perguntas do mandato).
3. Informar impactos.
4. Informar riscos.
5. Só então implementar.
