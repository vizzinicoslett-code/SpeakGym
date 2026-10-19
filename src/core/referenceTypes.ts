import type { TrainingType } from "../types";

export interface ReferenceContext {
  type: TrainingType;
  prompt: string;
  promptId?: string;
  interruptWords: { word: string; at: number }[];
  completed: boolean;
}
export interface ReferenceBridge {
  word: string;
  at: number;
  strategy: string;
  connection: string;
  returnLine: string;
}
export type ReferenceExpression =
  | { type: "structured" | "free"; answer: string; outline: string[] }
  | {
      type: "triple";
      mainIdea: string;
      development: string;
      bridges: ReferenceBridge[];
      closing: string;
    };

export const referenceComparisonLabels = [
  "核心观点比我更明确",
  "多用了一个具体例子",
  "把“为什么”解释得更清楚",
  "内容层次更连贯",
  "结尾更完整",
  "我发现了一种下次可以借鉴的表达",
] as const;
