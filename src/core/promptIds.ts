import { questions, tripleTopics } from "../data/questions";
import { words } from "../data/words";
import type { TrainingType } from "../types";

/** Stable IDs use the existing question IDs and the unchanged word itself. */
export function getPromptId(
  type: TrainingType,
  prompt: string,
): string | undefined {
  if (type === "structured")
    return questions.find((question) => question.text === prompt)?.id;
  if (type === "triple")
    return tripleTopics.find((topic) => topic.text === prompt)?.id;
  if (type === "free" && words.includes(prompt)) return `word:${prompt}`;
  return undefined;
}

export function resolvePrompt(
  type: TrainingType,
  promptId: string | undefined,
  prompt: string,
): { id: string; text: string } | undefined {
  const foundId = promptId ?? getPromptId(type, prompt);
  if (type === "structured") {
    const question = questions.find((item) => item.id === foundId);
    return question && { id: question.id, text: question.text };
  }
  if (type === "triple") {
    const topic = tripleTopics.find((item) => item.id === foundId);
    return topic && { id: topic.id, text: topic.text };
  }
  if (type === "free") {
    const word = foundId?.startsWith("word:") ? foundId.slice(5) : undefined;
    return word && words.includes(word)
      ? { id: foundId!, text: word }
      : undefined;
  }
  return undefined;
}
