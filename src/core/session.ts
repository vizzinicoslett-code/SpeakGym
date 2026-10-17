import type { TrainingSession, TrainingType } from "../types";

export const dailyPlan: {
  type: TrainingType;
  duration: number;
  label: string;
}[] = [
  { type: "free", duration: 60, label: "不停说" },
  { type: "structured", duration: 60, label: "三根钉子" },
  { type: "triple", duration: 120, label: "Triple Step" },
  { type: "voice", duration: 60, label: "声音唤醒" },
];

export function createSession(
  input: Omit<TrainingSession, "id">,
): TrainingSession {
  if (
    !Number.isFinite(input.startedAt) ||
    !Number.isFinite(input.duration) ||
    input.duration < 0
  ) {
    throw new RangeError("训练日期和时长必须有效。");
  }
  if (!["structured", "triple", "voice", "free"].includes(input.type)) {
    throw new TypeError("未知的训练模式。");
  }
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return {
    ...input,
    id,
    interruptWords: input.interruptWords.map((word) => ({ ...word })),
    selfReview: { ...input.selfReview },
    audio: input.audio.map((take) => ({ ...take })),
  };
}

/** Local calendar-day ordinal: using UTC for arithmetic avoids 23/25-hour DST days. */
function calendarDay(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

export function getStats(
  sessions: TrainingSession[],
  now = new Date(),
): {
  weekDays: number;
  totalSeconds: number;
  streak: number;
  counts: Record<TrainingType, number>;
} {
  const today = calendarDay(now);
  const monday = today - ((now.getDay() + 6) % 7);
  const activeDays = new Set<number>();
  const counts: Record<TrainingType, number> = {
    structured: 0,
    triple: 0,
    voice: 0,
    free: 0,
  };
  let totalSeconds = 0;
  for (const session of sessions) {
    if (!session.completed || !Number.isFinite(session.startedAt)) continue;
    const day = calendarDay(new Date(session.startedAt));
    if (!Number.isFinite(day) || day > today) continue;
    activeDays.add(day);
    totalSeconds += Number.isFinite(session.duration)
      ? Math.max(0, session.duration)
      : 0;
    counts[session.type]++;
  }
  let streak = 0;
  let day = activeDays.has(today) ? today : today - 1;
  while (activeDays.has(day)) {
    streak++;
    day--;
  }
  return {
    weekDays: [...activeDays].filter(
      (activeDay) => activeDay >= monday && activeDay <= today,
    ).length,
    totalSeconds,
    streak,
    counts,
  };
}
