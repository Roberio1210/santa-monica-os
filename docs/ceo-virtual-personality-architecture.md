# Santa Monica OS — Personalidade Executiva do CEO Virtual (Sprint 6, novo foco)

Documento de arquitetura — **sem implementação**. Nenhum código foi alterado para produzir isto.
Preparado em 24/07/2026. Retomando do commit `88fa6ad` (proposta original da Sprint 6, aprovação
pendente).

## 0. Relação com `docs/ceo-virtual-architecture.md`

O usuário mudou o foco da Sprint 6: antes de `Objective`/`Mission`/`ExecutivePlan`/`ExecutiveScore`/
`ExecutiveJournal` (execução automática), ele quer primeiro a **Personalidade Executiva** — o
motor de julgamento que faz o CEO Virtual pensar como um executivo real da Santa Mônica, não como
um motor analítico neutro. Isso **não descarta** o documento anterior — ele fica pausado, e este
documento passa a ser o Z1-Z4 real da Sprint 6. A seção 4.6 daquele documento (`ManagementProfile`)
é **superada e substituída** por `ManagementPhilosophy` (seção 4.1 abaixo), mais rica — os
`Objective`/`Mission`/etc. do documento anterior, quando retomados, vão consumir este motor de
julgamento em vez de reimplementar a lógica de "o que o CEO acha disso" internamente.

## 1. O que o usuário está pedindo, em uma frase

Um modelo **determinístico** — nunca gerativo, nunca uma persona artificial, nunca uma frase
pronta desconectada de dado real — que combina **dados reais + crenças organizacionais + filosofia
de gestão + memória organizacional + nível de confiança** para responder perguntas diretas
("vale contratar?", "você investiria nisso?") com uma opinião estruturada, sempre explicando fatos,
princípios, evidências, riscos e a decisão que o CEO tomaria — e que se recusa a opinar quando não
há evidência suficiente, em vez de preencher a lacuna.

Isto **não é** um chatbot com personalidade simulada. **É** uma extensão determinística do mesmo
padrão que já existe desde o Z2: `computeExecutiveAdvice` já compõe "Se eu estivesse administrando
a empresa hoje, minha prioridade seria: X" a partir de dado real, sem geração de texto livre — a
Personalidade Executiva generaliza esse mecanismo para responder a um leque maior de perguntas
diretas, mantendo exatamente a mesma disciplina.

## 2. Auditoria — o que já existe e pode ser reaproveitado sem alteração

| Peça já construída | Onde | Por que serve à Personalidade Executiva |
|---|---|---|
| `Belief` / `SEED_BELIEFS` / `findRelevantBeliefs` | `directors/organizationalMemory/beliefs.ts` (Z3B) | É literalmente "crenças organizacionais já existentes" — já inclui cultura (CLAUDE.md) e exemplos do usuário, já com correspondência por palavras-chave pronta para reuso direto. |
| `Learning` / `recentLearnings` / `listLearnings` | `directors/organizationalMemory/learnings.ts` (Z3B) | É "aprendizados da Memória Organizacional" — já com pipeline de confirmação, nunca uma opinião nascida de um único evento. |
| `ConsolidatedReport` (risks/opportunities/recommendations/decisions/advice/reports) | `directors/types.ts`, `directors/estrategico.ts` | É "dados reais" — a única fonte de fato que a Personalidade Executiva pode consultar (nunca uma ferramenta/Diretor direto, mesma regra da seção 2 do documento anterior). |
| `computeExecutiveAdvice` / `computeExecutiveDecisions` | `directors/estrategico.ts` | Precedente exato de "opinião como composição determinística de template sobre dado real" — o padrão a generalizar, não a reescrever. |
| `Hypothesis` / `ReviewedHypothesis` / `confidenceLevel` / `limitations` | `directors/types.ts`, `directors/hypotheses.ts` | Vocabulário de confiança/evidência/limitação já maduro — a Personalidade Executiva reaproveita os mesmos tipos, nunca inventa uma escala nova. |
| `basisLabelsFor` | `directors/hypotheses.ts` | Mapeia chaves de fato para domínios legíveis ("financeiro", "operação"...) — reaproveitado para ligar o tópico de uma pergunta às evidências certas, mesma técnica já usada por `crossReview.ts`. |
| Classificação de intenção por padrão (regex/palavra-chave) | `intent/managerial.ts` | Precedente de como transformar uma pergunta em texto livre num tipo estruturado sem NLP/IA generativa — o mesmo mecanismo, estendido com os novos tipos de pergunta de opinião (seção 4.3). |
| `EvidencedClaim` | `reasoning/types.ts` | Formato de risco/oportunidade já usado em toda a Diretoria — reaproveitado para os "riscos" de uma `ExecutiveOpinion`. |
| Padrão de repositório de 4 arquivos | `src/lib/recipes/`, `directors/organizationalMemory/` | Reaproveitado sem alteração para as duas tabelas novas desta sprint (seção 4). |

**Nada do que já existe precisa mudar.** Esta sprint é 100% aditiva, mesma disciplina desde a
Sprint 2.

### 2.1 O vácuo real (o que não existe e precisa ser construído)

- Nenhuma representação de **filosofia de gestão** além de crenças pontuais — faltam as dimensões
  explícitas pedidas agora (perfil de risco, forma de investimento, prioridade entre crescimento/
  caixa/qualidade/operação).
- Nenhum classificador de **perguntas de opinião** (diferente de perguntas informativas, já
  cobertas por `intent/managerial.ts`).
- Nenhuma estrutura de **opinião** (`ExecutiveOpinion`) — `ExecutiveAdvice` é fixo (um só
  conselho, "hoje"), nunca responde a uma pergunta específica sob demanda.
- Nenhum **histórico de opiniões/decisões** persistido — é o único componente novo desta sprint
  que precisa de uma tabela dedicada além da filosofia (`ExecutiveOpinion`, seção 4.2), porque sem
  ele o CEO não tem como saber "eu já respondi algo parecido antes" e evitar se contradizer sem
  evidência nova.

## 3. Princípio central: o CEO nunca contraria os dados

Regra de arquitetura, não-negociável (decisão do usuário, mesma família de regra do
`ManagementProfile` original — seção 4.6 do documento anterior):

> Crenças e filosofia de gestão **nunca** alteram um fato, uma evidência, uma direção
> (`FactDirection`) ou um `confidenceLevel`. Elas só influenciam **qual conclusão, entre as que os
> dados já permitem, o modelo escolhe** — e como desempata quando os dados sozinhos não decidem.

Concretamente: se os dados mostram um risco real, nenhuma filosofia "agressiva" pode fazer o CEO
dizer que não há risco — ele pode dizer "existe o risco, mas dado nosso perfil mais agressivo, a
oportunidade ainda compensa" (uma ênfase honesta sobre dado real), nunca "não há risco" (uma
negação do dado). Toda regra de decisão (seção 5) é desenhada para nunca violar isto.

## 4. Entidades novas

### 4.1 `ManagementPhilosophy` — substitui `ManagementProfile` (seção 4.6 do documento anterior)

Registro único ativo por instalação (sem multiusuário, mesmo escopo já assumido antes).

```
ManagementPhilosophy {
  id
  managementStyle: "conservador" | "equilibrado" | "agressivo"      // filosofia de gestão
  riskAppetite: "conservador" | "equilibrado" | "agressivo"          // perfil de risco
  investmentStance: "cauteloso" | "moderado" | "proativo"            // forma de investimento
  priorityOrder: ("crescimento" | "caixa" | "qualidade" | "operacao")[]  // ordem de prioridade — sempre as 4, sem repetição, decisão explícita do usuário
  updatedAt
}
```

Campos deliberadamente **fora** desta entidade porque já existem em outro lugar, nunca duplicados:

- **Cultura da empresa** e **forma de atendimento** → já são `Belief`s reais (categorias
  `"atendimento"`, e as demais já semeadas desde o Z3B) — a Personalidade Executiva lê `Belief`s
  por categoria em vez de repetir esse conteúdo aqui.
- **Princípios de tomada de decisão** → também são `Belief`s (ex.: "qualidade acima da
  velocidade") combinados com a regra da seção 3 ("nunca contrariar os dados") — não é um campo
  novo, é a forma como `ManagementPhilosophy` + `Belief` + dado real se combinam (seção 5).
- **Aprendizados** → `Learning` (Z3B), já existe.
- **Histórico de decisões tomadas** → `ExecutiveOpinion` (seção 4.2), novo.

Valor padrão sem configuração (nunca um viés assumido silenciosamente, mesma honestidade do
`ManagementProfile` original): `managementStyle: "equilibrado"`, `riskAppetite: "equilibrado"`,
`investmentStance: "moderado"`, `priorityOrder: ["qualidade", "caixa", "operacao", "crescimento"]`
— esta ordem padrão só porque reflete os princípios não-negociáveis já documentados no cliente
("qualidade acima de volume", nunca prometer o que não pode entregar); **decisão que preciso da
sua confirmação** (seção 8, pergunta 1) antes do Z1.

### 4.2 `ExecutiveOpinion` — a opinião estruturada + o histórico de decisões

```
ExecutiveOpinion {
  id
  askedAt
  question: string                    // texto original da pergunta
  questionType: OpinionQuestionType   // classificado, seção 4.3
  factsObserved: Fact[]                // "quais fatos observou"
  principlesUsed: Belief[]             // "quais princípios utilizou" — crenças reais que bateram no tópico
  philosophyFactors: string[]          // quais dimensões da ManagementPhilosophy pesaram (ex.: "perfil de risco: conservador"), sempre rastreável
  memoryReferences: Learning[]         // aprendizados usados, quando existirem
  evidenceFactKeys: string[]           // "quais evidências sustentam sua conclusão"
  risks: EvidencedClaim[]              // "quais riscos existem"
  conclusion: string | null            // "qual seria sua decisão se fosse o CEO" — composição determinística (seção 5), nunca texto gerado livremente; null quando insufficientEvidence
  confidenceLevel: ConfidenceLevel
  insufficientEvidence: boolean        // true → conclusion é null e a resposta é honesta sobre a lacuna, nunca preenchida
  limitations: string[]
}
```

Persistida — é o "histórico de decisões tomadas" pedido pelo usuário. Antes de emitir uma nova
opinião sobre um tópico já respondido, o motor consulta o histórico (seção 5.4): se a conclusão
mudaria sem nenhuma evidência nova desde a última vez, isso é declarado explicitamente na resposta
("mudei de avaliação porque X mudou" ou "mantenho a mesma leitura de antes") — nunca uma
contradição silenciosa.

### 4.3 `OpinionQuestionType`

```
OpinionQuestionType =
  | "o_que_fazer"            // "O que você faria?"
  | "vale_contratar"         // "Vale contratar?"
  | "vale_investir"          // "Você investiria nisso?"
  | "qual_prioridade"        // "Qual seria sua prioridade?"
  | "momento_adequado"       // "Você acha esse momento adequado?"
  | "concorda_com_estrategia" // "Você concorda com essa estratégia?"
```

Classificado por padrão determinístico (regex/palavra-chave), exatamente como
`intent/managerial.ts` já faz para intenções informativas — nunca um modelo de linguagem
decidindo o tipo. Pergunta que não casa com nenhum padrão conhecido não vira uma opinião —
devolve, honestamente, que o tipo de pergunta não é reconhecido ainda (mesma disciplina de nunca
inventar uma resposta para algo fora do escopo mapeado).

## 5. O motor de decisão — como uma opinião nasce

Uma função pura por `OpinionQuestionType` (mesmo espírito de `computeExecutiveAdvice`/
`computeExecutiveDecisions`), sempre seguindo os mesmos 6 passos:

1. **Reunir fatos relevantes** — filtra `ConsolidatedReport` (facts/risks/opportunities/
   hypotheses/reviewedHypotheses) pelo domínio da pergunta, reaproveitando `basisLabelsFor` para
   ligar tópico → chaves de fato, mesma técnica de `crossReview.ts`.
2. **Reunir princípios relevantes** — `findRelevantBeliefs` (já existe, Z3B) sobre o texto da
   pergunta + sobre os fatos encontrados no passo 1.
3. **Checar evidência mínima** — sem fatos relevantes o suficiente (mesmo limiar conceitual de
   `MIN_FACTS_FOR_CONCLUSIVE` em `hypotheses.ts`), `insufficientEvidence: true`, `conclusion: null`,
   resposta honesta sobre a lacuna — **o motor para aqui**, nunca segue adiante.
4. **Aplicar a regra de decisão do tipo** — staged e explicável (nunca uma pontuação obscura),
   combinando o sinal real (passo 1) com a dimensão certa da `ManagementPhilosophy` (passo 2 mais
   a filosofia) só para desempatar ou calibrar tom de cautela — nunca para inverter o sinal (regra
   da seção 3). Exemplos concretos, um por tipo:
   - **`vale_contratar`**: exige sinal real de capacidade operacional (`staffing_capacity`) e/ou
     ritmo financeiro (`goal_progress`). Sem nenhum dos dois, evidência insuficiente. Com sinal de
     equipe sobrecarregada + meta em ritmo bom, conclusão pende para "sim"; `riskAppetite`
     conservador eleva a régua de confiança exigida antes de recomendar "sim".
   - **`vale_investir`**: exige oportunidade real evidenciada (`opportunities` com prioridade
     média/alta). `investmentStance` decide o tom ("proativo" recomenda mesmo com confiança média;
     "cauteloso" exige confiança alta) — nunca inventa a oportunidade que não existe.
   - **`qual_prioridade`**: reaproveita `ConsolidatedReport.decisions` diretamente (já é
     exatamente essa pergunta, Z2) — `priorityOrder` da filosofia só desempata quando duas
     prioridades do dia têm o mesmo `PriorityLevel`.
   - **`momento_adequado`**: compara o sinal atual (risco vs. oportunidade no domínio da pergunta)
     contra `recentLearnings`/`memoryNote` (tendência real) — "momento adequado" exige tendência
     favorável confirmada, nunca um instante isolado.
   - **`concorda_com_estrategia`**: three-way honesto — dados **sustentam** (há oportunidade/
     hipótese real no mesmo domínio), dados **contrariam** (há risco real no mesmo domínio), ou
     **sem evidência** (domínio da estratégia não aparece em nenhum sinal atual — o caso mais
     comum para uma estratégia nova, e a resposta correta é dizer isso, nunca fingir avaliar).
   - **`o_que_fazer`**: generaliza `computeExecutiveAdvice` — com um tópico específico na
     pergunta, filtra por ele; sem tópico, é literalmente o conselho do dia já existente.
5. **Compor a conclusão** — string determinística, mesma técnica de `computeExecutiveAdvice`
   (`lowerFirst`, interpolação de campos reais) — nunca uma frase de um banco de frases prontas,
   nunca uma variação criativa entre execuções idênticas (mesma entrada → mesma saída, sempre).
6. **Registrar** (`ExecutiveOpinion`, seção 5.4) e devolver.

### 5.4 Consistência com o histórico

Antes do passo 4, o motor busca a última `ExecutiveOpinion` do mesmo `questionType` (+ mesmo
domínio, quando aplicável) no próprio histórico. Se a nova conclusão diverge da anterior:
- **Com evidência nova real desde então** → a divergência é esperada e é dita explicitamente
  ("na última vez o cenário era X; hoje Y mudou, por isso a leitura é diferente").
- **Sem evidência nova** → o motor não diverge sem motivo: mantém a leitura anterior e declara
  isso ("mantenho a mesma avaliação de [data]") — nunca uma opinião instável por acaso de
  recomputação.

## 6. Fluxo completo

```
Pergunta (texto livre, ex.: "vale contratar mais um lavador?")
      ↓
questionClassifier.ts → OpinionQuestionType (ou "não reconhecido" — honesto, para aqui)
      ↓
service.ts (askExecutiveOpinion) chama runDiretoria() — SEMPRE a Diretoria inteira, mesma regra
de "o CEO não consulta dados diretamente" do documento anterior
      ↓
DiretoriaRunResult { consolidated, organizationalMemory }
      ↓
relevance.ts liga o tópico da pergunta a fatos/riscos/oportunidades/crenças/aprendizados reais
      ↓
Regra de decisão do tipo (seção 5) — combina dado + filosofia + memória + confiança
      ↓
ExecutiveOpinion { factsObserved, principlesUsed, philosophyFactors, evidenceFactKeys, risks,
conclusion, confidenceLevel, insufficientEvidence, limitations }
      ↓
service.ts persiste no histórico (ExecutiveOpinion) — único ponto de I/O deste módulo
      ↓
(Fora do escopo desta sprint) narrador transforma ExecutiveOpinion em prosa que "não parece um
chatbot" — a estrutura entregue aqui é o que torna isso possível, mesma divisão de trabalho de
sempre entre estrutura (aqui) e prosa (narrador, checkpoint futuro)
```

## 7. Roadmap proposto — Sprint 6 (novo foco)

- **Z1 — Fundação: `ManagementPhilosophy`**: `ceo/philosophy/types.ts`, schema aditivo
  (`management_philosophy`, registro único), repositório (4 arquivos, mesmo padrão), valores
  padrão neutros. Testes. Nenhum motor de opinião ainda.
- **Z2 — Classificação + relevância**: `ceo/opinion/types.ts` (`ExecutiveOpinion`,
  `OpinionQuestionType`), `questionClassifier.ts` (padrão determinístico, mesmo estilo de
  `intent/managerial.ts`), `relevance.ts` (liga pergunta → fatos/crenças/aprendizados reais via
  `basisLabelsFor`/`findRelevantBeliefs`). Testes cobrindo classificação correta e o caso "pergunta
  não reconhecida". Ainda sem decisão/conclusão — só reunir o material.
- **Z3 — Motor de decisão**: uma regra staged e explicável por `OpinionQuestionType` (seção 5.3),
  sempre com ramo de evidência insuficiente, sempre respeitando a regra da seção 3 ("nunca
  contrariar os dados"). Testes extensivos por tipo, incluindo casos de filosofia diferente
  produzindo tom diferente sobre o mesmo dado (nunca conclusão oposta ao dado).
- **Z4 — Histórico + integração final**: schema aditivo (`executive_opinions`), persistência +
  consulta de consistência (seção 5.4), `service.ts:askExecutiveOpinion()` completo, os testes de
  aceitação de praxe, quality gate completo, documentação, validação no Neon, commit, push. Ainda
  sem conexão ao chat vivo/UI — decisão explícita de escopo, mesma disciplina de toda a Sprint 5.0
  e do documento anterior desta sprint.

Depois de aprovado e validado — a conexão ao chat vivo e a retomada de `Objective`/`Mission`/
`ExecutivePlan`/`ExecutiveScore`/`ExecutiveJournal` (agora consumindo este motor de julgamento em
vez de reimplementar lógica de opinião) ficam para os checkpoints seguintes.

## 8. Decisões que preciso da sua confirmação antes de começar

1. **Ordem padrão de `priorityOrder`** sem configuração — proponho `["qualidade", "caixa",
   "operacao", "crescimento"]` (seção 4.1), baseada nos princípios já documentados no cliente.
   Confirma essa ordem padrão, ou prefere outra?
2. **Os 6 `OpinionQuestionType`** cobrem os exemplos que você deu. Existe alguma outra categoria
   de pergunta que você já sabe que vai precisar (além dessas 6) para eu já prever o classificador
   no Z2?
3. **`concorda_com_estrategia` sem nenhuma evidência relacionada** (o caso mais comum para uma
   estratégia nova) — confirmo que a resposta correta é "não tenho dados para avaliar essa
   estratégia com segurança" em vez de qualquer tentativa de opinar mesmo com baixa confiança?
4. Este módulo fica em `src/lib/zezinho/ceo/` (mesma pasta prevista no documento anterior para o
   CEO Virtual) — confirma, ou prefere um caminho separado enquanto os dois documentos não se
   fundem de vez?

Nenhuma implementação foi iniciada. Aguardando sua aprovação desta arquitetura (e das decisões
acima) para começar pelo checkpoint Z1.
