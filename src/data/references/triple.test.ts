import { describe, expect, it } from "vitest";
import { tripleTopics } from "../questions";
import { words } from "../words";
import { createReferenceBridges, tripleReferences } from "./triple";
import { freeReferencesA } from "./freeA";
import { freeReferencesB } from "./freeB";
const wordReferences = { ...freeReferencesA, ...freeReferencesB };

describe("topic-specific Triple Step references", () => {
  it("covers all existing and Phase 1.1 topics with a real main point and concrete development", () => {
    expect(Object.keys(tripleReferences).sort()).toEqual(
      tripleTopics.map((topic) => topic.id).sort(),
    );
    expect(
      new Set(
        Object.values(tripleReferences).map((reference) => reference.mainIdea),
      ).size,
    ).toBe(tripleTopics.length);
    for (const reference of Object.values(tripleReferences)) {
      expect(reference.mainIdea.length).toBeGreaterThan(15);
      expect(reference.development.length).toBeGreaterThan(60);
      expect(reference.bridgePoint.length).toBeGreaterThan(15);
      expect(reference.closing).toBeTruthy();
      expect(reference.development).not.toMatch(/首先\s*What|其次\s*So What/i);
    }
  });
  it("keeps every return attached to the original main line and offers varied local bridge strategies", () => {
    for (const topic of [
      tripleTopics[0],
      tripleTopics[59],
      tripleTopics[72],
      tripleTopics[85],
    ]) {
      const reference = tripleReferences[topic.id];
      const bridges = createReferenceBridges(
        reference,
        words.map((word, index) => ({
          word,
          at: index + 6,
          fact: wordReferences[word].bridgeFact,
        })),
      );
      expect(bridges).toHaveLength(words.length);
      expect(
        new Set(bridges.map((bridge) => bridge.strategy)).size,
      ).toBeGreaterThanOrEqual(6);
      for (let index = 0; index < bridges.length; index++) {
        expect(bridges[index].word).toBe(words[index]);
        expect(bridges[index].connection).toContain(words[index]);
        expect(bridges[index].returnLine).toContain(reference.mainIdea);
      }
    }
  });
  it("links an actual cue observation to a concrete scenario for every topic before returning", () => {
    for (const reference of Object.values(tripleReferences)) {
      expect(typeof reference.bridgeLink).toBe("function");
      const link = reference.bridgeLink("金鱼");
      expect(link).toContain("金鱼");
      expect(link.length).toBeGreaterThan(35);
      const [bridge] = createReferenceBridges(reference, [
        { word: "金鱼", at: 20, fact: wordReferences["金鱼"].bridgeFact },
      ]);
      expect(bridge.connection).toContain(wordReferences["金鱼"].bridgeFact);
      expect(bridge.connection).toContain(link);
      expect(bridge.returnLine).toContain(reference.mainIdea);
    }
    const learning = tripleReferences["triple-topic-001"].bridgeLink("金鱼");
    expect(learning).toMatch(/观察.*查资料/);
    expect(learning).toContain("主动学习");
    const habit = tripleReferences["triple-topic-002"].bridgeLink("咖啡");
    expect(habit).toContain("每天");
    expect(habit).toContain("容易开始");
    const cooperation = tripleReferences["triple-topic-022"].bridgeLink("地铁");
    expect(cooperation).toMatch(/谁.*谁/);
    expect(cooperation).toContain("完成");
  });
});
