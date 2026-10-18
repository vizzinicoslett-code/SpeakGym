import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getTripleTopics,
  questions,
  questionCategories,
  tripleQuestions,
  tripleTopics,
} from "./questions";
import { contentHandles, getPromptHints } from "./promptHints";
import type { HintTag } from "./promptHints";
import { words } from "./words";
import { voiceLines } from "./voiceLines";
import type { Difficulty, TrainingType } from "../types";

const hintTags: HintTag[] = [
  "definition",
  "experience",
  "example",
  "opposite",
  "comparison",
  "cause",
  "result",
  "action",
];
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("Phase 1.1 content and lightweight thinking hints", () => {
  it("preserves every original structured prompt, identifier, category, and order", () => {
    expect(questions).toHaveLength(112);
    const originalFields = questions.map(({ id, category, text }) => ({
      id,
      category,
      text,
    }));
    // Fingerprint of the original Phase 1 content, before hint metadata was added.
    expect(hash(originalFields)).toBe(
      "b148a4df0e8056cee063d980cd13528fd5cc0e1697f0c211350d5a8006f11bfb",
    );
    for (const category of questionCategories) {
      expect(
        questions.filter((question) => question.category === category),
      ).toHaveLength(14);
    }
  });

  it("preserves all 72 original Triple Step prompts and the unchanged word and voice pools", () => {
    expect(hash(tripleQuestions.slice(0, 72))).toBe(
      "198285320581f47f677afe6c4054655f09dd1b977a06d9d1535558ce87f6d582",
    );
    expect(words).toHaveLength(420);
    expect(voiceLines).toHaveLength(72);
    expect(tripleQuestions).toHaveLength(89);
  });

  it("gives every structured question valid, distinct and useful hint tags", () => {
    for (const question of questions) {
      expect(question.hintTags.length).toBeGreaterThanOrEqual(3);
      expect(question.hintTags.length).toBeLessThanOrEqual(4);
      expect(new Set(question.hintTags).size).toBe(question.hintTags.length);
      expect(question.hintTags.every((tag) => hintTags.includes(tag))).toBe(
        true,
      );
    }
    const comparing = questions.find(
      (question) => question.id === "question-learning-10",
    )!;
    expect(comparing.hintTags).toContain("comparison");
    const habit = questions.find(
      (question) => question.id === "question-life-04",
    )!;
    expect(habit.hintTags).toContain("cause");
  });

  it("classifies every topic exactly once, keeps separate usable difficulty pools, and exposes all for Chaos", () => {
    expect(new Set(tripleTopics.map((topic) => topic.id)).size).toBe(
      tripleTopics.length,
    );
    expect(new Set(tripleTopics.map((topic) => topic.text)).size).toBe(
      tripleTopics.length,
    );
    expect(tripleQuestions).toEqual(tripleTopics.map((topic) => topic.text));
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const topics = getTripleTopics(difficulty);
      expect(topics.length).toBeGreaterThan(1);
      expect(topics.every((topic) => topic.difficulty === difficulty)).toBe(
        true,
      );
    }
    expect(getTripleTopics("chaos")).toEqual(tripleTopics);
    expect(
      ["easy", "normal", "hard"].flatMap((difficulty) =>
        getTripleTopics(difficulty as Difficulty),
      ),
    ).toHaveLength(tripleTopics.length);
  });

  it("keeps Easy concrete and personal while keeping abstract concepts available in Hard", () => {
    const easyText = getTripleTopics("easy")
      .map((topic) => topic.text)
      .join("\n");
    expect(easyText).not.toMatch(/成功|尊重|自由|成熟|责任|独立|意义/);
    for (const subject of [
      "学校",
      "学习",
      "一天",
      "菜",
      "运动",
      "宿舍",
      "朋友",
      "最近",
      "项目",
    ]) {
      expect(easyText).toContain(subject);
    }
    const hardText = getTripleTopics("hard")
      .map((topic) => topic.text)
      .join("\n");
    for (const concept of ["独立", "坚持", "固执", "尊重", "成熟", "成功"]) {
      expect(hardText).toContain(concept);
    }
  });

  it("returns only three or four short open questions, never a sample answer, for the supported modes", () => {
    for (const type of ["structured", "triple", "free"] as TrainingType[]) {
      for (const tags of [[], hintTags, [...hintTags].reverse()]) {
        const hints = getPromptHints(type, tags);
        expect(hints.length).toBeGreaterThanOrEqual(3);
        expect(hints.length).toBeLessThanOrEqual(4);
        expect(new Set(hints.map((hint) => hint.text)).size).toBe(hints.length);
        for (const hint of hints) {
          expect(hint.label.length).toBeGreaterThan(0);
          expect(hint.text.endsWith("？")).toBe(true);
          expect(hint.text.length).toBeLessThanOrEqual(32);
          expect(hint.text).not.toMatch(
            /参考答案|范文|我认为|首先|其次|总之|有一次我/,
          );
        }
      }
    }
    expect(getPromptHints("voice")).toEqual([]);
  });

  it("keeps the three structural questions and adds experience or an appropriate tagged direction", () => {
    expect(getPromptHints("structured").map((hint) => hint.label)).toEqual([
      "WHAT",
      "SO WHAT",
      "NOW WHAT",
      "个人经历",
    ]);
    expect(
      getPromptHints("structured", ["definition", "comparison", "example"])[3]
        .label,
    ).toBe("对比");
    for (const question of questions) {
      expect(
        getPromptHints("structured", question.hintTags)
          .slice(0, 3)
          .map((hint) => hint.label),
      ).toEqual(["WHAT", "SO WHAT", "NOW WHAT"]);
    }
  });

  it("offers four relevant directions without expanding into an answer or mutating shared hints", () => {
    expect(getPromptHints("triple").map((hint) => hint.label)).toEqual([
      "定义",
      "个人经历",
      "具体例子",
      "行动",
    ]);
    expect(getPromptHints("free").map((hint) => hint.label)).toEqual([
      "描述",
      "经历",
      "感受",
      "联想",
    ]);
    expect(
      getPromptHints("free", ["example", "cause"])
        .slice(0, 2)
        .map((hint) => hint.label),
    ).toEqual(["人物", "故事"]);
    const editedHints = getPromptHints("structured");
    editedHints[0].text = "changed";
    expect(getPromptHints("structured")[0].text).toBe(
      "你觉得这件事到底是什么？",
    );
    expect(contentHandles.map((hint) => hint.label)).toEqual([
      "定义",
      "例子",
      "反面",
      "结论",
    ]);
    expect(contentHandles.every((hint) => hint.text.endsWith("？"))).toBe(true);
  });
});
