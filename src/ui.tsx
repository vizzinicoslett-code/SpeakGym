import {
  ArrowUpRight,
  AudioLines,
  Layers3,
  ListTree,
  MessageCircle,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { TrainingType } from "./types";

export const modes = {
  structured: {
    title: "三根钉子",
    english: "Structured Thinking",
    short: "把观点说清楚",
    description:
      "发生了什么，为什么重要，接下来怎么办。用三个支点，撑起一段有条理的表达。",
    color: "green",
    icon: ListTree,
    number: "01",
  },
  triple: {
    title: "Triple Step",
    english: "Stay on Your Track",
    short: "有干扰，也有主线",
    description: "把突然出现的词融进表达。思路可以转个弯，但记得回到你的主线。",
    color: "orange",
    icon: Layers3,
    number: "02",
  },
  voice: {
    title: "声音唤醒",
    english: "Voice Wake-up",
    short: "让声音多一点表情",
    description:
      "同一句话，试着说出五种变化。练习重音、语速、停顿，还有你的表达意图。",
    color: "purple",
    icon: AudioLines,
    number: "03",
  },
  free: {
    title: "不停说",
    english: "Keep Talking",
    short: "先开口，再找感觉",
    description: "从一个简单的词开始，让想法流动起来。放下完美，尽量保持说话。",
    color: "blue",
    icon: MessageCircle,
    number: "04",
  },
} as const;
export const modeOrder: TrainingType[] = [
  "structured",
  "triple",
  "voice",
  "free",
];
export const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.ceil(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;
export const readableDuration = (seconds: number) =>
  seconds < 60
    ? `${Math.round(seconds)} 秒`
    : `${Math.floor(seconds / 60)} 分${Math.round(seconds % 60) ? ` ${Math.round(seconds % 60)} 秒` : ""}`;
export function ModeIcon({
  type,
  large = false,
}: {
  type: TrainingType;
  large?: boolean;
}) {
  const Icon = modes[type].icon;
  return (
    <span className={`mode-icon ${modes[type].color} ${large ? "large" : ""}`}>
      <Icon size={large ? 32 : 24} strokeWidth={1.7} />
    </span>
  );
}
export function ArrowLink() {
  return <ArrowUpRight size={19} aria-hidden="true" />;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = panel.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={panel}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
