import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { questions, tripleTopics } from "../src/data/questions";
import { words } from "../src/data/words";
import { structuredReferences } from "../src/data/references/structured";
import { tripleReferences } from "../src/data/references/triple";
import { getWordReference } from "../src/core/reference";
import { referenceComparisonLabels } from "../src/core/referenceTypes";
import type { TrainingSession, TrainingType } from "../src/types";

const cards: Record<TrainingType, string> = {
  structured: ".mode-card.green",
  triple: ".mode-card.orange",
  voice: ".mode-card.purple",
  free: ".mode-card.blue",
};
const referenceAsset =
  /\/assets\/(?:reference|structured|freeA|freeB|triple)-[^/]+\.js(?:\?|$)/;

async function clock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-19T01:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-19T01:00:01Z"));
}

async function home(page: Page) {
  await page.goto("./");
  await expect(page.locator(".welcome")).toBeVisible();
}

async function enter(page: Page, type: TrainingType) {
  await page.locator(cards[type]).click();
  await expect(page.locator(".phase-setup")).toBeVisible();
}

async function withoutRecording(page: Page) {
  const toggle = page.getByRole("switch", { name: "本轮录音", exact: true });
  if ((await toggle.getAttribute("aria-checked")) === "true")
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
}

async function noReference(page: Page) {
  await expect(page.locator(".reference-review")).toHaveCount(0);
  await expect(
    page.locator(".reference-answer, .reference-main-idea"),
  ).toHaveCount(0);
}

async function begin(page: Page, prepSeconds = 5) {
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await noReference(page);
  await page.clock.fastForward(prepSeconds * 1_000);
  await expect(page.getByRole("timer")).toBeVisible();
  await noReference(page);
}

async function advance(page: Page, milliseconds: number) {
  // Let each clock update render, so the test records every real cue that
  // appeared instead of skipping directly across all scheduled interruptions.
  for (let remaining = milliseconds; remaining > 0; remaining -= 5_000) {
    await page.clock.fastForward(Math.min(remaining, 5_000));
  }
}

async function finish(page: Page) {
  await page.getByRole("button", { name: "结束训练", exact: true }).click();
  await expect(page.locator(".phase-review")).toBeVisible();
}

async function review(
  page: Page,
  type: Exclude<TrainingType, "voice">,
  elapsed = 2_000,
) {
  await enter(page, type);
  await withoutRecording(page);
  const prompt = await page.locator(".prompt-card h2").innerText();
  await begin(page, type === "free" ? 3 : 5);
  await advance(page, elapsed);
  await finish(page);
  return prompt;
}

async function expand(page: Page) {
  const toggle = page.getByRole("button", {
    name: "看看一种优秀表达",
    exact: true,
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("region", { name: "一种优秀表达内容", exact: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "收起一种优秀表达", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  const region = page.getByRole("region", {
    name: "一种优秀表达内容",
    exact: true,
  });
  await expect(region).toBeVisible();
  return region;
}

async function save(page: Page) {
  await page.getByRole("button", { name: "保存这次练习", exact: true }).click();
  await expect(page.locator(".welcome")).toBeVisible();
}

async function sessions(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        Array<
          Omit<TrainingSession, "audio"> & {
            audio: { size: number; type: string; isBlob: boolean }[];
          }
        >
      >((resolve, reject) => {
        const request = indexedDB.open("speakgym", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("sessions", "readonly");
          const read = tx.objectStore("sessions").getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () =>
            resolve(
              (read.result as TrainingSession[]).map((session) => ({
                ...session,
                audio: session.audio.map((take) => ({
                  size: take.blob.size,
                  type: take.blob.type,
                  isBlob: take.blob instanceof Blob,
                })),
              })),
            );
          tx.oncomplete = () => database.close();
        };
      }),
  );
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    content: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
}

function structuredFor(prompt: string) {
  const question = questions.find((question) => question.text === prompt);
  expect(question).toBeDefined();
  return { id: question!.id, ...structuredReferences[question!.id] };
}

function tripleFor(prompt: string) {
  const topic = tripleTopics.find((topic) => topic.text === prompt);
  expect(topic).toBeDefined();
  return { id: topic!.id, ...tripleReferences[topic!.id] };
}

async function assertInnerScroll(
  region: Locator,
  minHeight: number,
  maxHeight: number,
) {
  const metrics = await region.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      maxHeight: parseFloat(style.maxHeight),
      height: element.getBoundingClientRect().height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: style.overflowY,
      padding: parseFloat(style.paddingTop),
      overscroll: style.overscrollBehaviorY,
    };
  });
  expect(metrics.maxHeight).toBeGreaterThanOrEqual(minHeight);
  expect(metrics.maxHeight).toBeLessThanOrEqual(maxHeight);
  expect(metrics.height).toBeLessThanOrEqual(metrics.maxHeight + 2);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.padding).toBeGreaterThanOrEqual(10);
  expect(metrics.overscroll).toBe("contain");
}

async function completeVoice(page: Page) {
  await withoutRecording(page);
  await begin(page);
  for (let take = 0; take < 5; take++) {
    await noReference(page);
    await page.clock.fastForward(12_000);
    if (take < 4) {
      await expect(page.locator(".phase-between")).toBeVisible();
      await noReference(page);
      await page
        .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
        .click();
    }
  }
  await expect(page.locator(".phase-review")).toBeVisible();
  await noReference(page);
}

test("三根钉子在准备、没思路和讲话时不读取或显示参考，完成后仍默认收起", async ({
  page,
}) => {
  const loadedAnswers: string[] = [];
  const nonStaticRequests: string[] = [];
  page.on("request", (request) => {
    if (referenceAsset.test(request.url())) loadedAnswers.push(request.url());
    if (!["GET", "HEAD"].includes(request.method()))
      nonStaticRequests.push(request.url());
  });
  await clock(page);
  await home(page);
  await enter(page, "structured");
  await withoutRecording(page);
  const expected = structuredFor(
    await page.locator(".prompt-card h2").innerText(),
  );
  await noReference(page);
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  await page.locator(".content-handles summary").click();
  await expect(page.locator("body")).not.toContainText(expected.answer);
  await begin(page);
  await page.clock.fastForward(3_000);
  await expect(page.locator("body")).not.toContainText(expected.answer);
  await finish(page);
  await expect(
    page.getByRole("button", { name: "看看一种优秀表达", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".reference-panel, .reference-scroll")).toHaveCount(
    0,
  );
  await expect(page.locator("body")).not.toContainText(expected.answer);
  expect(loadedAnswers).toEqual([]);
  await save(page);
  expect(nonStaticRequests).toEqual([]);
});

test("三根钉子完成后按需展开对应表达和六项对比，可以收起再展开", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  const expected = structuredFor(await review(page, "structured"));
  let region = await expand(page);
  await expect(region.locator(".reference-answer")).toHaveText(expected.answer);
  await expect(region.locator(".reference-outline")).toHaveText(
    expected.outline.join(" → "),
  );
  await expect(page.locator(".reference-note")).toHaveText(
    "这不是唯一答案，重点观察它怎样展开内容、连接观点和完成收尾。",
  );
  await expect(region.getByRole("checkbox")).toHaveCount(6);
  for (const label of referenceComparisonLabels) {
    await expect(
      region.getByRole("checkbox", { name: label, exact: true }),
    ).not.toBeChecked();
  }
  await region
    .getByRole("checkbox", { name: referenceComparisonLabels[1], exact: true })
    .check();
  await page
    .getByRole("button", { name: "收起一种优秀表达", exact: true })
    .click();
  await expect(page.locator(".reference-scroll")).toHaveCount(0);
  region = await expand(page);
  await expect(region.locator(".reference-answer")).toHaveText(expected.answer);
  await expect(
    region.getByRole("checkbox", {
      name: referenceComparisonLabels[1],
      exact: true,
    }),
  ).toBeChecked();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("表达对比和稳定题目 ID 保存在 Session，参考正文不复制保存，历史可再次查看", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  const prompt = await review(page, "structured");
  const expected = structuredFor(prompt);
  await page.locator(".review-checks input").first().check();
  const region = await expand(page);
  for (const index of [0, 5])
    await region
      .getByRole("checkbox", {
        name: referenceComparisonLabels[index],
        exact: true,
      })
      .check();
  await save(page);
  const [stored] = await sessions(page);
  expect(stored.promptId).toBe(expected.id);
  expect(stored.selfReview[`表达对比 · ${referenceComparisonLabels[0]}`]).toBe(
    true,
  );
  expect(stored.selfReview[`表达对比 · ${referenceComparisonLabels[5]}`]).toBe(
    true,
  );
  expect(
    Object.entries(stored.selfReview).some(
      ([key, value]) => !key.startsWith("表达对比 · ") && value === true,
    ),
  ).toBe(true);
  expect(JSON.stringify(stored)).not.toContain(expected.answer);
  for (const field of [
    "referenceAnswer",
    "referenceOutline",
    "referenceMainIdea",
    "answer",
    "outline",
    "development",
    "bridges",
  ])
    expect(stored).not.toHaveProperty(field);
  await page.reload();
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await page.locator(".history-row").click();
  const historical = await expand(page);
  await expect(historical.locator(".reference-answer")).toHaveText(
    expected.answer,
  );
  for (const index of [0, 5]) {
    const checkbox = historical.getByRole("checkbox", {
      name: referenceComparisonLabels[index],
      exact: true,
    });
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  }
});

test("N 换题会清空上轮参考展开和对比状态，新一轮只显示新题内容", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  const oldPrompt = await review(page, "structured");
  const oldReference = structuredFor(oldPrompt);
  const region = await expand(page);
  await region
    .getByRole("checkbox", { name: referenceComparisonLabels[0], exact: true })
    .check();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("heading", { name: "说完了，听听自己。", exact: true })
    .click();
  await page.keyboard.press("n");
  await expect(page.locator(".phase-setup")).toBeVisible();
  await expect(page.locator(".prompt-card h2")).not.toHaveText(oldPrompt);
  await noReference(page);
  const expected = structuredFor(
    await page.locator(".prompt-card h2").innerText(),
  );
  await begin(page);
  await page.clock.fastForward(2_000);
  await finish(page);
  const next = await expand(page);
  await expect(next.locator(".reference-answer")).toHaveText(expected.answer);
  await expect(next).not.toContainText(oldReference.answer);
  for (const label of referenceComparisonLabels)
    await expect(
      next.getByRole("checkbox", { name: label, exact: true }),
    ).not.toBeChecked();
});

test("Triple Step 不在主线填写或讲话时泄露参考，复盘仅桥接本轮实际词并回到同一主线", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "triple");
  await withoutRecording(page);
  const prompt = await page.locator(".prompt-card h2").innerText();
  const expected = tripleFor(prompt);
  await page
    .getByRole("textbox", { name: "我的主线", exact: true })
    .fill("我想从自己最近的一次尝试讲起。");
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  await noReference(page);
  await expect(page.locator("body")).not.toContainText(expected.development);
  await begin(page);
  await advance(page, 45_000);
  await noReference(page);
  await finish(page);
  const actualWords = await page
    .locator(".word-chips button")
    .allTextContents();
  expect(actualWords).toHaveLength(2);
  const region = await expand(page);
  await expect(region.locator(".reference-main-idea")).toHaveText(
    expected.mainIdea,
  );
  await expect(region).toContainText(expected.development);
  await expect(region.locator(".reference-bridge")).toHaveCount(
    actualWords.length,
  );
  const bridgeTimes: number[] = [];
  for (let index = 0; index < actualWords.length; index++) {
    const bridge = region.locator(".reference-bridge").nth(index);
    await expect(bridge.locator("h4")).toContainText(
      `【${actualWords[index]}】`,
    );
    await expect(bridge.locator("p").first()).toContainText(actualWords[index]);
    await expect(bridge.locator(".reference-return")).toContainText(
      expected.mainIdea,
    );
    bridgeTimes.push(
      Number(
        (await bridge.locator("h4 span").innerText()).match(
          /第\s*(\d+)\s*秒/,
        )![1],
      ),
    );
  }
  await expect(region).not.toContainText("undefined");
  await save(page);
  const [stored] = await sessions(page);
  expect(stored.promptId).toBe(expected.id);
  expect(stored.interruptWords.map(({ word }) => word)).toEqual(actualWords);
  expect(stored.interruptWords.map(({ at }) => at)).toEqual(bridgeTimes);
  expect(JSON.stringify(stored)).not.toContain(expected.development);
});

test("Triple Step 提前结束且没有出现随机词时，不虚构任何桥接词", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  const expected = tripleFor(await review(page, "triple"));
  await expect(page.locator(".word-chips")).toContainText(
    "本轮结束较早，还没有出现随机词。",
  );
  const region = await expand(page);
  await expect(region.locator(".reference-main-idea")).toHaveText(
    expected.mainIdea,
  );
  await expect(region.locator(".reference-bridge")).toHaveCount(0);
  await expect(region).toContainText("本轮结束前还没有出现随机词");
  await save(page);
  expect((await sessions(page))[0].interruptWords).toEqual([]);
});

test("不停说在完成前不显示参考，完成后显示当前词语的口语示范与内容抓手路径", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "free");
  await withoutRecording(page);
  const word = await page.locator(".prompt-card h2").innerText();
  const expected = await getWordReference(word);
  expect(expected).toBeDefined();
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  await page.locator(".content-handles summary").click();
  await noReference(page);
  await expect(page.locator("body")).not.toContainText(expected!.answer);
  await begin(page, 3);
  await page.clock.fastForward(2_000);
  await finish(page);
  await page.getByRole("button", { name: "流畅度 4", exact: true }).click();
  const region = await expand(page);
  await expect(region.locator(".reference-answer")).toHaveText(
    expected!.answer,
  );
  await expect(
    region.getByRole("heading", {
      name: "它是怎么继续讲下去的？",
      exact: true,
    }),
  ).toBeVisible();
  await expect(region.locator(".reference-outline")).toHaveText(
    expected!.outline.join(" → "),
  );
  expect(expected!.outline.length).toBeGreaterThanOrEqual(3);
  await expect(region.getByRole("checkbox")).toHaveCount(0);
  await save(page);
  const [stored] = await sessions(page);
  expect(stored).toMatchObject({
    prompt: word,
    promptId: `word:${word}`,
    selfReview: { 流畅度: 4 },
  });
  expect(JSON.stringify(stored)).not.toContain(expected!.answer);
});

test("桌面参考区域固定最大高度，鼠标滚轮只滚动内部内容", async ({ page }) => {
  await clock(page);
  await home(page);
  await review(page, "triple", 45_000);
  const region = await expand(page);
  await assertInnerScroll(region, 260, 320);
  await region.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  const bodyBefore = await page.evaluate(() => scrollY);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => region.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(
    Math.abs((await page.evaluate(() => scrollY)) - bodyBefore),
  ).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("button", { name: "保存这次练习", exact: true }),
  ).toBeEnabled();
  await noOverflow(page);
});

for (const width of [320, 390]) {
  test(`${width}px 手机触屏：实际手势滚动参考内部，页面和下一项按钮保持可用`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      isMobile: true,
      hasTouch: true,
      viewport: { width, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();
    try {
      await clock(page);
      await home(page);
      expect(
        await page.evaluate(() => navigator.maxTouchPoints),
      ).toBeGreaterThan(0);
      await noOverflow(page);
      await enter(page, "triple");
      await withoutRecording(page);
      await noOverflow(page);
      await page
        .getByRole("textbox", { name: "我的主线", exact: true })
        .fill("把眼前这件小事讲明白。");
      await begin(page);
      await advance(page, 45_000);
      await noOverflow(page);
      await finish(page);
      await noOverflow(page);
      const region = await expand(page);
      await noOverflow(page);
      await assertInnerScroll(region, 220, 280);
      await region.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const box = await region.boundingBox();
      expect(box).not.toBeNull();
      const bodyBefore = await page.evaluate(() => scrollY);
      // The review has no running training timer. Resume animation frames so
      // Chromium can process a real touch sequence and native scroll updates.
      await page.clock.resume();
      const client = await context.newCDPSession(page);
      const x = Math.round(box!.x + box!.width / 2);
      const startY = Math.round(box!.y + box!.height * 0.8);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: startY }],
      });
      for (let step = 1; step <= 8; step++) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: startY - step * 20 }],
        });
        await page.waitForTimeout(25);
      }
      // Finish with the finger held still, avoiding a kinetic fling that would
      // consume the next tap while stopping native scrolling.
      await page.waitForTimeout(200);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: startY - 160 }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(() => region.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      expect(
        Math.abs((await page.evaluate(() => scrollY)) - bodyBefore),
      ).toBeLessThanOrEqual(2);
      await client.detach();
      await noOverflow(page);
      await page
        .getByRole("button", { name: "保存这次练习", exact: true })
        .tap();
      await expect(page.locator(".welcome")).toBeVisible();
      expect(await sessions(page)).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
}

test("今日训练四环节使用新版复盘：三个内容模式可看参考，声音环节保留 A/B 且没有入口", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await page.getByRole("button", { name: "开始今日训练", exact: true }).click();
  const types = ["free", "structured", "triple", "voice"] as const;
  for (let index = 0; index < types.length; index++) {
    const type = types[index];
    await expect(page.locator(".training-header")).toContainText(
      `今日训练 / ${index + 1} OF 4`,
    );
    await noReference(page);
    const prompt = await page.locator(".prompt-card h2").innerText();
    if (type === "voice") {
      await completeVoice(page);
      await expect(page.locator(".voice-ab-play")).toHaveCount(2);
      await expect(page.locator(".review-checks input")).toHaveCount(5);
    } else {
      await withoutRecording(page);
      await begin(page, type === "free" ? 3 : 5);
      await advance(page, type === "triple" ? 45_000 : 2_000);
      await finish(page);
      const region = await expand(page);
      if (type === "free") {
        await expect(region.locator(".reference-answer")).toHaveText(
          (await getWordReference(prompt))!.answer,
        );
        await expect(region.locator(".reference-outline")).toContainText("→");
      } else if (type === "structured") {
        await expect(region.locator(".reference-answer")).toHaveText(
          structuredFor(prompt).answer,
        );
        await region
          .getByRole("checkbox", {
            name: referenceComparisonLabels[0],
            exact: true,
          })
          .check();
      } else {
        const mainIdea = tripleFor(prompt).mainIdea;
        await expect(region.locator(".reference-main-idea")).toHaveText(
          mainIdea,
        );
        const actualWords = await page
          .locator(".word-chips button")
          .allTextContents();
        expect(actualWords).toHaveLength(2);
        await expect(region.locator(".reference-bridge")).toHaveCount(
          actualWords.length,
        );
        for (let word = 0; word < actualWords.length; word++) {
          await expect(
            region.locator(".reference-bridge").nth(word).locator("h4"),
          ).toContainText(`【${actualWords[word]}】`);
          await expect(
            region.locator(".reference-return").nth(word),
          ).toContainText(mainIdea);
        }
      }
    }
    await page
      .getByRole("button", {
        name: index < 3 ? "保存并继续下一项" : "保存，完成今日训练",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("dialog")).toContainText("今日训练完成。");
  await page
    .getByRole("button", { name: "收好今天的进步", exact: true })
    .click();
  const stored = await sessions(page);
  expect(stored).toHaveLength(4);
  expect(new Set(stored.map((session) => session.dailyId)).size).toBe(1);
  expect(stored.every((session) => session.completed && session.dailyId)).toBe(
    true,
  );
  expect(
    stored.find((session) => session.type === "structured")!.selfReview[
      `表达对比 · ${referenceComparisonLabels[0]}`
    ],
  ).toBe(true);
  expect(
    stored.find((session) => session.type === "voice")!.promptId,
  ).toBeUndefined();
});

test("今日训练不打开任何优秀表达也能连续完成下一项，不下载答案模块", async ({
  page,
}) => {
  const loadedAnswers: string[] = [];
  page.on("request", (request) => {
    if (referenceAsset.test(request.url())) loadedAnswers.push(request.url());
  });
  await clock(page);
  await home(page);
  await page.getByRole("button", { name: "开始今日训练", exact: true }).click();
  for (let index = 0; index < 4; index++) {
    await expect(page.locator(".training-header")).toContainText(
      `今日训练 / ${index + 1} OF 4`,
    );
    if (index === 3) await completeVoice(page);
    else {
      await withoutRecording(page);
      await begin(page, index === 0 ? 3 : 5);
      await page.clock.fastForward(2_000);
      await finish(page);
      await expect(
        page.getByRole("button", { name: "看看一种优秀表达", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".reference-panel")).toHaveCount(0);
    }
    await page
      .getByRole("button", {
        name: index < 3 ? "保存并继续下一项" : "保存，完成今日训练",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("dialog")).toContainText("今日训练完成。");
  expect(await sessions(page)).toHaveLength(4);
  expect(loadedAnswers).toEqual([]);
});

test("独立声音唤醒从配置到五遍结束都没有优秀表达入口，也不加载内容答案", async ({
  page,
}) => {
  const loadedAnswers: string[] = [];
  page.on("request", (request) => {
    if (referenceAsset.test(request.url())) loadedAnswers.push(request.url());
  });
  await clock(page);
  await home(page);
  await enter(page, "voice");
  await noReference(page);
  await completeVoice(page);
  await expect(page.locator(".voice-ab-play")).toHaveCount(2);
  await expect(page.locator(".review-checks input")).toHaveCount(5);
  await page.getByRole("button", { name: "有一点区别", exact: true }).click();
  await save(page);
  const [stored] = await sessions(page);
  expect(stored).toMatchObject({
    type: "voice",
    voiceDifferenceRating: "有一点区别",
  });
  expect(
    Object.keys(stored.selfReview).some((key) => key.startsWith("表达对比 · ")),
  ).toBe(false);
  expect(loadedAnswers).toEqual([]);
});

test("v1 / v1.1 旧记录、真实录音 Blob 和设置保留；无 ID 可回查，未知旧题安全降级", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await home(page);
  const legacyWord = words[235];
  const legacyTopic = tripleTopics[0];
  const base = {
    startedAt: Date.now(),
    duration: 60,
    interruptWords: [],
    selfReview: {},
    completed: true,
  };
  const fixtures: Array<
    Omit<TrainingSession, "audio"> & { withAudio?: boolean }
  > = [
    {
      ...base,
      id: "legacy-phase1",
      type: "structured",
      prompt: questions[0].text,
      withAudio: true,
    },
    {
      ...base,
      id: "legacy-phase11",
      type: "free",
      prompt: legacyWord,
      promptHintsUsed: true,
      selfReview: { 流畅度: 4 },
      withAudio: true,
    },
    {
      ...base,
      id: "legacy-triple",
      type: "triple",
      prompt: legacyTopic.text,
      difficulty: "normal",
      mainIdea: "我要先把主动学习这件事讲清楚。",
      promptHintsUsed: true,
      interruptWords: [{ word: "咖啡", at: 14, used: true }],
      withAudio: true,
    },
    {
      ...base,
      id: "legacy-unknown",
      type: "structured",
      prompt: "一条已停用但仍应完整保留的旧题。",
      withAudio: true,
    },
    {
      ...base,
      id: "stable-id",
      type: "structured",
      prompt: "归档前保存的旧标题。",
      promptId: questions[1].id,
    },
    {
      ...base,
      id: "legacy-incomplete",
      type: "structured",
      prompt: questions[2].text,
      completed: false,
    },
    {
      ...base,
      id: "legacy-voice",
      type: "voice",
      prompt: "我会先把这句话说清楚。",
    },
  ];
  const audioSize = await page.evaluate(
    async ({ fixtures }) => {
      // Use the browser's actual MediaRecorder and fake microphone source, not
      // arbitrary bytes that merely claim to be an audio/webm file.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () =>
          reject(new Error("Legacy audio fixture recording failed"));
      });
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 1_300));
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("speakgym", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (database.version !== 1) {
            reject(new Error("IndexedDB version unexpectedly changed"));
            database.close();
            return;
          }
          const tx = database.transaction(
            ["sessions", "settings"],
            "readwrite",
          );
          for (const { withAudio, ...fixture } of fixtures) {
            tx.objectStore("sessions").put({
              ...fixture,
              audio: withAudio
                ? [
                    {
                      id: `audio-${fixture.id}`,
                      label: "原设备录音",
                      blob,
                      duration: 1.3,
                      mimeType: blob.type,
                    },
                  ]
                : [],
            });
          }
          // The original v1 settings deliberately have no freeDuration field.
          tx.objectStore("settings").put(
            {
              defaultDuration: 90,
              autoRecord: false,
              cueSound: false,
              tripleDifficulty: "normal",
              autoDaily: false,
            },
            "app",
          );
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
      return blob.size;
    },
    { fixtures },
  );
  expect(audioSize).toBeGreaterThan(100);
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("默认训练时长", { exact: true })).toHaveValue(
    "90",
  );
  await expect(page.getByLabel("不停说默认时长", { exact: true })).toHaveValue(
    "30",
  );
  await expect(
    page.getByRole("switch", { name: "自动录音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("switch", { name: "随机词提示音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByLabel("不停说默认时长", { exact: true }).selectOption("45");
  await expect(
    page.getByLabel("不停说默认时长", { exact: true }),
  ).toBeEnabled();
  await page.reload();
  await enter(page, "free");
  await expect(
    page.getByRole("button", { name: "45 秒", exact: true }),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("switch", { name: "本轮录音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(fixtures.length);

  await page
    .locator(".history-row")
    .filter({ hasText: questions[0].text })
    .click();
  await expect((await expand(page)).locator(".reference-answer")).toHaveText(
    structuredReferences[questions[0].id].answer,
  );
  const oldAudio = page.getByRole("dialog").locator("audio");
  await expect(oldAudio).toHaveAttribute("src", /^blob:/);
  await oldAudio.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      oldAudio.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
  await oldAudio.evaluate((element: HTMLAudioElement) => element.pause());
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await page.locator(".history-row").filter({ hasText: legacyWord }).click();
  await expect((await expand(page)).locator(".reference-answer")).toHaveText(
    (await getWordReference(legacyWord))!.answer,
  );
  await expect(page.locator(".saved-reviews")).toContainText("流畅度");
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await page
    .locator(".history-row")
    .filter({ hasText: legacyTopic.text })
    .click();
  await expect(page.locator(".history-main-idea")).toContainText(
    "我要先把主动学习这件事讲清楚。",
  );
  const triple = await expand(page);
  await expect(triple.locator(".reference-main-idea")).toHaveText(
    tripleReferences[legacyTopic.id].mainIdea,
  );
  await expect(triple.locator(".reference-bridge")).toHaveCount(1);
  await expect(triple.locator(".reference-bridge h4")).toContainText(
    "【咖啡】",
  );
  await expect(triple.locator(".reference-return")).toContainText(
    tripleReferences[legacyTopic.id].mainIdea,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await page
    .locator(".history-row")
    .filter({ hasText: "归档前保存的旧标题。" })
    .click();
  await expect((await expand(page)).locator(".reference-answer")).toHaveText(
    structuredReferences[questions[1].id].answer,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await page
    .locator(".history-row")
    .filter({ hasText: "一条已停用但仍应完整保留的旧题。" })
    .click();
  await page
    .getByRole("button", { name: "看看一种优秀表达", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "这条旧题暂时没有匹配的本地示范",
  );
  await expect(page.getByRole("dialog").locator("audio")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.locator(".reference-scroll")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  for (const prompt of [questions[2].text, "我会先把这句话说清楚。"]) {
    await page.locator(".history-row").filter({ hasText: prompt }).click();
    await noReference(page);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
  }
  const stored = await sessions(page);
  expect(stored).toHaveLength(fixtures.length);
  expect(
    stored.find((session) => session.id === "legacy-phase1")!.promptId,
  ).toBeUndefined();
  expect(
    stored.find((session) => session.id === "legacy-phase11"),
  ).toMatchObject({ promptHintsUsed: true, selfReview: { 流畅度: 4 } });
  expect(
    stored.find((session) => session.id === "legacy-triple"),
  ).toMatchObject({
    mainIdea: "我要先把主动学习这件事讲清楚。",
    promptHintsUsed: true,
  });
  expect(
    stored
      .filter((session) => session.audio.length)
      .every(
        (session) =>
          session.audio[0].isBlob && session.audio[0].size === audioSize,
      ),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("生产 Service Worker 预缓存所有参考分块，断网重新打开后首次展开三模式和两半词库均可用", async ({
  page,
  context,
}) => {
  await home(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const paths: string[] = [];
    for (const name of names.filter((name) => name.startsWith("speakgym:"))) {
      const cache = await caches.open(name);
      paths.push(
        ...(await cache.keys()).map((request) => new URL(request.url).pathname),
      );
    }
    return paths;
  });
  for (const chunk of ["reference", "structured", "triple", "freeA", "freeB"]) {
    expect(
      cachedPaths.some((path) =>
        new RegExp(`/SpeakGym/assets/${chunk}-[^/]+\\.js$`).test(path),
      ),
      chunk,
    ).toBe(true);
  }
  expect(cachedPaths.every((path) => path.startsWith("/SpeakGym/"))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".welcome")).toBeVisible();
  await clock(page);
  for (const type of ["structured", "triple", "free"] as const) {
    const prompt = await review(page, type, type === "triple" ? 45_000 : 2_000);
    const region = await expand(page);
    if (type === "structured")
      await expect(region.locator(".reference-answer")).toHaveText(
        structuredFor(prompt).answer,
      );
    else if (type === "triple") {
      await expect(region.locator(".reference-main-idea")).toHaveText(
        tripleFor(prompt).mainIdea,
      );
      await expect(region.locator(".reference-bridge")).toHaveCount(2);
    } else
      await expect(region.locator(".reference-answer")).toHaveText(
        (await getWordReference(prompt))!.answer,
      );
    await expect(page.locator(".reference-status")).toHaveCount(0);
    await save(page);
  }
  const edgeWords = [words[0], words[419]];
  await page.evaluate(
    (edgeWords) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("speakgym", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("sessions", "readwrite");
          edgeWords.forEach((word, index) =>
            tx.objectStore("sessions").put({
              id: `offline-word-half-${index}`,
              type: "free",
              prompt: word,
              promptId: `word:${word}`,
              startedAt: Date.now(),
              duration: 30,
              interruptWords: [],
              selfReview: {},
              audio: [],
              completed: true,
            }),
          );
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onabort = () => {
            database.close();
            reject(tx.error);
          };
        };
      }),
    edgeWords,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(5);
  for (const word of edgeWords) {
    await page
      .getByRole("heading", { name: word, exact: true })
      .first()
      .click();
    await expect((await expand(page)).locator(".reference-answer")).toHaveText(
      (await getWordReference(word))!.answer,
    );
    await page.getByRole("button", { name: "关闭", exact: true }).click();
  }
});
