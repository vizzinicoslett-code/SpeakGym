import { describe, expect, it } from "vitest";
import { questions } from "../questions";
import { structuredReferences } from "./structured";

const countHan = (text: string) => text.match(/\p{Script=Han}/gu)?.length ?? 0;

describe("individually authored structured review references", () => {
  it("covers all 112 original question IDs exactly, without category-level fallbacks", () => {
    expect(questions).toHaveLength(112);
    expect(Object.keys(structuredReferences).sort()).toEqual(
      questions.map((question) => question.id).sort(),
    );
  });

  it("provides a complete oral Chinese paragraph of 100–180 Han characters for every question", () => {
    for (const question of questions) {
      const { answer } = structuredReferences[question.id];
      expect(countHan(answer), question.id).toBeGreaterThanOrEqual(100);
      expect(countHan(answer), question.id).toBeLessThanOrEqual(180);
      expect(answer, question.id).toBe(answer.trim());
      expect(answer, question.id).toMatch(/。$/);
      expect(
        answer.split("。").filter(Boolean).length,
        question.id,
      ).toBeGreaterThanOrEqual(3);
      expect(answer, question.id).not.toMatch(
        /what|首先|其次|最后总结|参考答案待补充|TODO|首先阐述|综上所述/i,
      );
    }
  });

  it("does not recycle answers, long boilerplate, or empty motivational conclusions", () => {
    const answers = Object.values(structuredReferences).map(
      ({ answer }) => answer,
    );
    expect(new Set(answers).size).toBe(112);
    const phraseOwners = new Map<string, string>();
    for (const [id, { answer }] of Object.entries(structuredReferences)) {
      expect(answer, id).not.toMatch(
        /在当今社会|让我们携手|只要努力就一定|没有什么是不可能|实现人生价值|每个人都有自己的答案|坚持就是胜利/,
      );
      // A shared 24-character stretch would indicate a reusable paragraph
      // skeleton rather than the question-specific examples this bank requires.
      const han = answer.match(/\p{Script=Han}/gu)?.join("") ?? "";
      for (let start = 0; start <= han.length - 24; start += 1) {
        const phrase = han.slice(start, start + 24);
        const previousOwner = phraseOwners.get(phrase);
        expect(
          previousOwner === undefined || previousOwner === id,
          `${id}: ${phrase}`,
        ).toBe(true);
        phraseOwners.set(phrase, id);
      }
    }
  });

  it("gives each reference three distinct short outlines that explain its own progression", () => {
    for (const [id, { outline }] of Object.entries(structuredReferences)) {
      expect(outline, id).toHaveLength(3);
      expect(new Set(outline).size, id).toBe(3);
      for (const point of outline) {
        expect(countHan(point), id).toBeGreaterThanOrEqual(4);
        expect(countHan(point), id).toBeLessThanOrEqual(20);
        expect(point, id).toBe(point.trim());
        expect(point, id).not.toMatch(/what|^观点$|^原因$|^行动$|^总结$/i);
      }
    }
  });

  it("retains concrete examples and relevant conclusions across all eight categories", () => {
    const examples: [string, RegExp[]][] = [
      ["question-life-01", [/白天/, /放松/, /手机放到够不着/]],
      ["question-life-08", [/通勤/, /房租/, /试走一次/]],
      ["question-learning-05", [/条件略有变化/, /过一天/, /迁移/]],
      ["question-learning-13", [/概率/, /公式/, /追问/]],
      ["question-relationships-02", [/玩笑/, /换一个/, /私下/]],
      ["question-relationships-12", [/集合地点/, /几点前答复/, /预期/]],
      ["question-opinions-04", [/画画/, /客户/, /生计/]],
      ["question-opinions-10", [/团队和运气/, /负责哪部分/, /稳定性/]],
      ["question-experiences-03", [/越说越乱/, /让我理一下/, /稍后补充/]],
      ["question-experiences-14", [/刚才我还没讲完/, /失落/, /可执行的请求/]],
      ["question-thinking-02", [/点餐菜单/, /拒绝/, /取舍/]],
      ["question-thinking-11", [/面试官/, /今天能做/, /自己能影响/]],
      ["question-technology-05", [/手电筒/, /通讯录/, /最低必要权限/]],
      ["question-technology-10", [/发照片/, /自己操作/, /怎么退回/]],
      ["question-campus-06", [/十一点/, /关大灯/, /先试一周/]],
      ["question-campus-11", [/旧书交流/, /教室/, /确定愿意来/]],
    ];
    for (const [id, anchors] of examples) {
      for (const anchor of anchors) {
        expect(structuredReferences[id].answer, id).toMatch(anchor);
      }
    }
  });
});
