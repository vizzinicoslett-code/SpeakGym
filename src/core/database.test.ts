import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { TrainingSession } from "../types";
import {
  claimDailyOpen,
  clearAllData,
  defaultSettings,
  deleteAllAudio,
  deleteSession,
  getSessions,
  getSettings,
  getStorageUsage,
  saveSession,
  saveSettings,
} from "./database";
import { createSession } from "./session";

function session(startedAt = Date.now()): TrainingSession {
  return createSession({
    type: "triple",
    startedAt,
    duration: 60,
    prompt: "你认为大学最重要的能力是什么？",
    difficulty: "normal",
    interruptWords: [{ word: "咖啡", at: 12, used: true }],
    selfReview: { mainThread: true },
    completed: true,
    audio: [
      {
        id: "take-1",
        label: "Take 1",
        blob: new Blob(["local audio"], { type: "audio/webm" }),
        duration: 60,
        mimeType: "audio/webm",
      },
    ],
  });
}

describe("IndexedDB persistence", () => {
  beforeEach(async () => clearAllData());

  it("persists full sessions including Blob audio and returns newest first", async () => {
    const first = session(1_000);
    const second = session(2_000);
    await saveSession(first);
    await saveSession(second);
    const saved = await getSessions();
    expect(saved.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(saved[0].interruptWords).toEqual(second.interruptWords);
    expect(saved[0].selfReview).toEqual(second.selfReview);
    expect(await saved[0].audio[0].blob.text()).toBe("local audio");
    expect(saved[0].audio[0].blob.type).toBe("audio/webm");
  });

  it("updates a session by ID without creating a duplicate", async () => {
    const record = session();
    await saveSession(record);
    await saveSession({ ...record, selfReview: { mainThread: false } });
    const saved = await getSessions();
    expect(saved).toHaveLength(1);
    expect(saved[0].selfReview.mainThread).toBe(false);
  });

  it("deletes an individual record and its audio without affecting another", async () => {
    const first = session(1_000);
    const second = session(2_000);
    await saveSession(first);
    await saveSession(second);
    await deleteSession(first.id);
    expect((await getSessions()).map((item) => item.id)).toEqual([second.id]);
    await deleteSession("already-removed");
    expect(await getStorageUsage()).toEqual({
      audioBytes: 11,
      sessionCount: 1,
    });
  });

  it("returns independent defaults and persists validated settings", async () => {
    const initial = await getSettings();
    expect(initial).toEqual(defaultSettings);
    initial.autoRecord = false;
    expect((await getSettings()).autoRecord).toBe(true);
    const configured = {
      defaultDuration: 90,
      freeDuration: 45,
      autoRecord: false,
      cueSound: false,
      tripleDifficulty: "hard" as const,
      autoDaily: true,
    };
    await saveSettings(configured);
    expect(await getSettings()).toEqual(configured);
    await expect(
      saveSettings({ ...configured, defaultDuration: -1 }),
    ).rejects.toThrow("设置无效");
    expect(await getSettings()).toEqual(configured);
  });

  it("keeps an explicitly saved 60-second free-speaking preference separate from the structured default", async () => {
    await saveSettings({
      ...defaultSettings,
      freeDuration: 60,
      defaultDuration: 90,
    });
    const configured = await getSettings();
    expect(configured.freeDuration).toBe(60);
    expect(configured.defaultDuration).toBe(90);
    await saveSettings({ ...configured, defaultDuration: 30 });
    expect((await getSettings()).freeDuration).toBe(60);
  });

  it("reads earlier version 1 preferences with a 30-second free-speaking default", async () => {
    const { freeDuration: _legacyMissing, ...legacySettings } = defaultSettings;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("speakgym", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction("settings", "readwrite");
        tx.objectStore("settings").put(legacySettings, "app");
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onabort = () => {
          database.close();
          reject(tx.error);
        };
      };
    });
    expect(await getSettings()).toEqual({
      ...legacySettings,
      freeDuration: 30,
    });
  });

  it("rejects unsupported durations for either mode while preserving the saved preference", async () => {
    await saveSettings(defaultSettings);
    await expect(
      saveSettings({ ...defaultSettings, freeDuration: 120 }),
    ).rejects.toThrow("设置无效");
    await expect(
      saveSettings({ ...defaultSettings, defaultDuration: 45 }),
    ).rejects.toThrow("设置无效");
    expect(await getSettings()).toEqual(defaultSettings);
  });

  it("deletes all audio while keeping review history and settings", async () => {
    const first = session(1_000);
    const second = session(2_000);
    await saveSession(first);
    await saveSession(second);
    await saveSettings({ ...defaultSettings, cueSound: false });
    expect(await getStorageUsage()).toEqual({
      audioBytes: 22,
      sessionCount: 2,
    });
    await deleteAllAudio();
    const saved = await getSessions();
    expect(saved).toHaveLength(2);
    expect(saved.every((record) => record.audio.length === 0)).toBe(true);
    expect(saved[0].selfReview).toEqual(second.selfReview);
    expect(await getStorageUsage()).toEqual({ audioBytes: 0, sessionCount: 2 });
    expect((await getSettings()).cueSound).toBe(false);
  });

  it("clears sessions and settings in one transaction", async () => {
    await saveSession(session());
    await saveSettings({ ...defaultSettings, autoRecord: false });
    await clearAllData();
    expect(await getSessions()).toEqual([]);
    expect(await getSettings()).toEqual(defaultSettings);
    expect(await getStorageUsage()).toEqual({ audioBytes: 0, sessionCount: 0 });
  });

  it("rejects an invalid session without adding a record", async () => {
    await expect(
      saveSession({ ...session(), duration: Number.NaN }),
    ).rejects.toThrow("无效");
    expect(await getSessions()).toEqual([]);
  });

  it("atomically claims the first daily opening once across concurrent callers", async () => {
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => claimDailyOpen("2026-9-17")),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimDailyOpen("2026-9-17")).toBe(false);
  });

  it("claims a new date independently from settings updates and audio deletion", async () => {
    expect(await claimDailyOpen("2026-9-17")).toBe(true);
    await saveSettings({ ...defaultSettings, autoDaily: true });
    await deleteAllAudio();
    expect(await claimDailyOpen("2026-9-17")).toBe(false);
    expect(await claimDailyOpen("2026-9-18")).toBe(true);
    expect(await claimDailyOpen("2026-9-18")).toBe(false);
    expect((await getSettings()).autoDaily).toBe(true);
  });

  it("resets the daily-open marker when all local data is cleared and rejects an empty date", async () => {
    expect(await claimDailyOpen("2026-9-17")).toBe(true);
    await clearAllData();
    expect(await claimDailyOpen("2026-9-17")).toBe(true);
    await expect(claimDailyOpen(" ")).rejects.toThrow("日期不能为空");
  });
});
