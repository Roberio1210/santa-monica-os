"use server";

import { answerQuestion, matchIntent, ZEZINHO_QUESTIONS, type ZezinhoAnswer } from "@/lib/zezinho/service";

export interface AskZezinhoState {
  question: string | null;
  answer: ZezinhoAnswer | null;
  error: string | null;
}

const initialState: AskZezinhoState = { question: null, answer: null, error: null };

/**
 * Só leitura: nunca cria, altera, paga ou exclui nada. Aceita tanto o id de uma pergunta rápida
 * (via botão) quanto texto livre (roteado por palavra-chave, ver matchIntent).
 */
export async function askZezinhoAction(_prevState: AskZezinhoState, formData: FormData): Promise<AskZezinhoState> {
  const questionId = String(formData.get("questionId") ?? "").trim();
  const freeText = String(formData.get("freeText") ?? "").trim();

  if (!questionId && !freeText) {
    return { ...initialState, error: "Digite uma pergunta ou escolha uma das opções rápidas." };
  }

  const resolvedQuestionId = questionId || matchIntent(freeText);
  const predefined = ZEZINHO_QUESTIONS.find((q) => q.id === resolvedQuestionId);
  const questionLabel = predefined?.label ?? freeText;

  try {
    const answer = await answerQuestion(resolvedQuestionId);
    return { question: questionLabel, answer, error: null };
  } catch (err) {
    return { question: questionLabel, answer: null, error: err instanceof Error ? err.message : "Falha ao consultar os dados." };
  }
}
