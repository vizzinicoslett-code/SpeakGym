import { ChevronDown, Lightbulb } from "lucide-react";
import type { TrainingType } from "../types";
import { contentHandles, getPromptHints } from "../data/promptHints";
import type { HintTag } from "../data/promptHints";

export default function ThinkingHints({
  type,
  tags,
  open,
  onOpenChange,
  onUse,
}: {
  type: Exclude<TrainingType, "voice">;
  tags?: HintTag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: () => void;
}) {
  return (
    <div className="thinking-tools">
      <div className="thinking-hints">
        <button
          type="button"
          className="text-button hint-toggle"
          aria-expanded={open}
          aria-controls="prompt-hints"
          onClick={() => {
            onOpenChange(!open);
            if (!open) onUse();
          }}
        >
          <Lightbulb size={15} />
          没思路？
          <ChevronDown size={13} className={open ? "expanded" : ""} />
        </button>
        {open && (
          <section
            id="prompt-hints"
            className="hint-panel"
            aria-label="给我一点思路"
          >
            <h3>给我一点思路</h3>
            <ul>
              {getPromptHints(type, tags).map((hint) => (
                <li key={hint.label}>
                  <span>{hint.label}</span>
                  {hint.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {(type === "structured" || type === "free") && (
        <details
          className="content-handles"
          onToggle={(event) => {
            if (event.currentTarget.open) onUse();
          }}
        >
          <summary>
            不知道说什么时，找四个抓手：<span>定义 → 例子 → 反面 → 结论</span>
          </summary>
          <dl>
            {contentHandles.map((handle) => (
              <div key={handle.label}>
                <dt>{handle.label}</dt>
                <dd>{handle.text}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
