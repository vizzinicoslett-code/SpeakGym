import { describe, expect, it } from "vitest";
import { voiceLines } from "./voiceLines";
import {
  differenceRatings,
  getVoicePauseText,
  noDifferenceTip,
  speedPatterns,
  voiceReviewLabels,
  voiceScenes,
  voiceSteps,
} from "./voiceGuidance";

describe("voice training guidance", () => {
  it("puts forced pauses before speed contrast and keeps natural speech as the baseline", () => {
    expect(voiceSteps.map((step) => step.label)).toEqual([
      "自然说",
      "关键词强调",
      "强制停顿",
      "语速对比",
      "情境与意图",
    ]);
    expect(voiceSteps[0].hint).toBe("按你平时的方式说一遍。");
    expect(voiceSteps[1].hint).toContain("这一遍故意夸张一点");
    expect(voiceSteps[2].hint).toContain("0.5～1 秒");
    expect(voiceSteps[3].hint).toBe("这一遍不要自然，故意把差异做大。");
  });

  it("provides all four distinct speed contrasts with an actionable instruction", () => {
    expect(speedPatterns.map((pattern) => pattern.id)).toEqual([
      "frontfastslow",
      "frontslowfast",
      "allslow",
      "allfast",
    ]);
    expect(speedPatterns.map((pattern) => pattern.label)).toEqual([
      "前快后慢",
      "前慢后快",
      "整体放慢",
      "整体加快",
    ]);
    expect(
      speedPatterns.every((pattern) => pattern.instruction.length >= 20),
    ).toBe(true);
    expect(speedPatterns[0].instruction).toMatch(/前半句.*加快.*后半句.*放慢/);
    expect(speedPatterns[1].instruction).toMatch(/前半句.*放慢.*后半句.*加快/);
  });

  it("uses concrete interpersonal scenes instead of abstract emotion labels", () => {
    expect(voiceScenes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(voiceScenes.map((scene) => scene.id)).size).toBe(
      voiceScenes.length,
    );
    expect(
      voiceScenes.every(
        (scene) => scene.text.startsWith("假设") && scene.text.length >= 16,
      ),
    ).toBe(true);
    expect(voiceScenes.map((scene) => scene.text)).toEqual(
      expect.arrayContaining([
        "假设你正在说服一个不同意你的人，用坚定的方式说。",
        "假设你刚刚发现一个非常意外的结果。",
        "假设你正在安慰一个很难过的朋友。",
      ]),
    );
  });

  it("replaces every stored slash with a visible pause while preserving every sentence and punctuation", () => {
    expect(voiceLines.length).toBeGreaterThanOrEqual(60);
    for (const line of voiceLines) {
      const marked = getVoicePauseText(line);
      expect(marked).not.toContain("/");
      expect(marked).toContain(" —— ");
      expect(marked.replaceAll(" —— ", "")).toBe(line.text);
      expect(marked.split(" —— ").length - 1).toBe(
        line.pauseText.split("/").length - 1,
      );
    }
  });

  it("keeps mixed-language characters and punctuation and falls back to the unmarked sentence", () => {
    expect(
      getVoicePauseText({
        text: "计划A：先试3天，再做决定。",
        keyword: "3天",
        pauseText: "计划A： / 先试3天，/ 再做决定。",
      }),
    ).toBe("计划A： —— 先试3天， —— 再做决定。");
    expect(
      getVoicePauseText({ text: "先试一试。", keyword: "试", pauseText: "" }),
    ).toBe("先试一试。");
    const text = "计划 A：先试 3 天，\n再做决定。";
    const marked = getVoicePauseText({
      text,
      keyword: "3 天",
      pauseText: "计划 A： / 先试 3 天， / 再做决定。",
    });
    expect(marked.replaceAll(" —— ", "")).toBe(text);
    expect(
      getVoicePauseText({
        text: "原来的句子。",
        keyword: "句子",
        pauseText: "旧的 / 句子。",
      }),
    ).toBe("原来的句子。");
  });

  it("keeps the five self-observations and three difference choices exact", () => {
    expect(voiceReviewLabels).toEqual([
      "关键词真的被强调了",
      "停顿明显可听见",
      "语速有明显变化",
      "情绪 / 意图和自然版本不同",
      "Take 1 和 Take 5 能听出差异",
    ]);
    expect(differenceRatings).toEqual([
      "差别很明显",
      "有一点区别",
      "几乎没区别",
    ]);
    expect(noDifferenceTip).toBe(
      "下一轮可以把变化做得更夸张。训练时夸张一些，实际交流时再收回来。",
    );
  });
});
