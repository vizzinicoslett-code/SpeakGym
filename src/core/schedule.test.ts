import { describe, expect, it } from "vitest";
import type { Difficulty } from "../types";
import { createWordSchedule, difficultyConfig } from "./schedule";

const pool = Array.from({ length: 400 }, (_, index) => `普通词${index}`);

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

describe("Triple Step scheduling", () => {
  it.each<Difficulty>(["easy", "normal", "hard", "chaos"])(
    "satisfies %s counts, gaps and duration over 250 seeded rounds",
    (difficulty) => {
      for (let seed = 0; seed < 250; seed++) {
        const schedule = createWordSchedule(
          difficulty,
          pool,
          seededRandom(seed),
        );
        const expected =
          difficulty === "easy"
            ? [2, 2]
            : difficulty === "normal"
              ? [3, 4]
              : difficulty === "hard"
                ? [5, 7]
                : [4, 10];
        expect(schedule.length).toBeGreaterThanOrEqual(expected[0]);
        expect(schedule.length).toBeLessThanOrEqual(expected[1]);
        expect(new Set(schedule.map((cue) => cue.word)).size).toBe(
          schedule.length,
        );
        let previous = 0;
        for (const [index, cue] of schedule.entries()) {
          expect(cue.used).toBe(false);
          expect(cue.at).toBeGreaterThan(previous);
          expect(cue.at).toBeLessThan(difficultyConfig[difficulty].duration);
          if (difficulty === "easy")
            expect(Math.abs(cue.at - (index + 1) * 20)).toBeLessThanOrEqual(2);
          if (difficulty === "normal") {
            expect(cue.at - previous).toBeGreaterThanOrEqual(12);
            expect(cue.at - previous).toBeLessThanOrEqual(15);
          }
          if (difficulty === "hard") {
            expect(cue.at - previous).toBeGreaterThanOrEqual(8);
            expect(cue.at - previous).toBeLessThanOrEqual(12);
          }
          if (difficulty === "chaos")
            expect(cue.at - previous).toBeGreaterThanOrEqual(6);
          previous = cue.at;
        }
      }
    },
  );

  it("handles an empty or duplicate pool without duplicate cues or mutating content", () => {
    expect(createWordSchedule("chaos", [])).toEqual([]);
    const words = ["咖啡", "咖啡", " 雨伞 ", "", "地铁"];
    const schedule = createWordSchedule("hard", words, () => 0.99);
    expect(schedule).toHaveLength(3);
    expect(new Set(schedule.map((cue) => cue.word))).toEqual(
      new Set(["咖啡", "雨伞", "地铁"]),
    );
    expect(words).toEqual(["咖啡", "咖啡", " 雨伞 ", "", "地铁"]);
  });

  it("has safe boundary schedules even when the RNG returns its extremes", () => {
    for (const difficulty of ["easy", "normal", "hard", "chaos"] as const) {
      for (const value of [0, 1]) {
        const schedule = createWordSchedule(difficulty, pool, () => value);
        expect(schedule.at(-1)!.at).toBeLessThan(
          difficultyConfig[difficulty].duration,
        );
        expect(schedule.every((cue) => Boolean(cue.word))).toBe(true);
      }
    }
  });
});
