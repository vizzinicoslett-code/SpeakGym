import { describe, expect, it } from "vitest";
import type { TrainingSession } from "../types";
import { createSession, dailyPlan, getStats } from "./session";

const input: Omit<TrainingSession, "id"> = {
  type: "structured",
  startedAt: new Date(2026, 9, 17, 12).getTime(),
  duration: 60,
  prompt: "你最近学到了什么？",
  interruptWords: [{ word: "咖啡", at: 20, used: false }],
  selfReview: { clear: true },
  audio: [],
  completed: true,
};

describe("training sessions", () => {
  it("creates unique sessions and copies editable review state", () => {
    const session = createSession(input);
    const second = createSession(input);
    expect(session.id).not.toBe(second.id);
    expect(session).toMatchObject(input);
    session.interruptWords[0].used = true;
    session.selfReview.clear = false;
    expect(input.interruptWords[0].used).toBe(false);
    expect(input.selfReview.clear).toBe(true);
  });

  it("preserves completion status and rejects invalid creation times or durations", () => {
    expect(createSession({ ...input, completed: false }).completed).toBe(false);
    expect(createSession(input).completed).toBe(true);
    expect(() => createSession({ ...input, duration: -1 })).toThrow(RangeError);
    expect(() => createSession({ ...input, startedAt: Number.NaN })).toThrow(
      RangeError,
    );
  });

  it("plans all four modes in order with a five-minute total", () => {
    expect(dailyPlan.map((step) => step.type)).toEqual([
      "free",
      "structured",
      "triple",
      "voice",
    ]);
    expect(dailyPlan.map((step) => step.duration)).toEqual([60, 60, 120, 60]);
    expect(dailyPlan.reduce((sum, step) => sum + step.duration, 0)).toBe(300);
  });

  it("counts unique local training days and excludes incomplete rounds from statistics", () => {
    const now = new Date(2026, 9, 17, 12);
    const sessionOn = (
      date: number,
      type: TrainingSession["type"] = "structured",
      completed = true,
    ) =>
      createSession({
        ...input,
        type,
        startedAt: new Date(2026, 9, date, 9).getTime(),
        completed,
      });
    const stats = getStats(
      [
        sessionOn(17),
        sessionOn(17, "free"),
        sessionOn(16, "triple"),
        sessionOn(15, "voice"),
        sessionOn(12),
        sessionOn(11),
        sessionOn(14, "structured", false),
      ],
      now,
    );
    expect(stats).toEqual({
      weekDays: 4,
      totalSeconds: 360,
      streak: 3,
      counts: { structured: 3, free: 1, triple: 1, voice: 1 },
    });
  });

  it("keeps yesterday’s streak and handles local calendar boundaries across DST dates", () => {
    const sessions = [6, 7, 8].map((day) =>
      createSession({
        ...input,
        startedAt: new Date(2026, 2, day, 12).getTime(),
      }),
    );
    expect(getStats(sessions, new Date(2026, 2, 9, 9)).streak).toBe(3);
    expect(getStats(sessions, new Date(2026, 2, 10, 9)).streak).toBe(0);
    expect(getStats([], new Date(2026, 2, 9))).toEqual({
      weekDays: 0,
      totalSeconds: 0,
      streak: 0,
      counts: { structured: 0, triple: 0, voice: 0, free: 0 },
    });
  });
});
