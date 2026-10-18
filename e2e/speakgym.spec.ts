import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { TrainingSession } from "../src/types";

const cards = {
  structured: ".mode-card.green",
  triple: ".mode-card.orange",
  voice: ".mode-card.purple",
  free: ".mode-card.blue",
};

async function clock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-17T01:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-17T01:00:01Z"));
}

async function home(page: Page) {
  await page.goto("./");
  await expect(page.locator(".welcome")).toBeVisible();
}

async function enter(page: Page, type: keyof typeof cards) {
  await page.locator(cards[type]).click();
  await expect(page.locator(".phase-setup")).toBeVisible();
}

async function withoutRecording(page: Page) {
  const toggle = page.getByRole("switch", { name: "本轮录音", exact: true });
  if ((await toggle.getAttribute("aria-checked")) === "true")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
}

async function begin(page: Page, prepSeconds = 5) {
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await page.clock.fastForward(prepSeconds * 1000);
  await expect(page.getByRole("timer")).toBeVisible();
}

async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        Array<{
          id: string;
          type: string;
          duration: number;
          completed: boolean;
          dailyId?: string;
          selfReview: Record<string, string | number | boolean>;
          interruptWords: { word: string; at: number; used: boolean }[];
          audio: {
            size: number;
            isBlob: boolean;
            duration: number;
            mimeType: string;
          }[];
        }>
      >((resolve, reject) => {
        const open = indexedDB.open("speakgym");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("sessions", "readonly");
          const request = transaction.objectStore("sessions").getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () =>
            resolve(
              (request.result as TrainingSession[]).map((session) => ({
                id: session.id,
                type: session.type,
                duration: session.duration,
                completed: session.completed,
                dailyId: session.dailyId,
                selfReview: session.selfReview,
                interruptWords: session.interruptWords,
                audio: session.audio.map((take) => ({
                  size: take.blob.size,
                  isBlob: take.blob instanceof Blob,
                  duration: take.duration,
                  mimeType: take.mimeType,
                })),
              })),
            );
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function saveSingle(page: Page) {
  await page.getByRole("button", { name: "保存这次练习", exact: true }).click();
  await expect(page.locator(".welcome")).toBeVisible();
}

async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    content: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport + 1);
}

test("三根钉子：开始、暂停、恢复、自动完成和自评持久化", async ({ page }) => {
  await clock(page);
  await home(page);
  await enter(page, "structured");
  await withoutRecording(page);
  await page
    .locator(".option-group")
    .filter({ hasText: "讲话时长" })
    .getByRole("button", { name: "30 秒", exact: true })
    .click();
  await begin(page);
  await expect(page.getByRole("timer")).toHaveText("00:30");
  await page.clock.fastForward(10_000);
  await expect(page.getByRole("timer")).toHaveText("00:20");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.clock.fastForward(15_000);
  await expect(page.getByRole("timer")).toHaveText("00:20");
  await expect(page.getByText("已暂停。准备好以后，继续就好。")).toBeVisible();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.clock.fastForward(20_000);
  await expect(page.locator(".phase-review")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  await page.getByRole("checkbox", { name: "说清楚了核心观点" }).check();
  await saveSingle(page);
  const sessions = await stored(page);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({
    type: "structured",
    duration: 30,
    completed: true,
    selfReview: { 说清楚了核心观点: true },
    audio: [],
  });
  await page.reload();
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
});

test("不限时思考和快捷键输入保护；重复按键不会启动多个计时", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "structured");
  await withoutRecording(page);
  await page.getByRole("button", { name: "不限时", exact: true }).click();
  const category = page.getByLabel("题目分类");
  await category.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".phase-setup")).toBeVisible();
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "快捷键输入测试");
    document.querySelector(".training-options")!.append(input);
  });
  const input = page.getByRole("textbox", { name: "快捷键输入测试" });
  await input.fill("练习");
  await input.press("End");
  await input.press("Space");
  await input.press("r");
  await input.press("n");
  await input.press("Enter");
  await input.press("Escape");
  await expect(input).toHaveValue("练习 rn");
  await expect(page.locator(".phase-setup")).toBeVisible();
  await page.locator(".training-title").click();
  await page.keyboard.press("Space");
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.locator(".prepare-number")).toHaveText("∞");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("timer")).toHaveText("01:00");
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        repeat: true,
        bubbles: true,
      }),
    ),
  );
  await page.clock.fastForward(5_000);
  await expect(page.getByRole("timer")).toHaveText("00:55");
  await page.keyboard.press("Space");
  await page.clock.fastForward(5_000);
  await expect(page.getByRole("timer")).toHaveText("00:55");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("r");
  await expect(page.getByRole("timer")).toHaveText("00:55");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(page.locator(".welcome")).toBeVisible();
});

test("Triple Step：Normal 的词按调度出现，暂停不推进，主线和使用标记保存", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await clock(page);
  await home(page);
  await enter(page, "triple");
  await withoutRecording(page);
  await page.getByRole("button", { name: "Normal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Normal", exact: true }),
  ).toHaveClass(/selected/);
  const mainPrompt = await page.locator(".prompt-card h2").textContent();
  await begin(page);
  await expect(page.locator(".word-history div > span")).toHaveCount(0);
  await page.clock.fastForward(11_000);
  await expect(page.locator(".word-history div > span")).toHaveCount(0);
  await page.clock.fastForward(3_000);
  await expect(page.locator(".word-history div > span")).toHaveCount(1);
  await expect(page.locator(".interrupt-stage strong")).toBeVisible();
  await expect(page.locator(".active-prompt")).toHaveText(mainPrompt!);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.clock.fastForward(30_000);
  await expect(page.locator(".word-history div > span")).toHaveCount(1);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  for (let count = 2; count <= 4; count++) {
    await page.clock.fastForward(count === 4 ? 13_000 : 14_000);
    await expect(page.locator(".word-history div > span")).toHaveCount(count);
  }
  await page.clock.fastForward(5_000);
  await expect(page.locator(".phase-review")).toBeVisible();
  await expect(page.locator(".word-chips button")).toHaveCount(4);
  await page.locator(".word-chips button").first().click();
  await expect(page.locator(".word-chips button").first()).toHaveClass("used");
  await saveSingle(page);
  const sessions = await stored(page);
  expect(sessions[0].duration).toBe(60);
  expect(sessions[0].interruptWords.map((word) => word.at)).toEqual([
    14, 28, 42, 55,
  ]);
  expect(sessions[0].interruptWords[0].used).toBe(true);
  expect(
    new Set(sessions[0].interruptWords.map((word) => word.word)).size,
  ).toBe(4);
});

test("声音唤醒：同一句五遍，强调、语速、停顿和情绪全部可完成", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "voice");
  await withoutRecording(page);
  const sentence = await page.locator(".prompt-card h2").textContent();
  await begin(page);
  for (let index = 0; index < 5; index++) {
    await expect(page.getByRole("timer")).toHaveText("00:12");
    await expect(page.locator(".active-topline")).toContainText(
      `TAKE ${index + 1} / 5`,
    );
    if (index === 1) {
      await expect(page.locator(".active-prompt")).toHaveText(sentence!);
      await expect(page.locator(".active-prompt mark")).toBeVisible();
    }
    if (index === 2)
      await expect(page.locator(".active-prompt")).toContainText("——");
    if (index === 4)
      await expect(page.locator(".voice-direction strong")).toBeVisible();
    await page.clock.fastForward(12_000);
    if (index < 4) {
      await expect(page.locator(".phase-between")).toBeVisible();
      await page
        .getByRole("button", { name: `开始第 ${index + 2} 遍`, exact: true })
        .click();
    }
  }
  await expect(page.locator(".phase-review")).toBeVisible();
  await page.getByRole("checkbox", { name: "语速有明显变化" }).check();
  await saveSingle(page);
  expect((await stored(page))[0]).toMatchObject({
    type: "voice",
    duration: 60,
    selfReview: { 语速有明显变化: true },
  });
});

test("不停说：时长、自评、历史筛选和确认删除", async ({ page }) => {
  await clock(page);
  await home(page);
  await enter(page, "free");
  await withoutRecording(page);
  await page.getByRole("button", { name: "45 秒", exact: true }).click();
  await begin(page, 3);
  await page.clock.fastForward(45_000);
  await expect(page.locator(".phase-review")).toBeVisible();
  await page.getByRole("button", { name: "流畅度 4", exact: true }).click();
  await page.getByRole("button", { name: "2～5 秒", exact: true }).click();
  await saveSingle(page);
  expect((await stored(page))[0]).toMatchObject({
    type: "free",
    duration: 45,
    selfReview: { 流畅度: 4, 最长卡顿: "2～5 秒" },
  });
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.getByRole("button", { name: "昨天", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(0);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.locator(".history-row").click();
  await expect(page.getByRole("dialog")).toContainText("流畅度");
  await page.getByRole("button", { name: "删除这条记录", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await stored(page)).toHaveLength(1);
  await page.getByRole("button", { name: "删除这条记录", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(0);
  expect(await stored(page)).toHaveLength(0);
});

test("设置：读写、刷新保留、模式默认值、自动每日训练和清空数据", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const duration = page.getByLabel("默认训练时长", { exact: true });
  await duration.selectOption("90");
  await expect(duration).toBeEnabled();
  await page.getByRole("switch", { name: "自动录音", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "自动录音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "随机词提示音", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "随机词提示音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByLabel("Triple Step 默认难度", { exact: true })
    .selectOption("hard");
  await expect(duration).toBeEnabled();
  await page.reload();
  await expect(page.locator(".welcome")).toBeVisible();
  await enter(page, "structured");
  await expect(
    page
      .locator(".option-group")
      .filter({ hasText: "讲话时长" })
      .getByRole("button", { name: "90 秒", exact: true }),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("switch", { name: "本轮录音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await enter(page, "triple");
  await expect(
    page.getByRole("button", { name: "Hard", exact: true }),
  ).toHaveClass(/selected/);
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "随机词提示音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("switch", { name: "自动进入今日训练", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "自动进入今日训练", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  // A durable daily-open marker must survive tab and browser reloads.
  await page.clock.setSystemTime(new Date("2026-10-18T01:00:00Z"));
  await page.reload();
  await expect(page.locator(".training-header")).toContainText(
    "今日训练 / 1 OF 4",
  );
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await page.reload();
  await expect(page.locator(".welcome")).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "清空数据", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("无法撤销");
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(duration).toHaveValue("60");
  await expect(
    page.getByRole("switch", { name: "自动录音", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("switch", { name: "自动进入今日训练", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
});

test("今日训练：四环节约五分钟完整串联，四条记录使用同一每日标识", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await page.getByRole("button", { name: "开始今日训练", exact: true }).click();
  for (let index = 0; index < 4; index++) {
    await expect(page.locator(".training-header")).toContainText(
      `今日训练 / ${index + 1} OF 4`,
    );
    await withoutRecording(page);
    await begin(page, index === 0 ? 3 : 5);
    if (index === 3) {
      for (let take = 0; take < 5; take++) {
        await page.clock.fastForward(12_000);
        if (take < 4)
          await page
            .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
            .click();
      }
    } else {
      const duration = index === 2 ? 120 : 60;
      for (let elapsed = 0; elapsed < duration; elapsed += 5)
        await page.clock.fastForward(5_000);
    }
    await expect(page.locator(".phase-review")).toBeVisible();
    await page
      .getByRole("button", {
        name: index < 3 ? "保存并继续下一项" : "保存，完成今日训练",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("dialog")).toContainText("今日训练完成。");
  await expect(page.getByRole("dialog")).toContainText("5 分");
  await expect(page.getByRole("dialog")).toContainText("4 轮");
  await page
    .getByRole("button", { name: "收好今天的进步", exact: true })
    .click();
  const sessions = await stored(page);
  expect(sessions).toHaveLength(4);
  expect(sessions.reduce((sum, session) => sum + session.duration, 0)).toBe(
    300,
  );
  expect(new Set(sessions.map((session) => session.dailyId)).size).toBe(1);
  expect(
    sessions.every((session) => session.dailyId && session.completed),
  ).toBe(true);
  expect(
    sessions.find((session) => session.type === "triple")!.interruptWords
      .length,
  ).toBeGreaterThan(3);
});

test("真实 MediaRecorder：假麦克风生成 Blob、回放、刷新后回放、仅删除录音", async ({
  page,
}) => {
  await home(page);
  await enter(page, "free");
  await expect(
    page.getByRole("switch", { name: "本轮录音", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.locator(".recording-indicator")).toContainText(
    "正在本地录音",
  );
  // MediaRecorder encodes actual browser media time, independently of fake JS clocks.
  await page.waitForTimeout(1_300);
  await page.getByRole("button", { name: "结束训练", exact: true }).click();
  await expect(page.locator(".phase-review")).toBeVisible();
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await audio.evaluate((element) => element.play());
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await audio.evaluate((element) => element.pause());
  await saveSingle(page);
  const sessions = await stored(page);
  expect(sessions[0].audio).toHaveLength(1);
  expect(sessions[0].audio[0].isBlob).toBe(true);
  expect(sessions[0].audio[0].size).toBeGreaterThan(100);
  expect(sessions[0].audio[0].duration).toBeGreaterThan(1);
  await page.reload();
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await page.locator(".history-row").click();
  await expect(page.getByRole("dialog").locator("audio")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await page
    .getByRole("dialog")
    .locator("audio")
    .evaluate((element) => element.play());
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("audio")
        .evaluate((element) => element.currentTime),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "删除录音", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const remaining = await stored(page);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].audio).toHaveLength(0);
});

test("退出训练会停止实际麦克风轨道", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const streams: MediaStream[] = [];
    (
      window as Window & { testMicrophoneStreams?: MediaStream[] }
    ).testMicrophoneStreams = streams;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await home(page);
  await enter(page, "free");
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await expect(page.locator(".welcome")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as Window & { testMicrophoneStreams: MediaStream[] }
      ).testMicrophoneStreams.flatMap((stream) =>
        stream.getTracks().map((track) => track.readyState),
      ),
    ),
  ).toEqual(["ended"]);
  expect(await stored(page)).toHaveLength(0);
});

for (const unavailable of ["denied", "unsupported"] as const) {
  test(`麦克风 ${unavailable}：清晰提示后仍可完成并保存训练`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      if (mode === "denied")
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException("Denied for test", "NotAllowedError");
        };
      else
        Object.defineProperty(window, "MediaRecorder", {
          configurable: true,
          value: undefined,
        });
    }, unavailable);
    await clock(page);
    await home(page);
    await enter(page, "free");
    await begin(page, 3);
    await expect(page.locator(".training-notice")).toContainText(
      unavailable === "denied" ? "未获得麦克风权限" : "当前浏览器不支持录音",
    );
    await page.clock.fastForward(30_000);
    await expect(page.locator(".phase-review")).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    await saveSingle(page);
    expect((await stored(page))[0].audio).toHaveLength(0);
  });
}

test("320 / 390 像素手机宽度：首页、配置、训练、自评和设置无横向溢出", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await enter(page, "triple");
    await noOverflow(page);
    await withoutRecording(page);
    await begin(page);
    await noOverflow(page);
    await page.clock.fastForward(15_000);
    await noOverflow(page);
    await page.getByRole("button", { name: "结束训练", exact: true }).click();
    await expect(page.locator(".phase-review")).toBeVisible();
    await noOverflow(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "返回训练场", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await noOverflow(page);
    await page.getByRole("button", { name: "训练首页", exact: true }).click();
  }
});

test("生产 PWA：/SpeakGym/ 路径、manifest、SW 预缓存和断网重新打开后训练保存", async ({
  page,
  context,
}) => {
  await home(page);
  expect(new URL(page.url()).pathname).toBe("/SpeakGym/");
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifestResponse = await page.request.get(
    new URL(manifestUrl!, page.url()).href,
  );
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("SpeakGym · 表达训练场");
  expect(manifest.display).toBe("standalone");
  expect(new URL(manifest.start_url, manifestResponse.url()).pathname).toBe(
    "/SpeakGym/",
  );
  expect(new URL(manifest.scope, manifestResponse.url()).pathname).toBe(
    "/SpeakGym/",
  );
  for (const icon of manifest.icons) {
    const response = await page.request.get(
      new URL(icon.src, manifestResponse.url()).href,
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(new URL(scope).pathname).toBe("/SpeakGym/");
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cacheUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(
      names.find((name) => name.startsWith("speakgym:"))!,
    );
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cacheUrls).toContain("/SpeakGym/index.html");
  expect(
    cacheUrls.some((url) => /^\/SpeakGym\/assets\/.+\.js$/.test(url)),
  ).toBe(true);
  expect(
    cacheUrls.some((url) => /^\/SpeakGym\/assets\/.+\.css$/.test(url)),
  ).toBe(true);
  expect(cacheUrls.every((url) => url.startsWith("/SpeakGym/"))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".welcome")).toBeVisible();
  await clock(page);
  await enter(page, "free");
  await withoutRecording(page);
  await begin(page, 3);
  await page.clock.fastForward(30_000);
  await saveSingle(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  expect((await stored(page))[0]).toMatchObject({
    completed: true,
    type: "free",
    duration: 30,
  });
});

test.describe("手机触屏仿真", () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });

  test("录音、回放、保存、刷新历史和独立时长设置均可使用", async ({ page }) => {
    await home(page);
    await noOverflow(page);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(
      0,
    );
    await enter(page, "free");
    await page.getByRole("button", { name: "开始训练", exact: true }).tap();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.locator(".recording-indicator")).toContainText(
      "正在本地录音",
    );
    await page.waitForTimeout(1_300);
    await page.getByRole("button", { name: "结束训练", exact: true }).tap();
    await expect(page.locator(".phase-review")).toBeVisible();
    await noOverflow(page);
    const audio = page.locator("audio");
    await expect(audio).toHaveAttribute("src", /^blob:/);
    await audio.evaluate((element) => element.play());
    await expect
      .poll(() => audio.evaluate((element) => element.currentTime))
      .toBeGreaterThan(0);
    await audio.evaluate((element) => element.pause());
    await page.getByRole("button", { name: "保存这次练习", exact: true }).tap();
    await expect(page.locator(".welcome")).toBeVisible();
    await page.getByRole("button", { name: "训练记录", exact: true }).tap();
    await expect(page.locator(".history-row")).toHaveCount(1);
    await page.reload();
    await page.getByRole("button", { name: "训练记录", exact: true }).tap();
    await page.locator(".history-row").tap();
    await expect(page.getByRole("dialog").locator("audio")).toHaveAttribute(
      "src",
      /^blob:/,
    );
    expect((await stored(page))[0].audio[0].size).toBeGreaterThan(100);
    await page.getByRole("button", { name: "关闭", exact: true }).tap();
    await page.getByRole("button", { name: "设置", exact: true }).tap();
    await page.getByLabel("不停说默认时长", { exact: true }).selectOption("45");
    await expect(
      page.getByLabel("不停说默认时长", { exact: true }),
    ).toBeEnabled();
    await page.reload();
    await enter(page, "free");
    await expect(
      page.getByRole("button", { name: "45 秒", exact: true }),
    ).toHaveClass(/selected/);
    await noOverflow(page);
  });
});
