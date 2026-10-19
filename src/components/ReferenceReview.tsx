import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import type {
  ReferenceContext,
  ReferenceExpression,
} from "../core/referenceTypes";
import { referenceComparisonLabels } from "../core/referenceTypes";
import "./reference.css";

export default function ReferenceReview({
  context,
  selfReview = {},
  onCompare,
}: {
  context: ReferenceContext;
  selfReview?: Record<string, boolean | number | string>;
  onCompare?: (key: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<ReferenceExpression>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const generation = useRef(0);
  const panelId = useId();
  const contextKey = JSON.stringify([
    context.type,
    context.promptId,
    context.prompt,
    context.completed,
    context.interruptWords.map(({ word, at }) => [word, at]),
  ]);
  useEffect(() => {
    generation.current += 1;
    setOpen(false);
    setReference(undefined);
    setLoading(false);
    setError("");
    setUnavailable(false);
    return () => {
      generation.current += 1;
    };
  }, [contextKey]);

  // Neither the loader nor the answer modules are imported before this completed
  // review is explicitly expanded. Prepared/speaking screens never mount it.
  const load = async () => {
    if (!context.completed || context.type === "voice" || reference || loading)
      return;
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const { loadReference } = await import("../core/reference");
      const result = await loadReference(context);
      if (generation.current !== request) return;
      setReference(result);
      setUnavailable(!result);
    } catch {
      if (generation.current === request)
        setError(
          "暂时无法读取本地参考内容，请稍后重试。训练记录和录音仍可正常保存。",
        );
    } finally {
      if (generation.current === request) setLoading(false);
    }
  };
  if (!context.completed || context.type === "voice") return null;
  return (
    <section className="reference-review">
      <button
        type="button"
        className="text-button reference-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        <BookOpen size={16} />
        {open ? "收起一种优秀表达" : "看看一种优秀表达"}
        <ChevronDown size={14} className={open ? "expanded" : ""} />
      </button>
      {open && (
        <div className="reference-panel" id={panelId}>
          <h2>一种优秀表达</h2>
          <p className="reference-note">
            这不是唯一答案，重点观察它怎样展开内容、连接观点和完成收尾。
          </p>
          {loading && (
            <p className="reference-status" role="status">
              正在读取本地示范…
            </p>
          )}
          {error && (
            <div className="reference-status" role="status">
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => {
                  void load();
                }}
              >
                重新读取
              </button>
            </div>
          )}
          {unavailable && (
            <p className="reference-status">
              这条旧题暂时没有匹配的本地示范。原训练记录和录音可以照常使用。
            </p>
          )}
          {reference && (
            <div
              className="reference-scroll"
              role="region"
              aria-label="一种优秀表达内容"
              tabIndex={0}
            >
              {reference.type === "triple" ? (
                <>
                  <h3>推荐主线</h3>
                  <p className="reference-main-idea">{reference.mainIdea}</p>
                  <h3>一种正常展开方式</h3>
                  <p>{reference.development}</p>
                  <h3>本轮随机词怎样接入</h3>
                  {reference.bridges.length > 0 && (
                    <p className="reference-note">
                      下面每个词都是一次独立的接词示范；接入后就回到同一条主线。
                    </p>
                  )}
                  {reference.bridges.length ? (
                    reference.bridges.map((bridge, index) => (
                      <section
                        className="reference-bridge"
                        key={`${bridge.word}-${bridge.at}-${index}`}
                      >
                        <h4>
                          【{bridge.word}】
                          <span>
                            {bridge.strategy} · 第 {bridge.at} 秒
                          </span>
                        </h4>
                        <p>{bridge.connection}</p>
                        <p className="reference-return">
                          <b>怎么回来</b>
                          {bridge.returnLine}
                        </p>
                      </section>
                    ))
                  ) : (
                    <p>
                      本轮结束前还没有出现随机词。先观察主线如何展开，下次再练习接入词语。
                    </p>
                  )}
                  <h3>收住这一段</h3>
                  <p>{reference.closing}</p>
                </>
              ) : (
                <>
                  <p className="reference-answer">{reference.answer}</p>
                  <h3>
                    {reference.type === "free"
                      ? "它是怎么继续讲下去的？"
                      : "观察它的内容顺序"}
                  </h3>
                  <p className="reference-outline">
                    {reference.outline.join(" → ")}
                  </p>
                  {reference.type === "structured" && (
                    <div className="reference-comparison">
                      <h3>和刚才的自己比一比</h3>
                      {referenceComparisonLabels.map((label) => {
                        const key = `表达对比 · ${label}`;
                        return (
                          <label key={label}>
                            <input
                              type="checkbox"
                              checked={!!selfReview[key]}
                              disabled={!onCompare}
                              onChange={(event) =>
                                onCompare?.(key, event.target.checked)
                              }
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
