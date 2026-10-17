import { describe, expect, it } from "vitest";
import { questionCategories, questions, tripleQuestions } from "./questions";
import { words } from "./words";
import { emotions, voiceLines } from "./voiceLines";

describe("curated offline content", () => {
  it("includes at least 100 unique, identifiable structured prompts across all eight categories", () => {
    expect(questions.length).toBeGreaterThanOrEqual(100);
    expect(new Set(questions.map((question) => question.id)).size).toBe(
      questions.length,
    );
    expect(new Set(questions.map((question) => question.text)).size).toBe(
      questions.length,
    );
    expect(questionCategories).toEqual([
      "日常生活",
      "学习",
      "人际关系",
      "观点",
      "经历",
      "抽象思考",
      "科技",
      "校园",
    ]);
    for (const category of questionCategories) {
      expect(
        questions.filter((question) => question.category === category).length,
      ).toBeGreaterThanOrEqual(10);
    }
    expect(
      questions.every((question) =>
        questionCategories.includes(question.category),
      ),
    ).toBe(true);
    expect(
      questions.every(
        (question) =>
          question.text.length >= 10 && /[\u4e00-\u9fff]/.test(question.text),
      ),
    ).toBe(true);
  });

  it("includes at least 60 distinct main topics for Triple Step", () => {
    expect(tripleQuestions.length).toBeGreaterThanOrEqual(60);
    expect(new Set(tripleQuestions).size).toBe(tripleQuestions.length);
    expect(
      tripleQuestions.every((text) => text.length >= 10 && text.endsWith("？")),
    ).toBe(true);
  });

  it("includes at least 300 unique ordinary Chinese words without whitespace or punctuation", () => {
    expect(words.length).toBeGreaterThanOrEqual(300);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((word) => /^[\u4e00-\u9fff]{1,5}$/.test(word))).toBe(
      true,
    );
  });

  it("includes at least 60 distinct voice lines with a present keyword and lossless pause hints", () => {
    expect(voiceLines.length).toBeGreaterThanOrEqual(60);
    expect(new Set(voiceLines.map((line) => line.text)).size).toBe(
      voiceLines.length,
    );
    for (const line of voiceLines) {
      expect(line.keyword.length).toBeGreaterThan(0);
      expect(line.text).toContain(line.keyword);
      expect(line.pauseText).toContain("/");
      expect(line.pauseText.replace(/\s*\/\s*/g, "")).toBe(line.text);
    }
  });

  it("offers every requested emotion and speaking intention", () => {
    expect(new Set(emotions).size).toBe(emotions.length);
    expect(emotions).toEqual(
      expect.arrayContaining([
        "自信",
        "认真",
        "兴奋",
        "温柔",
        "怀疑",
        "坚定",
        "好奇",
        "说服别人",
        "安慰别人",
        "挑战别人",
      ]),
    );
  });
});
