import type { VoiceLine } from "./voiceLines";

export interface SpeedPattern {
  id: "frontfastslow" | "frontslowfast" | "allslow" | "allfast";
  label: string;
  instruction: string;
}

export interface VoiceScene {
  id: string;
  text: string;
}

export const voiceSteps = [
  { label: "自然说", hint: "按你平时的方式说一遍。" },
  {
    label: "关键词强调",
    hint: "这一遍故意夸张一点。把高亮的词重读、拉长，或在它前后停一下。",
  },
  {
    label: "强制停顿",
    hint: "看到 —— 就停一下，每处约 0.5～1 秒，让停顿明显可听见。",
  },
  { label: "语速对比", hint: "这一遍不要自然，故意把差异做大。" },
  {
    label: "情境与意图",
    hint: "想象你正在面对这个人，把语气、重音和停顿都带进去。",
  },
] as const;

export const speedPatterns: readonly SpeedPattern[] = [
  {
    id: "frontfastslow",
    label: "前快后慢",
    instruction:
      "前半句明显加快，后半句明显放慢。把速度的变化做大，同时说清每一个字。",
  },
  {
    id: "frontslowfast",
    label: "前慢后快",
    instruction:
      "前半句明显放慢，后半句明显加快。让听的人能一下听出前后的差别。",
  },
  {
    id: "allslow",
    label: "整体放慢",
    instruction: "把整句话明显放慢，留出思考和呼吸的空间。不要只把音量变小。",
  },
  {
    id: "allfast",
    label: "整体加快",
    instruction:
      "比平时明显加快，把整句话连贯地说出来。仍要让每个字都能听清楚。",
  },
];

export const voiceScenes: readonly VoiceScene[] = [
  {
    id: "persuade-dissenter",
    text: "假设你正在说服一个不同意你的人，用坚定的方式说。",
  },
  { id: "unexpected-result", text: "假设你刚刚发现一个非常意外的结果。" },
  { id: "comfort-friend", text: "假设你正在安慰一个很难过的朋友。" },
  {
    id: "explain-misunderstanding",
    text: "假设同事误解了你的意思，你想认真地把话解释清楚。",
  },
  {
    id: "share-good-news",
    text: "假设等待很久的好消息终于来了，你迫不及待地告诉家人。",
  },
  {
    id: "hold-boundary",
    text: "假设有人再次提出让你为难的请求，你要平静而坚决地说出自己的立场。",
  },
];

/** Keep the sentence and punctuation; only replace the stored pause dividers. */
export function getVoicePauseText(
  line: Pick<VoiceLine, "text" | "keyword" | "pauseText">,
): string {
  const parts = (line.pauseText || line.text).split(/\s*\/\s*/);
  if (parts.length === 1) return line.text;
  const boundaries: number[] = [];
  let position = 0;
  for (const part of parts.slice(0, -1)) {
    const content = part.trim();
    const start = line.text.indexOf(content, position);
    if (!content || start < 0 || line.text.slice(position, start).trim())
      return line.text;
    position = start + content.length;
    boundaries.push(position);
  }
  if (line.text.slice(position).trim() !== parts.at(-1)!.trim())
    return line.text;
  // Slice the original, so punctuation, intentional spaces and line breaks survive.
  let previous = 0;
  return [...boundaries, line.text.length]
    .map((boundary) => {
      const text = line.text.slice(previous, boundary);
      previous = boundary;
      return text;
    })
    .join(" —— ");
}

export const voiceReviewLabels = [
  "关键词真的被强调了",
  "停顿明显可听见",
  "语速有明显变化",
  "情绪 / 意图和自然版本不同",
  "Take 1 和 Take 5 能听出差异",
] as const;

export const differenceRatings = [
  "差别很明显",
  "有一点区别",
  "几乎没区别",
] as const;

export const noDifferenceTip =
  "下一轮可以把变化做得更夸张。训练时夸张一些，实际交流时再收回来。";
