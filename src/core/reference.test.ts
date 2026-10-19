import { describe, expect, it } from "vitest";
import { loadReference } from "./reference";
import { questions, tripleTopics } from "../data/questions";
import type { ReferenceContext } from "./referenceTypes";

const base: ReferenceContext = {
  type: "structured",
  prompt: questions[0].text,
  completed: true,
  interruptWords: [],
};
describe("completed-only offline reference lookup", () => {
  it("returns no answer for unfinished training, voice mode, or unknown old prompts", async () => {
    expect(await loadReference({ ...base, completed: false })).toBeUndefined();
    expect(await loadReference({ ...base, type: "voice" })).toBeUndefined();
    expect(
      await loadReference({ ...base, prompt: "已经移除的自定义题目" }),
    ).toBeUndefined();
  });
  it("loads the matching structured expression by ID, including older history without an ID", async () => {
    const byId = await loadReference({ ...base, promptId: questions[0].id });
    const legacy = await loadReference(base);
    expect(byId).toEqual(legacy);
    expect(byId?.type).toBe("structured");
    if (byId?.type === "structured")
      expect(byId.answer.length).toBeGreaterThan(100);
  });
  it("loads natural warm-up examples and their expansion paths from both halves of the word bank", async () => {
    for (const word of ["咖啡", "蜻蜓", "燕子", "回收"]) {
      const reference = await loadReference({
        ...base,
        type: "free",
        prompt: word,
      });
      expect(reference?.type).toBe("free");
      if (reference?.type === "free") {
        expect(reference.answer).toContain(word);
        expect(reference.outline.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
  it("uses only the words that actually appeared, retaining order, times, and repeated occurrences", async () => {
    const actual = [
      { word: "咖啡", at: 14 },
      { word: "地铁", at: 28 },
      { word: "雨伞", at: 42 },
      { word: "咖啡", at: 74 },
    ];
    const reference = await loadReference({
      ...base,
      type: "triple",
      prompt: tripleTopics[0].text,
      interruptWords: actual,
    });
    expect(reference?.type).toBe("triple");
    if (reference?.type !== "triple")
      throw new Error("missing Triple reference");
    expect(reference.bridges.map(({ word, at }) => ({ word, at }))).toEqual(
      actual,
    );
    for (const bridge of reference.bridges) {
      expect(bridge.connection).toContain(bridge.word);
      expect(bridge.returnLine).toContain(reference.mainIdea);
    }
    expect(
      new Set(reference.bridges.map((bridge) => bridge.strategy)).size,
    ).toBeGreaterThan(1);
  });
  it("does not invent a cue for an early-ended round and handles an unknown legacy cue safely", async () => {
    const context = {
      ...base,
      type: "triple" as const,
      prompt: tripleTopics[0].text,
    };
    const empty = await loadReference(context);
    if (empty?.type !== "triple") throw new Error("missing Triple reference");
    expect(empty.bridges).toEqual([]);
    const old = await loadReference({
      ...context,
      interruptWords: [{ word: "旧版自定义词", at: 20 }],
    });
    if (old?.type !== "triple") throw new Error("missing legacy reference");
    expect(old.bridges[0].word).toBe("旧版自定义词");
    expect(old.bridges[0].returnLine).toContain(old.mainIdea);
  });
  it("does not let an individual review mutate shared reference outlines", async () => {
    const first = await loadReference(base);
    if (first?.type !== "structured")
      throw new Error("missing structured reference");
    first.outline.push("仅用于本次测试");
    const second = await loadReference(base);
    if (second?.type !== "structured")
      throw new Error("missing second reference");
    expect(second.outline).not.toContain("仅用于本次测试");
  });
});
