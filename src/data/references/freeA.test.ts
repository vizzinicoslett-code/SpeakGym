import { describe, expect, it } from "vitest";
import { words } from "../words";
import { freeReferencesA } from "./freeA";

const hanLength = (value: string) =>
  (value.match(/[\u4e00-\u9fff]/g) ?? []).length;

describe("authored free-speaking references A", () => {
  it("covers exactly words 0–209, from 咖啡 through 蜻蜓", () => {
    expect(words[0]).toBe("咖啡");
    expect(words[209]).toBe("蜻蜓");
    expect(Object.keys(freeReferencesA)).toEqual(words.slice(0, 210));
  });

  it("provides a unique, speakable paragraph and varied short outlines for every word", () => {
    const entries = Object.entries(freeReferencesA);
    expect(new Set(entries.map(([, value]) => value.answer)).size).toBe(210);
    expect(
      new Set(entries.map(([, value]) => value.outline.join("|"))).size,
    ).toBeGreaterThan(50);
    for (const [word, reference] of entries) {
      expect(reference.answer, word).toContain(word);
      expect(hanLength(reference.answer), word).toBeGreaterThanOrEqual(85);
      expect(hanLength(reference.answer), word).toBeLessThanOrEqual(145);
      expect(reference.answer, word).toMatch(/。$/);
      expect(reference.answer, word).not.toMatch(/\{\{|\$\{|TODO|待补|模板/);
      expect(reference.outline.length, word).toBeGreaterThanOrEqual(4);
      expect(reference.outline.length, word).toBeLessThanOrEqual(6);
      expect(new Set(reference.outline).size, word).toBe(
        reference.outline.length,
      );
      for (const label of reference.outline) {
        expect(label, word).toMatch(/^[\u4e00-\u9fff]{2,5}$/);
      }
    }
  });

  it("supplies compact ordinary observations without a first-person story", () => {
    for (const [word, { bridgeFact }] of Object.entries(freeReferencesA)) {
      expect(bridgeFact.trim(), word).toBe(bridgeFact);
      expect(hanLength(bridgeFact), word).toBeGreaterThanOrEqual(8);
      expect(hanLength(bridgeFact), word).toBeLessThanOrEqual(22);
      expect(bridgeFact, word).not.toMatch(
        /我|我们|有一次|小时候|总是|一定会|一定能|永远/,
      );
      expect(bridgeFact, word).not.toMatch(/[。？！\n]/);
    }
  });
});
