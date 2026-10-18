import type { TrainingType } from "../types";

export type HintTag =
  | "definition"
  | "experience"
  | "example"
  | "opposite"
  | "comparison"
  | "cause"
  | "result"
  | "action";

export interface PromptHint {
  label: string;
  text: string;
}

const thinkingDirections: Record<HintTag, PromptHint> = {
  definition: { label: "定义", text: "你会怎么用自己的话解释它？" },
  experience: { label: "个人经历", text: "你有没有自己的真实经历可以举例？" },
  example: { label: "具体例子", text: "你能想到一个具体的人、场景或事件吗？" },
  opposite: { label: "反面思考", text: "如果缺少它，会发生什么？" },
  comparison: { label: "对比", text: "它和一个相似的概念有什么区别？" },
  cause: { label: "原因", text: "你觉得它为什么会发生？" },
  result: { label: "结果", text: "这件事最后会带来什么影响？" },
  action: { label: "行动", text: "如果让你处理，你会怎么做？" },
};

const structuredHints: PromptHint[] = [
  { label: "WHAT", text: "你觉得这件事到底是什么？" },
  { label: "SO WHAT", text: "它为什么重要，会影响谁？" },
  { label: "NOW WHAT", text: "如果由你来选择或行动，你会怎么做？" },
];

const freeDirections: Partial<Record<HintTag, PromptHint>> = {
  definition: { label: "描述", text: "它长什么样，有什么特点？" },
  experience: { label: "经历", text: "你经历过什么与它有关的事？" },
  comparison: { label: "感受", text: "你喜欢还是不喜欢它？" },
  example: { label: "人物", text: "你能想到一个与它有关的人吗？" },
  cause: { label: "故事", text: "围绕它发生过什么故事？" },
  result: { label: "联想", text: "它让你想到什么？" },
};

const tripleDefaults: HintTag[] = [
  "definition",
  "experience",
  "example",
  "action",
];
const freeDefaults: HintTag[] = [
  "definition",
  "experience",
  "comparison",
  "result",
];

function selectDirections(
  directions: Partial<Record<HintTag, PromptHint>>,
  preferred: HintTag[],
  fallback: HintTag[],
): PromptHint[] {
  const used = new Set<HintTag>();
  const selected: PromptHint[] = [];
  for (const tag of [...preferred, ...fallback]) {
    const hint = directions[tag];
    if (hint && !used.has(tag)) {
      used.add(tag);
      selected.push({ ...hint });
      if (selected.length === 4) break;
    }
  }
  return selected;
}

/** Small questions only: no sample answer, generated point of view, or continuation. */
export function getPromptHints(
  type: TrainingType,
  tags: HintTag[] = [],
): PromptHint[] {
  if (type === "voice") return [];
  if (type === "structured") {
    const extraTag =
      tags.length === 0 || tags.includes("experience")
        ? "experience"
        : (tags.find(
            (tag) =>
              tag === "example" || tag === "comparison" || tag === "opposite",
          ) ?? "experience");
    return [
      ...structuredHints.map((hint) => ({ ...hint })),
      { ...thinkingDirections[extraTag] },
    ];
  }
  if (type === "free")
    return selectDirections(freeDirections, tags, freeDefaults);
  return selectDirections(thinkingDirections, tags, tripleDefaults);
}

export const contentHandles: PromptHint[] = [
  { label: "定义", text: "它是什么？" },
  { label: "例子", text: "我经历过什么？" },
  { label: "反面", text: "如果没有它会怎样？" },
  { label: "结论", text: "所以我怎么看？" },
];
