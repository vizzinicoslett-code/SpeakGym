import type { Difficulty, InterruptWord } from "../types";

export const difficultyConfig: Record<
  Difficulty,
  { duration: number; label: string; description: string }
> = {
  easy: {
    duration: 60,
    label: "Easy",
    description: "60 秒 · 2 个词 · 约每 20 秒出现",
  },
  normal: {
    duration: 60,
    label: "Normal",
    description: "60 秒 · 3–4 个词 · 间隔 12–15 秒",
  },
  hard: {
    duration: 90,
    label: "Hard",
    description: "90 秒 · 5–7 个词 · 间隔 8–12 秒",
  },
  chaos: {
    duration: 90,
    label: "Chaos",
    description: "90 秒 · 随机词数与时间 · 至少间隔 6 秒",
  },
};

export function createWordSchedule(
  difficulty: Difficulty,
  wordPool: string[],
  rng: () => number = Math.random,
): InterruptWord[] {
  const random = () => {
    const value = rng();
    return Number.isFinite(value)
      ? Math.max(0, Math.min(0.999999999999, value))
      : 0;
  };
  const integer = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  const words = [
    ...new Set(wordPool.map((word) => word.trim()).filter(Boolean)),
  ];
  const requestedCount =
    difficulty === "easy"
      ? 2
      : difficulty === "normal"
        ? integer(3, 4)
        : difficulty === "hard"
          ? integer(5, 7)
          : integer(4, 10);
  const count = Math.min(requestedCount, words.length);
  const schedule: InterruptWord[] = [];
  let at = 0;

  for (let index = 0; index < count; index++) {
    // Sampling without replacement avoids asking a speaker to reuse the same cue.
    const word = words.splice(integer(0, words.length - 1), 1)[0];
    if (difficulty === "easy") at = (index + 1) * 20 + integer(-2, 2);
    else if (difficulty === "normal") {
      const maxGap = Math.min(15, 56 - at - (count - index - 1) * 12);
      at += integer(12, maxGap);
    } else if (difficulty === "hard") at += integer(8, 12);
    else {
      // Reserve six seconds for each remaining cue and for the closing sentence.
      const maxGap = Math.min(16, 84 - at - (count - index - 1) * 6);
      at += integer(6, maxGap);
    }
    schedule.push({ word, at, used: false });
  }
  return schedule;
}
