import { describe, expect, it } from "vitest";
import { words } from "../words";
import { freeReferencesB } from "./freeB";

const allocatedWords = words.slice(210, 420);
const hanCount = (value: string) =>
  value.match(/\p{Script=Han}/gu)?.length ?? 0;

describe("authored free-speaking references B", () => {
  it("covers exactly the allocated 210 words, from 燕子 to 回收", () => {
    expect(allocatedWords).toHaveLength(210);
    expect(allocatedWords[0]).toBe("燕子");
    expect(allocatedWords.at(-1)).toBe("回收");
    expect(Object.keys(freeReferencesB).sort()).toEqual(
      [...allocatedWords].sort(),
    );
  });

  it("provides a distinct complete spoken illustration for each word", () => {
    const answers = Object.values(freeReferencesB).map(
      (reference) => reference.answer,
    );
    expect(new Set(answers).size).toBe(allocatedWords.length);
    for (const word of allocatedWords) {
      const { answer } = freeReferencesB[word]!;
      expect(
        hanCount(answer),
        `${word}: reference length`,
      ).toBeGreaterThanOrEqual(85);
      expect(hanCount(answer), `${word}: reference length`).toBeLessThanOrEqual(
        145,
      );
      expect(answer, `${word}: explicit subject`).toContain(word);
      expect(answer, `${word}: complete ending`).toMatch(/[。！？]$/u);
      expect(answer, `${word}: no unfinished scaffold`).not.toMatch(
        /待补|TODO|占位|请在此|套用模板/u,
      );
    }
  });

  it("uses short specific local word facts rather than first-person anecdotes", () => {
    const facts = Object.values(freeReferencesB).map(
      (reference) => reference.bridgeFact,
    );
    expect(new Set(facts).size).toBe(allocatedWords.length);
    for (const word of allocatedWords) {
      const { bridgeFact } = freeReferencesB[word]!;
      expect(bridgeFact, `${word}: grounded bridge subject`).toContain(word);
      expect(
        hanCount(bridgeFact),
        `${word}: bridge length`,
      ).toBeGreaterThanOrEqual(8);
      expect(
        hanCount(bridgeFact),
        `${word}: bridge length`,
      ).toBeLessThanOrEqual(22);
      expect(bridgeFact, `${word}: ordinary observation`).not.toMatch(
        /我|我们|所有人|任何人都|永远|必然/u,
      );
    }
  });

  it("offers short varied outlines instead of one reusable wrapper", () => {
    const outlines = Object.values(freeReferencesB).map(
      (reference) => reference.outline,
    );
    expect(
      new Set(outlines.map((outline) => outline.join("→"))).size,
    ).toBeGreaterThan(80);
    for (const word of allocatedWords) {
      const { outline } = freeReferencesB[word]!;
      expect(
        outline.length,
        `${word}: outline sections`,
      ).toBeGreaterThanOrEqual(4);
      expect(outline.length, `${word}: outline sections`).toBeLessThanOrEqual(
        6,
      );
      expect(new Set(outline).size, `${word}: repeated outline section`).toBe(
        outline.length,
      );
      for (const label of outline) {
        expect(
          hanCount(label),
          `${word}: short outline label`,
        ).toBeGreaterThanOrEqual(2);
        expect(
          hanCount(label),
          `${word}: short outline label`,
        ).toBeLessThanOrEqual(6);
      }
    }
  });
});
