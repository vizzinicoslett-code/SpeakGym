import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./timer";

describe("Countdown", () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "performance"],
    }),
  );
  afterEach(() => vi.useRealTimers());

  it("starts, pauses and resumes without counting paused time", () => {
    const tick = vi.fn();
    const finish = vi.fn();
    const timer = new Countdown(10, tick, finish);
    timer.start();
    expect(timer.running).toBe(true);
    expect(tick).toHaveBeenLastCalledWith(10);
    vi.advanceTimersByTime(2_500);
    timer.pause();
    expect(timer.elapsed).toBeCloseTo(2.5);
    expect(timer.remaining).toBe(8);
    vi.advanceTimersByTime(20_000);
    expect(timer.elapsed).toBeCloseTo(2.5);
    timer.resume();
    vi.advanceTimersByTime(7_500);
    expect(timer.remaining).toBe(0);
    expect(timer.running).toBe(false);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("never creates duplicate intervals when start or resume are repeated", () => {
    const finish = vi.fn();
    const timer = new Countdown(2, vi.fn(), finish);
    for (let index = 0; index < 10; index++) {
      timer.start();
      timer.resume();
    }
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(vi.getTimerCount()).toBe(0);
    timer.start();
    vi.advanceTimersByTime(10_000);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("uses elapsed monotonic time when an interval callback is delayed", () => {
    const finish = vi.fn();
    const timer = new Countdown(10, vi.fn(), finish);
    timer.start();
    const clock = vi.spyOn(performance, "now").mockReturnValue(7_800);
    vi.advanceTimersByTime(100);
    expect(timer.remaining).toBe(3);
    expect(timer.elapsed).toBeCloseTo(7.8);
    clock.mockReturnValue(11_000);
    vi.advanceTimersByTime(100);
    expect(finish).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });

  it("releases the interval on stop and can reset to a new duration", () => {
    const finish = vi.fn();
    const timer = new Countdown(10, vi.fn(), finish);
    timer.start();
    vi.advanceTimersByTime(1_100);
    timer.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(timer.remaining).toBe(9);
    timer.reset(3);
    expect(timer.elapsed).toBe(0);
    expect(timer.remaining).toBe(3);
    expect(timer.running).toBe(false);
    timer.start();
    vi.advanceTimersByTime(3_000);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("finishes a zero-length round once and rejects invalid durations", () => {
    const finish = vi.fn();
    const timer = new Countdown(0, vi.fn(), finish);
    timer.start();
    timer.resume();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => new Countdown(-1, vi.fn(), vi.fn())).toThrow(RangeError);
    expect(() => timer.reset(Number.NaN)).toThrow(RangeError);
  });

  it("cancels cleanup without invoking completion when the final interval has been delayed", () => {
    const finish = vi.fn();
    const timer = new Countdown(1, vi.fn(), finish);
    timer.start();
    const clock = vi.spyOn(performance, "now").mockReturnValue(2_000);
    timer.stop();
    vi.advanceTimersByTime(5_000);
    expect(timer.elapsed).toBe(1);
    expect(timer.remaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(finish).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});
