import { describe, expect, it } from "vitest";
import { getPromptId, resolvePrompt } from "./promptIds";
import { questions, tripleTopics } from "../data/questions";
import { words } from "../data/words";

describe("reference prompt identity", () => {
  it("uses the existing stable IDs for all structured and Triple topics", () => {
    for (const question of questions)
      expect(getPromptId("structured", question.text)).toBe(question.id);
    for (const topic of tripleTopics)
      expect(getPromptId("triple", topic.text)).toBe(topic.id);
  });
  it("identifies every warm-up word without depending on a mutable position", () => {
    for (const word of words)
      expect(resolvePrompt("free", getPromptId("free", word), "")).toEqual({
        id: `word:${word}`,
        text: word,
      });
  });
  it("resolves old records by their original prompt and tolerates unknown history", () => {
    expect(resolvePrompt("structured", undefined, questions[0].text)?.id).toBe(
      questions[0].id,
    );
    expect(resolvePrompt("triple", undefined, tripleTopics[0].text)?.id).toBe(
      tripleTopics[0].id,
    );
    expect(resolvePrompt("free", undefined, "咖啡")?.id).toBe("word:咖啡");
    expect(
      resolvePrompt("structured", undefined, "一条以前手动保存的题目"),
    ).toBeUndefined();
  });
  it("does not turn invalid IDs or voice exercises into reference prompts", () => {
    expect(
      resolvePrompt("structured", "unknown", questions[0].text),
    ).toBeUndefined();
    expect(getPromptId("voice", questions[0].text)).toBeUndefined();
    expect(
      resolvePrompt("voice", questions[0].id, questions[0].text),
    ).toBeUndefined();
  });
});
