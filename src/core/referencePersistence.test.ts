import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllData,
  getSessions,
  getSettings,
  saveSession,
  saveSettings,
} from "./database";
import { createSession } from "./session";
import { questions } from "../data/questions";

describe("optional reference identity and comparison persistence", () => {
  beforeEach(clearAllData);
  it("stores only the prompt ID and user comparison, retaining the old audio Blob", async () => {
    const session = createSession({
      type: "structured",
      prompt: questions[0].text,
      promptId: questions[0].id,
      startedAt: Date.now(),
      duration: 60,
      completed: true,
      interruptWords: [],
      selfReview: { "表达对比 · 核心观点比我更明确": true },
      audio: [
        {
          id: "old-audio",
          label: "训练录音",
          blob: new Blob(["previous local audio"], { type: "audio/webm" }),
          mimeType: "audio/webm",
          duration: 60,
        },
      ],
    });
    await saveSession(session);
    const [stored] = await getSessions();
    expect(stored.promptId).toBe(questions[0].id);
    expect(stored.selfReview["表达对比 · 核心观点比我更明确"]).toBe(true);
    expect(await stored.audio[0].blob.text()).toBe("previous local audio");
    expect(stored).not.toHaveProperty("referenceAnswer");
    expect(stored).not.toHaveProperty("referenceOutline");
    expect(stored).not.toHaveProperty("referenceMainIdea");
  });
  it("reads Phase 1 and Phase 1.1 sessions without new fields and leaves saved preferences intact", async () => {
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      tripleDifficulty: "normal",
      autoRecord: false,
    });
    const old = createSession({
      type: "triple",
      prompt: "你认为大学最重要的能力是什么？",
      startedAt: Date.now(),
      duration: 60,
      completed: true,
      interruptWords: [],
      selfReview: {},
      audio: [],
    });
    await saveSession(old);
    await saveSession({
      ...old,
      id: "phase11",
      mainIdea: "先主动尝试，再根据反馈调整",
      promptHintsUsed: true,
    });
    const stored = await getSessions();
    expect(stored).toHaveLength(2);
    expect(stored.every((session) => session.promptId === undefined)).toBe(
      true,
    );
    expect(stored.find((session) => session.id === "phase11")?.mainIdea).toBe(
      "先主动尝试，再根据反馈调整",
    );
    expect((await getSettings()).tripleDifficulty).toBe("normal");
    expect((await getSettings()).autoRecord).toBe(false);
  });
});
