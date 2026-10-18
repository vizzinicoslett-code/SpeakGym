import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getTripleTopics, questions } from "../src/data/questions";
import type { Difficulty, TrainingSession, TrainingType } from "../src/types";

const cards: Record<TrainingType, string> = {
  structured: ".mode-card.green",
  triple: ".mode-card.orange",
  voice: ".mode-card.purple",
  free: ".mode-card.blue",
};
const reviewLabels = [
  "关键词真的被强调了",
  "停顿明显可听见",
  "语速有明显变化",
  "情绪 / 意图和自然版本不同",
  "Take 1 和 Take 5 能听出差异",
];

async function clock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-18T01:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-18T01:00:01Z"));
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

async function begin(page: Page, prepSeconds = 5) {
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await page.clock.fastForward(prepSeconds * 1_000);
  await expect(page.getByRole("timer")).toBeVisible();
}

async function finishAndSave(page: Page) {
  await page.getByRole("button", { name: "结束训练", exact: true }).click();
  await expect(page.locator(".phase-review")).toBeVisible();
  await save(page);
}

async function save(page: Page) {
  await page.getByRole("button", { name: "保存这次练习", exact: true }).click();
  await expect(page.locator(".welcome")).toBeVisible();
}

async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        Array<{
          type: string;
          prompt: string;
          mainIdea?: string;
          promptHintsUsed?: boolean;
          voiceDifferenceRating?: string;
          selfReview: Record<string, boolean | number | string>;
          audio: { size: number; type: string; isBlob: boolean }[];
        }>
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
                type: session.type,
                prompt: session.prompt,
                mainIdea: session.mainIdea,
                promptHintsUsed: session.promptHintsUsed,
                voiceDifferenceRating: session.voiceDifferenceRating,
                selfReview: session.selfReview,
                audio: session.audio.map((take: { blob: Blob }) => ({
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
  const { width, content } = await page.evaluate(() => ({
    width: innerWidth,
    content: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));
  expect(content).toBeLessThanOrEqual(width + 1);
}

async function completeVoiceWithoutRecording(page: Page) {
  await withoutRecording(page);
  await begin(page);
  for (let take = 0; take < 5; take++) {
    await page.clock.fastForward(12_000);
    if (take < 4) {
      await page
        .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
        .click();
      await expect(page.getByRole("timer")).toBeVisible();
    }
  }
  await expect(page.locator(".phase-review")).toBeVisible();
}

test("不停说思路提示默认收起，只给问题和四个抓手，讲话时隐藏并保存使用状态", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "free");
  await withoutRecording(page);
  const toggle = page.getByRole("button", { name: "没思路？", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "给我一点思路" })).toHaveCount(
    0,
  );
  await expect(page.locator(".content-handles")).not.toHaveAttribute("open");
  await toggle.click();
  const hints = page.getByRole("region", { name: "给我一点思路" });
  const prompts = await hints.locator("li").allTextContents();
  expect(prompts.length).toBeGreaterThan(0);
  expect(prompts.length).toBeLessThanOrEqual(4);
  expect(prompts.every((prompt) => /[？?]$/.test(prompt.trim()))).toBe(true);
  await page.locator(".content-handles summary").click();
  await expect(page.locator(".content-handles dt")).toHaveText([
    "定义",
    "例子",
    "反面",
    "结论",
  ]);
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "没思路？", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(3_000);
  await expect(page.getByRole("timer")).toHaveText("00:30");
  await expect(page.locator(".thinking-tools")).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await save(page);
  expect((await records(page))[0]).toMatchObject({
    type: "free",
    promptHintsUsed: true,
  });
});

test("三根钉子的分类仍能换题，提示保留 WHAT 结构并随题重置", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "structured");
  await withoutRecording(page);
  const category = page.getByLabel("题目分类", { exact: true });
  await expect(category.locator("option")).toHaveCount(9);
  await category.selectOption("日常生活");
  const everyday = await page.locator(".prompt-card h2").innerText();
  expect(
    questions.some(
      (question) =>
        question.text === everyday && question.category === "日常生活",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  const hints = page.getByRole("region", { name: "给我一点思路" });
  await expect(hints.locator("li > span")).toHaveText([
    "WHAT",
    "SO WHAT",
    "NOW WHAT",
    "个人经历",
  ]);
  await expect(hints).toContainText("你有没有自己的真实经历可以举例？");
  await category.selectOption("抽象思考");
  await expect(
    page.getByRole("button", { name: "没思路？", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  const abstract = await page.locator(".prompt-card h2").innerText();
  expect(
    questions.some(
      (question) =>
        question.text === abstract && question.category === "抽象思考",
    ),
  ).toBe(true);
  await page.locator(".content-handles summary").click();
  await page.getByRole("button", { name: "30 秒", exact: true }).click();
  await begin(page);
  await page.clock.fastForward(30_000);
  await save(page);
  expect((await records(page))[0]).toMatchObject({
    type: "structured",
    prompt: abstract,
    promptHintsUsed: true,
  });
});

test("Triple Step 主线输入不触发快捷键，讲话和随机词出现后仍可见并完整保存", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await clock(page);
  await home(page);
  await enter(page, "triple");
  await withoutRecording(page);
  const input = page.getByRole("textbox", { name: "我的主线", exact: true });
  await expect(input).toHaveAttribute("maxlength", "160");
  await input.fill("每天练习");
  await input.press("End");
  for (const key of ["Space", "r", "n", "Enter", "Escape"])
    await input.press(key);
  await expect(input).toHaveValue("每天练习 rn");
  await expect(page.locator(".phase-setup")).toBeVisible();
  const idea = "每天给自己留一点开口练习的时间，比等到准备完美更重要。";
  await input.fill(`  ${idea}  `);
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  const topic = await page.locator(".prompt-card h2").innerText();
  await begin(page);
  await expect(page.locator(".main-idea-reminder")).toContainText(idea);
  await page.clock.fastForward(20_000);
  await expect(page.locator(".interrupt-stage strong")).toBeVisible();
  await expect(page.locator(".main-idea-reminder")).toContainText(idea);
  await expect(page.locator(".active-prompt")).toHaveText(topic);
  await finishAndSave(page);
  expect((await records(page))[0]).toMatchObject({
    type: "triple",
    mainIdea: idea,
    promptHintsUsed: true,
  });
});

test("Triple Step 可跳过已填写的主线，仍经过五秒准备且保存无主线记录", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "triple");
  await withoutRecording(page);
  await page
    .getByRole("textbox", { name: "我的主线", exact: true })
    .fill("这一句不应被保存");
  await page
    .getByRole("button", { name: "跳过主线，开始训练", exact: true })
    .click();
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await expect(page.locator(".prepare-number")).toHaveText("5");
  await page.clock.fastForward(4_000);
  await expect(page.locator(".phase-preparing")).toBeVisible();
  await page.clock.fastForward(1_000);
  await expect(page.getByRole("timer")).toHaveText("01:00");
  await expect(page.locator(".main-idea-reminder")).toHaveCount(0);
  await page.clock.fastForward(3_000);
  await finishAndSave(page);
  expect((await records(page))[0].mainIdea).toBeUndefined();
});

test("Triple Step 换题和换难度清除旧主线及旧提示使用状态", async ({ page }) => {
  await clock(page);
  await home(page);
  await enter(page, "triple");
  await withoutRecording(page);
  const input = page.getByRole("textbox", { name: "我的主线", exact: true });
  await input.fill("旧话题的想法");
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  const previous = await page.locator(".prompt-card h2").innerText();
  await page.locator(".training-title").click();
  await page.keyboard.press("n");
  await expect(input).toHaveValue("");
  await expect(page.locator(".prompt-card h2")).not.toHaveText(previous);
  await expect(
    page.getByRole("button", { name: "没思路？", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await input.fill("另一个尚未确定的想法");
  await page.getByRole("button", { name: "没思路？", exact: true }).click();
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "没思路？", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await begin(page);
  await page.clock.fastForward(3_000);
  await finishAndSave(page);
  expect((await records(page))[0]).toMatchObject({
    type: "triple",
    promptHintsUsed: false,
  });
  expect((await records(page))[0].mainIdea).toBeUndefined();
});

test("Triple Step 新用户默认 Easy，四档难度和换题始终使用相应话题库", async ({
  page,
}) => {
  await home(page);
  await enter(page, "triple");
  await expect(
    page.getByRole("button", { name: "Easy", exact: true }),
  ).toHaveClass(/selected/);
  for (const difficulty of [
    "easy",
    "normal",
    "hard",
    "chaos",
  ] as Difficulty[]) {
    const label = difficulty[0].toUpperCase() + difficulty.slice(1);
    await page.getByRole("button", { name: label, exact: true }).click();
    for (let round = 0; round < 3; round++) {
      const prompt = await page.locator(".prompt-card h2").innerText();
      expect(
        getTripleTopics(difficulty).some((topic) => topic.text === prompt),
      ).toBe(true);
      await page.getByRole("button", { name: /^换一个/ }).click();
      await expect(page.locator(".prompt-card h2")).not.toHaveText(prompt);
    }
  }
  await expect(page.locator(".topic-difficulty-note")).toContainText(
    "全部话题",
  );
});

test("声音五遍按自然、强调、强制停顿、语速、情境排列；无录音仍可保存五项自评和差异", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  await enter(page, "voice");
  await withoutRecording(page);
  const sentence = await page.locator(".prompt-card h2").innerText();
  await expect(page.locator(".thinking-tools")).toHaveCount(0);
  await begin(page);
  for (let take = 0; take < 5; take++) {
    await expect(page.getByRole("timer")).toHaveText("00:12");
    if (take === 0)
      await expect(page.locator(".voice-direction")).toContainText(
        "按你平时的方式说一遍",
      );
    if (take === 1) {
      await expect(page.locator(".active-prompt mark")).toBeVisible();
      await expect(page.locator(".voice-direction")).toContainText(
        "故意夸张一点",
      );
    }
    if (take === 2) {
      await expect(page.locator(".active-prompt")).toContainText("——");
      await expect(page.locator(".voice-direction")).toContainText("0.5～1 秒");
      expect(
        (await page.locator(".active-prompt").innerText()).replace(
          /\s*——\s*/g,
          "",
        ),
      ).toBe(sentence);
    }
    if (take === 3) {
      await expect(page.locator(".voice-speed-pattern")).toHaveText(
        /前快后慢|前慢后快|整体放慢|整体加快/,
      );
      await expect(page.locator(".voice-direction")).toContainText(
        "这一遍不要自然，故意把差异做大。",
      );
    }
    if (take === 4) {
      await expect(page.locator(".voice-direction strong")).toContainText(
        "假设",
      );
      expect(
        (await page.locator(".voice-direction strong").innerText()).length,
      ).toBeGreaterThan(15);
      await expect(page.locator(".active-prompt")).toHaveText(sentence);
    }
    await page.clock.fastForward(12_000);
    if (take < 4)
      await page
        .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
        .click();
  }
  await expect(page.locator(".voice-ab-play")).toHaveCount(2);
  for (const button of await page.locator(".voice-ab-play").all())
    await expect(button).toBeDisabled();
  await expect(page.locator(".voice-ab-unavailable")).toHaveCount(2);
  await expect(page.locator(".review-checks input[type=checkbox]")).toHaveCount(
    5,
  );
  for (const label of reviewLabels)
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByRole("button", { name: "几乎没区别", exact: true }).click();
  await expect(page.locator(".voice-difference-tip")).toHaveText(
    "下一轮可以把变化做得更夸张。训练时夸张一些，实际交流时再收回来。",
  );
  await page.getByRole("button", { name: "有一点区别", exact: true }).click();
  await expect(page.locator(".voice-difference-tip")).toHaveCount(0);
  await page.getByRole("button", { name: "几乎没区别", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "几乎没区别", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await save(page);
  const [saved] = await records(page);
  expect(saved.voiceDifferenceRating).toBe("几乎没区别");
  expect(saved.selfReview).toEqual(
    Object.fromEntries(reviewLabels.map((label) => [label, true])),
  );
  expect(saved.audio).toHaveLength(0);
});

test("语速训练四种随机模式都能进入第四遍，指令保持明显对比", async ({
  context,
}) => {
  const patterns = ["前快后慢", "前慢后快", "整体放慢", "整体加快"];
  for (let index = 0; index < patterns.length; index++) {
    const page = await context.newPage();
    await page.addInitScript(
      (value) => {
        Math.random = () => value;
      },
      (index + 0.1) / 4,
    );
    await clock(page);
    await home(page);
    await enter(page, "voice");
    await withoutRecording(page);
    await begin(page);
    for (let take = 0; take < 3; take++) {
      await page.clock.fastForward(12_000);
      await page
        .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
        .click();
    }
    await expect(page.locator(".voice-speed-pattern")).toHaveText(
      patterns[index],
    );
    await expect(page.locator(".voice-guidance-detail")).not.toBeEmpty();
    await page.close();
  }
});

test("声音 A/B 使用真实录音 Blob，Take 1、Take 5 和原始播放器互斥播放后可保存", async ({
  page,
}) => {
  await home(page);
  await enter(page, "voice");
  await page.getByRole("button", { name: "开始训练", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  for (let take = 0; take < 5; take++) {
    await expect(page.locator(".recording-indicator")).toContainText(
      "正在本地录音",
    );
    await page.waitForTimeout(take === 0 || take === 4 ? 1_800 : 300);
    await page.getByRole("button", { name: "结束这一遍", exact: true }).click();
    if (take < 4) {
      await expect(page.locator(".phase-between")).toBeVisible();
      await page
        .getByRole("button", { name: `开始第 ${take + 2} 遍`, exact: true })
        .click();
      await expect(page.getByRole("timer")).toBeVisible();
    }
  }
  await expect(page.locator(".phase-review")).toBeVisible();
  const natural = page.getByLabel("Take 1 自然版本录音", { exact: true });
  const scene = page.getByLabel("Take 5 场景版本录音", { exact: true });
  await expect(natural).toHaveAttribute("src", /^blob:/);
  await expect(scene).toHaveAttribute("src", /^blob:/);
  await page
    .getByRole("button", { name: "播放 Take 1 自然版本", exact: true })
    .click();
  await expect
    .poll(() =>
      natural.evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "播放 Take 5 场景版本", exact: true })
    .click();
  await expect
    .poll(() => natural.evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
  await expect
    .poll(() => scene.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0);
  await page
    .locator(".audio-grid audio")
    .nth(1)
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await expect
    .poll(() => scene.evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(true);
  await save(page);
  const [saved] = await records(page);
  expect(saved.audio).toHaveLength(5);
  expect(
    saved.audio.every(
      (take) => take.isBlob && take.size > 0 && take.type.startsWith("audio/"),
    ),
  ).toBe(true);
});

test("已有 v1 记录、Blob 和 Normal 设置保留，新增可选字段缺失不会阻止打开详情", async ({
  page,
}) => {
  await home(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("speakgym", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (database.version !== 1) {
            reject(new Error("Database version changed"));
            return;
          }
          const tx = database.transaction(
            ["sessions", "settings"],
            "readwrite",
          );
          tx.objectStore("sessions").put({
            id: "phase-1-existing",
            type: "triple",
            startedAt: Date.now(),
            duration: 60,
            prompt: "旧版练习：你认为大学最重要的能力是什么？",
            difficulty: "normal",
            interruptWords: [{ word: "咖啡", at: 14, used: true }],
            selfReview: { 我保持了原来的主线: true },
            audio: [
              {
                id: "old-take",
                label: "旧版录音",
                blob: new Blob(["legacy-device-audio"], { type: "audio/webm" }),
                duration: 60,
                mimeType: "audio/webm",
              },
            ],
            completed: true,
          });
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
      }),
  );
  await page.reload();
  await expect(page.locator(".welcome")).toBeVisible();
  await enter(page, "triple");
  await expect(
    page.getByRole("button", { name: "Normal", exact: true }),
  ).toHaveClass(/selected/);
  await expect(
    page.getByRole("switch", { name: "本轮录音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  await page.getByRole("button", { name: "训练记录", exact: true }).click();
  await page.locator(".history-row").click();
  await expect(page.getByRole("dialog")).toContainText("旧版练习");
  await expect(page.getByRole("dialog").locator("audio")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const [saved] = await records(page);
  expect(saved.mainIdea).toBeUndefined();
  expect(saved.promptHintsUsed).toBeUndefined();
  expect(saved.voiceDifferenceRating).toBeUndefined();
  expect(saved.audio).toEqual([{ size: 19, type: "audio/webm", isBlob: true }]);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("默认训练时长", { exact: true })).toHaveValue(
    "90",
  );
  await expect(page.getByLabel("不停说默认时长", { exact: true })).toHaveValue(
    "30",
  );
  await expect(
    page.getByRole("switch", { name: "随机词提示音", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
});

test("320 / 390 像素下展开提示、主线输入和五遍声音对比自评不产生横向溢出", async ({
  page,
}) => {
  await clock(page);
  await home(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await enter(page, "free");
    await page.getByRole("button", { name: "没思路？", exact: true }).click();
    await page.locator(".content-handles summary").click();
    await noOverflow(page);
    await page.getByRole("button", { name: "返回训练场", exact: true }).click();
    await enter(page, "triple");
    await page
      .getByRole("textbox", { name: "我的主线", exact: true })
      .fill("每天留一点时间开口练习，慢慢把脑子里的想法说清楚。");
    await page.getByRole("button", { name: "没思路？", exact: true }).click();
    await noOverflow(page);
    await withoutRecording(page);
    await begin(page);
    await noOverflow(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "返回训练场", exact: true }).click();
    await enter(page, "voice");
    await completeVoiceWithoutRecording(page);
    await noOverflow(page);
    await page.getByRole("button", { name: "几乎没区别", exact: true }).click();
    await noOverflow(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "返回训练场", exact: true }).click();
  }
});
