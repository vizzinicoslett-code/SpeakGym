import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Square,
  X,
} from "lucide-react";
import type {
  AppSettings,
  AudioTake,
  Difficulty,
  InterruptWord,
  TrainingConfig,
  TrainingSession,
  TrainingType,
} from "../types";
import { Countdown } from "../core/timer";
import { createWordSchedule, difficultyConfig } from "../core/schedule";
import { createSession } from "../core/session";
import { LocalRecorder, playCue, unlockCueAudio } from "../audio/recorder";
import {
  questions,
  questionCategories,
  getTripleTopics,
} from "../data/questions";
import { words } from "../data/words";
import { voiceLines } from "../data/voiceLines";
import {
  getVoicePauseText,
  speedPatterns,
  voiceReviewLabels,
  voiceScenes,
  voiceSteps,
} from "../data/voiceGuidance";
import { VoiceABReview, VoiceDirection } from "./VoiceTrainingParts";
import ThinkingHints from "./ThinkingHints";
import ReferenceReview from "./ReferenceReview";
import { getPromptId } from "../core/promptIds";
import { AudioPlayer } from "./AudioPlayer";
import { formatTime, ModeIcon, modes, readableDuration, Toggle } from "../ui";

type Phase = "setup" | "preparing" | "speaking" | "between" | "review";
const sample = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];
const reviews: Record<"structured" | "triple", string[]> = {
  structured: [
    "说清楚了核心观点",
    "解释了为什么重要",
    "给出了下一步 / 结论",
    "没有明显跑题",
    "最后一句收住了",
  ],
  triple: [
    "我保持了原来的主线",
    "我成功使用了所有随机词",
    "随机词没有让我开启新的无关话题",
    "被打断后我能快速回到原来的观点",
    "最后能够正常收尾",
  ],
};

export default function Training({
  type,
  settings,
  daily,
  onSave,
  onExit,
}: {
  type: TrainingType;
  settings: AppSettings;
  daily?: { id: string; index: number; duration: number };
  onSave: (session: TrainingSession) => Promise<void>;
  onExit: () => void;
}) {
  const [voiceLine, setVoiceLine] = useState(() => sample(voiceLines));
  const [scene, setScene] = useState(() => sample(voiceScenes));
  const [speedPattern, setSpeedPattern] = useState(() => sample(speedPatterns));
  const [mainIdea, setMainIdea] = useState("");
  const [hintsOpen, setHintsOpen] = useState(false);
  const [promptHintsUsed, setPromptHintsUsed] = useState(false);
  const [voiceDifferenceRating, setVoiceDifferenceRating] = useState<string>();
  const [category, setCategory] = useState("全部");
  const [config, setConfig] = useState<TrainingConfig>(() => ({
    type,
    prompt:
      type === "structured"
        ? sample(questions).text
        : type === "triple"
          ? sample(getTripleTopics(settings.tripleDifficulty)).text
          : type === "voice"
            ? ""
            : sample(words),
    duration:
      daily?.duration ??
      (type === "triple"
        ? difficultyConfig[settings.tripleDifficulty].duration
        : type === "voice"
          ? 60
          : type === "free"
            ? settings.freeDuration
            : settings.defaultDuration),
    prepSeconds: type === "free" ? 3 : 5,
    recordAudio: settings.autoRecord,
    difficulty: settings.tripleDifficulty,
    dailyId: daily?.id,
  }));
  const [phase, setPhase] = useState<Phase>("setup");
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [takeIndex, setTakeIndex] = useState(0);
  const [takes, setTakes] = useState<AudioTake[]>([]);
  const [schedule, setSchedule] = useState<InterruptWord[]>([]);
  const [review, setReview] = useState<
    Record<string, boolean | number | string>
  >({});
  const [saveAudio, setSaveAudio] = useState(true);
  const timer = useRef<Countdown | null>(null);
  const recorder = useRef<LocalRecorder | null>(null);
  const canRecord = useRef(false);
  const startAt = useRef(0);
  const sessionId = useRef(crypto.randomUUID());
  const actualDuration = useRef(0);
  const lastTakeDuration = useRef(0);
  const finishing = useRef(false);
  const mounted = useRef(true);
  const shownWords = useRef(new Set<number>());
  const [visibleWord, setVisibleWord] = useState("");
  const [appeared, setAppeared] = useState<InterruptWord[]>([]);
  const roundDuration = type === "voice" ? 12 : config.duration;
  const finishRef = useRef<() => void>(() => {});
  const prompt = type === "voice" ? voiceLine.text : config.prompt;
  const hintTags = questions.find(
    (question) => question.text === config.prompt,
  )?.hintTags;
  const resetPromptHelp = () => {
    setMainIdea("");
    setHintsOpen(false);
    setPromptHintsUsed(false);
  };
  const thinkingTools = type !== "voice" && (
    <ThinkingHints
      key={`${type}-${config.prompt}`}
      type={type}
      tags={hintTags}
      open={hintsOpen}
      onOpenChange={setHintsOpen}
      onUse={() => setPromptHintsUsed(true)}
    />
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timer.current?.stop();
      recorder.current?.dispose();
    };
  }, []);
  const startClock = useCallback((seconds: number, finish: () => void) => {
    timer.current?.stop();
    const clock = new Countdown(
      seconds,
      (value) => {
        if (mounted.current) setRemaining(value);
      },
      () => {
        if (mounted.current) finish();
      },
    );
    timer.current = clock;
    setRemaining(seconds);
    setPaused(false);
    clock.start();
  }, []);

  useEffect(() => {
    if (phase === "preparing") {
      if (config.prepSeconds !== null)
        startClock(config.prepSeconds, () => setPhase("speaking"));
    }
    if (phase === "speaking") {
      let cancelled = false;
      const beginSpeaking = async () => {
        if (canRecord.current && recorder.current) {
          try {
            await recorder.current.start();
          } catch (cause) {
            if (cancelled) return;
            canRecord.current = false;
            setMessage(
              cause instanceof Error
                ? cause.message
                : "录音暂不可用，训练将继续。",
            );
          }
        }
        if (!cancelled)
          startClock(roundDuration, () => {
            void finishRef.current();
          });
      };
      void beginSpeaking();
      return () => {
        cancelled = true;
        timer.current?.stop();
      };
    }
    return () => {
      timer.current?.stop();
    };
  }, [phase, config.prepSeconds, roundDuration, startClock]);

  useEffect(() => {
    if (
      phase !== "speaking" ||
      type !== "triple" ||
      paused ||
      !timer.current?.running
    )
      return;
    const elapsed = timer.current.elapsed;
    const pending = schedule.filter(
      (word, index) => word.at <= elapsed && !shownWords.current.has(index),
    );
    if (!pending.length) return;
    schedule.forEach((word, index) => {
      if (word.at <= elapsed) shownWords.current.add(index);
    });
    setAppeared((previous) => [...previous, ...pending]);
    setVisibleWord(pending[pending.length - 1].word);
    if (settings.cueSound) playCue();
  }, [
    remaining,
    phase,
    type,
    schedule,
    paused,
    roundDuration,
    settings.cueSound,
  ]);
  useEffect(() => {
    if (!visibleWord) return;
    const id = setTimeout(() => setVisibleWord(""), 4400);
    return () => clearTimeout(id);
  }, [visibleWord]);

  const prepareRecorder = async () => {
    recorder.current?.dispose();
    recorder.current = new LocalRecorder();
    canRecord.current = false;
    if (!config.recordAudio) return;
    try {
      await recorder.current.prepare();
      canRecord.current = true;
    } catch (cause) {
      if (mounted.current)
        setMessage(
          cause instanceof Error
            ? `${cause.message} 你可以继续不录音的训练。`
            : "麦克风不可用，你可以继续不录音的训练。",
        );
    }
  };
  const begin = async () => {
    if (busy || phase !== "setup") return;
    setBusy(true);
    setMessage("");
    setError("");
    unlockCueAudio();
    await prepareRecorder();
    if (!mounted.current) return;
    actualDuration.current = 0;
    sessionId.current = crypto.randomUUID();
    startAt.current = Date.now();
    shownWords.current.clear();
    setAppeared([]);
    setTakes([]);
    setTakeIndex(0);
    setReview({});
    setVoiceDifferenceRating(undefined);
    setSaveAudio(true);
    if (type === "triple") {
      const next: InterruptWord[] = [];
      const base = difficultyConfig[config.difficulty].duration;
      for (let offset = 0; offset < config.duration; offset += base)
        next.push(
          ...createWordSchedule(config.difficulty, words)
            .map((w) => ({ ...w, at: w.at + offset }))
            .filter((w) => w.at < config.duration),
        );
      setSchedule(next);
    }
    setBusy(false);
    setPhase("preparing");
  };
  const finishSpeaking = async () => {
    if (finishing.current || phase !== "speaking") return;
    finishing.current = true;
    setBusy(true);
    const elapsed = timer.current?.elapsed ?? 0;
    timer.current?.stop();
    actualDuration.current += elapsed;
    lastTakeDuration.current = elapsed;
    setPaused(false);
    try {
      const take = await recorder.current?.stop();
      if (take && mounted.current)
        setTakes((previous) => [
          ...previous,
          {
            ...take,
            label:
              type === "voice"
                ? `Take ${takeIndex + 1} · ${voiceSteps[takeIndex].label}`
                : "本轮录音",
          },
        ]);
    } catch {
      if (mounted.current)
        setMessage("这次录音未能保留，训练自评仍然可以保存。");
    }
    if (mounted.current) {
      setVisibleWord("");
      setPhase(type === "voice" && takeIndex < 4 ? "between" : "review");
      setBusy(false);
    }
    finishing.current = false;
  };
  finishRef.current = () => {
    void finishSpeaking();
  };
  const nextTake = async () => {
    if (busy) return;
    setBusy(true);
    await prepareRecorder();
    if (!mounted.current) return;
    setTakeIndex((index) => index + 1);
    setBusy(false);
    setPhase("speaking");
  };
  const rerecordTake = async () => {
    if (busy) return;
    setBusy(true);
    await prepareRecorder();
    if (!mounted.current) return;
    actualDuration.current = Math.max(
      0,
      actualDuration.current - lastTakeDuration.current,
    );
    setTakes((previous) =>
      previous.filter(
        (take) => !take.label.startsWith(`Take ${takeIndex + 1}`),
      ),
    );
    setBusy(false);
    setPhase("speaking");
  };
  const togglePause = () => {
    if (
      busy ||
      !(phase === "speaking" || phase === "preparing") ||
      (phase === "preparing" && config.prepSeconds === null)
    )
      return;
    if (paused) {
      recorder.current?.resume();
      timer.current?.resume();
    } else {
      recorder.current?.pause();
      timer.current?.pause();
    }
    setPaused(!paused);
  };
  const reset = (shuffle = false) => {
    if (
      phase !== "setup" &&
      !window.confirm("重新开始会丢弃本轮尚未保存的练习，继续吗？")
    )
      return;
    timer.current?.stop();
    recorder.current?.dispose();
    canRecord.current = false;
    actualDuration.current = 0;
    setTakes([]);
    setPaused(false);
    setPhase("setup");
    setError("");
    setMessage("");
    setVisibleWord("");
    setAppeared([]);
    setReview({});
    setHintsOpen(false);
    setPromptHintsUsed(false);
    if (shuffle) changePrompt();
  };
  const changePrompt = () => {
    resetPromptHelp();
    if (type === "voice") {
      const next = sample(
        voiceLines.filter((line) => line.text !== voiceLine.text),
      );
      setVoiceLine(next);
      setScene(sample(voiceScenes));
      setSpeedPattern(sample(speedPatterns));
    } else
      setConfig((previous) => ({
        ...previous,
        prompt:
          type === "structured"
            ? sample(
                questions.filter(
                  (q) =>
                    (category === "全部" || q.category === category) &&
                    q.text !== previous.prompt,
                ),
              ).text
            : type === "triple"
              ? sample(
                  getTripleTopics(previous.difficulty).filter(
                    (topic) => topic.text !== previous.prompt,
                  ),
                ).text
              : sample(words.filter((w) => w !== previous.prompt)),
      }));
  };
  const exit = () => {
    if (
      phase !== "setup" &&
      !window.confirm("退出后，本轮未保存的训练与录音会丢弃。确认退出？")
    )
      return;
    timer.current?.stop();
    recorder.current?.dispose();
    onExit();
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const completeReview =
      type === "structured" || type === "triple"
        ? {
            ...review,
            ...Object.fromEntries(
              reviews[type].map((label) => [label, !!review[label]]),
            ),
          }
        : type === "voice"
          ? Object.fromEntries(
              voiceReviewLabels.map((label) => [label, !!review[label]]),
            )
          : review;
    const session = createSession({
      type,
      startedAt: startAt.current,
      duration: Math.round(actualDuration.current),
      prompt,
      promptId: getPromptId(type, prompt),
      difficulty: type === "triple" ? config.difficulty : undefined,
      interruptWords: appeared,
      selfReview: completeReview,
      audio: saveAudio ? takes : [],
      completed: true,
      dailyId: daily?.id,
      mainIdea: type === "triple" ? mainIdea.trim() || undefined : undefined,
      promptHintsUsed: type !== "voice" ? promptHintsUsed : undefined,
      voiceDifferenceRating:
        type === "voice" ? voiceDifferenceRating : undefined,
    });
    session.id = sessionId.current;
    try {
      await onSave(session);
    } catch {
      if (mounted.current) {
        setError(
          "未能保存到本地数据库。请检查存储空间或权限，然后重试。本轮内容仍保留在此页。",
        );
        setBusy(false);
      }
    }
  };
  const actionRef = useRef({ begin, togglePause, nextTake, save, reset, exit });
  actionRef.current = { begin, togglePause, nextTake, save, reset, exit };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], dialog, .reference-review',
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        busy
      )
        return;
      if (
        (event.code === "Space" || event.key === "Enter") &&
        target.closest("button, a, summary, audio")
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        if (phase === "setup") void actionRef.current.begin();
        else actionRef.current.togglePause();
      } else if (event.key === "Enter" && !target.closest("button")) {
        event.preventDefault();
        if (phase === "setup") void actionRef.current.begin();
        else if (phase === "preparing" && config.prepSeconds === null)
          setPhase("speaking");
        else if (phase === "between") void actionRef.current.nextTake();
        else if (phase === "review") void actionRef.current.save();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        actionRef.current.reset();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        actionRef.current.reset(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        actionRef.current.exit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, busy, config.prepSeconds]);

  const renderVoiceLine = () => {
    if (takeIndex === 2) return getVoicePauseText(voiceLine);
    if (takeIndex !== 1) return voiceLine.text;
    const [before, ...after] = voiceLine.text.split(voiceLine.keyword);
    return (
      <>
        {before}
        <mark>{voiceLine.keyword}</mark>
        {after.join(voiceLine.keyword)}
      </>
    );
  };
  const active = phase === "speaking" || phase === "preparing";
  return (
    <div className={`training-page ${active ? "focused" : ""}`}>
      <header className="training-header">
        <button className="text-button" onClick={exit}>
          <ArrowLeft size={18} />
          返回训练场
        </button>
        <span>
          {daily
            ? `今日训练 / ${daily.index + 1} OF 4`
            : "A LITTLE PRACTICE, EVERY DAY"}
        </span>
        <span className="training-mode-label">{modes[type].title}</span>
      </header>
      {daily && !active && (
        <div className="daily-progress">
          {["不停说", "三根钉子", "Triple Step", "声音唤醒"].map(
            (label, index) => (
              <span
                className={index <= daily.index ? "reached" : ""}
                key={label}
              >
                <i>{index < daily.index ? <Check size={12} /> : index + 1}</i>
                {label}
                {index < 3 && <ChevronRight size={13} />}
              </span>
            ),
          )}
        </div>
      )}
      <main className={`training-content phase-${phase}`}>
        {phase === "setup" && (
          <>
            <div className="training-title">
              <ModeIcon type={type} large />
              <div>
                <div className="eyebrow">{modes[type].english}</div>
                <h1>{modes[type].title}</h1>
              </div>
            </div>
            <p className="training-intro">{modes[type].description}</p>
            {type === "triple" && (
              <div className="principle">
                <span>记住这条主线</span>
                把随机词融入正在说的内容，始终围绕原话题。
              </div>
            )}
            <section className="prompt-card">
              <div className="prompt-card-heading">
                <span>
                  {type === "voice"
                    ? "本轮练习句"
                    : type === "triple"
                      ? "本轮主话题"
                      : type === "free"
                        ? "从这个词开始"
                        : "本轮问题"}
                </span>
                <button className="text-button" onClick={changePrompt}>
                  <Shuffle size={15} />
                  换一个<span className="key-hint">N</span>
                </button>
              </div>
              <h2>{type === "voice" ? voiceLine.text : config.prompt}</h2>
              {type === "structured" && (
                <div className="category-picker">
                  <label htmlFor="category">题目分类</label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => {
                      const next = e.target.value;
                      resetPromptHelp();
                      setCategory(next);
                      setConfig((previous) => ({
                        ...previous,
                        prompt: sample(
                          questions.filter(
                            (q) => next === "全部" || q.category === next,
                          ),
                        ).text,
                      }));
                    }}
                  >
                    <option>全部</option>
                    {questionCategories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>
            {thinkingTools}
            {type === "triple" && (
              <section className="main-idea-setup">
                <h2>
                  先想一句主线 <span>可选</span>
                </h2>
                <p>如果只允许你说一句话，你最想表达什么？</p>
                <label htmlFor="main-idea">我的主线</label>
                <input
                  id="main-idea"
                  type="text"
                  maxLength={160}
                  value={mainIdea}
                  onChange={(event) => setMainIdea(event.target.value)}
                  autoComplete="off"
                  placeholder="写一句你自己的想法，也可以跳过"
                />
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setMainIdea("");
                    void begin();
                  }}
                >
                  跳过主线，开始训练
                  <ArrowRight size={14} />
                </button>
              </section>
            )}
            <div className="training-options">
              {type === "structured" && (
                <Option
                  label="思考时间"
                  values={[5, 10, null]}
                  value={config.prepSeconds}
                  onChange={(prepSeconds) =>
                    setConfig({ ...config, prepSeconds })
                  }
                  format={(v) => (v === null ? "不限时" : `${v} 秒`)}
                />
              )}
              {(type === "structured" || type === "free") && !daily && (
                <Option
                  label="讲话时长"
                  values={type === "free" ? [30, 45, 60, 90] : [30, 60, 90]}
                  value={config.duration}
                  onChange={(duration) =>
                    setConfig({ ...config, duration: duration! })
                  }
                  format={(v) => `${v} 秒`}
                />
              )}
              {type === "triple" && (
                <div className="option-group">
                  <span>训练难度 · 话题与干扰</span>
                  <div className="segmented difficulty-options">
                    {(["easy", "normal", "hard", "chaos"] as Difficulty[]).map(
                      (level) => (
                        <button
                          key={level}
                          className={
                            config.difficulty === level ? "selected" : ""
                          }
                          onClick={() => {
                            resetPromptHelp();
                            setConfig({
                              ...config,
                              difficulty: level,
                              prompt: sample(getTripleTopics(level)).text,
                              duration:
                                daily?.duration ??
                                difficultyConfig[level].duration,
                            });
                          }}
                        >
                          {level[0].toUpperCase() + level.slice(1)}
                        </button>
                      ),
                    )}
                  </div>
                  <p>
                    {daily
                      ? "今日训练：2 分钟，保持主线，持续练习融入随机词。"
                      : difficultyConfig[config.difficulty].description}
                  </p>
                  <p className="topic-difficulty-note">
                    {config.difficulty === "easy"
                      ? "具体、个人化话题 · 从身边的事开始"
                      : config.difficulty === "normal"
                        ? "轻观点话题 · 说出你的选择与理由"
                        : config.difficulty === "hard"
                          ? "抽象话题 · 练习解释概念与关系"
                          : "全部话题 · 随机挑战"}
                  </p>
                </div>
              )}
              {type === "voice" && (
                <div className="voice-overview">
                  {voiceSteps.map((step, i) => (
                    <span key={step.label}>
                      <b>0{i + 1}</b>
                      {step.label}
                    </span>
                  ))}
                </div>
              )}
              {daily && type !== "triple" && (
                <p className="muted small">
                  今日训练 ·{" "}
                  {type === "voice"
                    ? "每遍 12 秒，共 5 遍"
                    : readableDuration(config.duration)}
                </p>
              )}
              <div className="record-option">
                <div>
                  {config.recordAudio ? (
                    <Mic size={19} />
                  ) : (
                    <MicOff size={19} />
                  )}
                  <strong>本轮录音 {config.recordAudio ? "ON" : "OFF"}</strong>
                </div>
                <Toggle
                  checked={config.recordAudio}
                  label="本轮录音"
                  onChange={(recordAudio) =>
                    setConfig({ ...config, recordAudio })
                  }
                />
              </div>
              <p className="privacy-copy">
                <LockNotice />
                录音仅保存在当前设备，不会上传到服务器或 GitHub。
              </p>
            </div>
            <button
              className="button primary start-button"
              onClick={() => {
                void begin();
              }}
              disabled={busy}
            >
              {busy ? "正在准备麦克风…" : "开始训练"}
              {!busy && <ArrowRight size={19} />}
            </button>
            <div className="training-keyboard">
              <kbd>Space</kbd> 开始 <span>·</span> <kbd>N</kbd> 换题{" "}
              <span>·</span> <kbd>Esc</kbd> 退出
            </div>
          </>
        )}

        {active && (
          <>
            <div className="active-topline">
              <span>
                {phase === "preparing"
                  ? "留一点时间，想一想"
                  : type === "voice"
                    ? `TAKE ${takeIndex + 1} / 5 · ${voiceSteps[takeIndex].label}`
                    : type === "triple"
                      ? "保持主线，自然融入"
                      : "把你的想法，说出来"}
              </span>
              <span
                className={
                  canRecord.current && phase === "speaking"
                    ? "recording-indicator"
                    : "muted small"
                }
              >
                {canRecord.current && phase === "speaking" ? (
                  <>
                    <i />
                    {paused ? "录音已暂停" : "正在本地录音"}
                  </>
                ) : config.recordAudio ? (
                  "麦克风已准备"
                ) : (
                  "未录音"
                )}
              </span>
            </div>
            <h1
              className={`active-prompt ${type === "voice" ? "voice-prompt" : ""}`}
            >
              {type === "voice" && phase === "speaking"
                ? renderVoiceLine()
                : prompt}
            </h1>
            {type === "triple" && mainIdea.trim() && (
              <p className="main-idea-reminder">我的主线：{mainIdea.trim()}</p>
            )}
            {phase === "preparing" ? (
              <>
                <div className="prepare-screen">
                  <span className="prepare-number">
                    {config.prepSeconds === null ? "∞" : remaining}
                  </span>
                  <p>不必想好每一句，有一个方向就够了。</p>
                  {config.prepSeconds === null && (
                    <button
                      className="button primary"
                      onClick={() => setPhase("speaking")}
                    >
                      想好了，开始讲话
                      <ArrowRight size={18} />
                    </button>
                  )}
                </div>
                {thinkingTools}
              </>
            ) : (
              <>
                <div
                  className={`timer-display ${remaining <= 10 ? "ending" : ""}`}
                  role="timer"
                  aria-label="剩余时间"
                >
                  {formatTime(remaining)}
                </div>
                <div className="time-track">
                  <span
                    style={{
                      width: `${Math.max(0, (remaining / roundDuration) * 100)}%`,
                    }}
                  />
                </div>
                {type === "structured" && (
                  <div className="three-pins">
                    <div>
                      <b>WHAT</b>
                      <span>发生了什么？</span>
                    </div>
                    <div>
                      <b>SO WHAT</b>
                      <span>为什么重要？</span>
                    </div>
                    <div>
                      <b>NOW WHAT</b>
                      <span>接下来怎么办？</span>
                    </div>
                  </div>
                )}
                {type === "triple" && (
                  <>
                    <div
                      className={`interrupt-stage ${visibleWord ? "has-word" : ""}`}
                      aria-live="polite"
                    >
                      {visibleWord ? (
                        <>
                          <span>把这个词，自然接进去</span>
                          <strong key={visibleWord}>{visibleWord}</strong>
                        </>
                      ) : (
                        <>
                          <span>你的主话题始终在上方</span>
                          <p>继续说，随机词会在这里出现。</p>
                        </>
                      )}
                    </div>
                    <div className="word-history">
                      <span>已出现词语</span>
                      <div>
                        {appeared.map((word, i) => (
                          <span key={`${word.word}-${i}`}>{word.word}</span>
                        ))}
                        {!appeared.length && <small>等待第一个词…</small>}
                      </div>
                    </div>
                  </>
                )}
                {type === "voice" && (
                  <VoiceDirection
                    takeIndex={takeIndex}
                    speedPattern={speedPattern}
                    scene={scene}
                  />
                )}
                {type === "free" && (
                  <div className="free-direction">
                    经历、故事、观点，或一个小小的联想。
                    <br />
                    <strong>继续说，尽量不要长时间沉默。</strong>
                  </div>
                )}
              </>
            )}
            {paused && (
              <p className="paused-label" role="status">
                已暂停。准备好以后，继续就好。
              </p>
            )}
            <div className="active-controls">
              <button
                className="button secondary"
                onClick={togglePause}
                disabled={
                  busy || (phase === "preparing" && config.prepSeconds === null)
                }
              >
                {paused ? <Play size={18} /> : <Pause size={18} />}
                {paused ? "继续" : "暂停"}
              </button>
              {phase === "speaking" && (
                <button
                  className="button end-button"
                  disabled={busy}
                  onClick={() => {
                    void finishSpeaking();
                  }}
                >
                  <Square size={15} />
                  {busy
                    ? "正在结束…"
                    : type === "voice"
                      ? "结束这一遍"
                      : "结束训练"}
                </button>
              )}
            </div>
            <div className="training-keyboard">
              <kbd>Space</kbd> 暂停 / 继续 <span>·</span> <kbd>R</kbd> 重新开始
            </div>
          </>
        )}

        {phase === "between" && (
          <div className="between-screen">
            <span className="eyebrow">TAKE {takeIndex + 1} COMPLETE</span>
            <h1>同一句话，再换一种说法。</h1>
            <p>这一遍完成了 · {readableDuration(lastTakeDuration.current)}</p>
            {takes
              .filter((t) => t.label.startsWith(`Take ${takeIndex + 1}`))
              .map((take) => (
                <AudioPlayer key={take.id} take={take} />
              ))}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void rerecordTake();
              }}
            >
              <RotateCcw size={14} />
              重录这一遍
            </button>
            <div className="next-take">
              <span>下一遍 · {voiceSteps[takeIndex + 1].label}</span>
              <p>
                {takeIndex + 1 === 4
                  ? scene.text
                  : takeIndex + 1 === 3
                    ? `${speedPattern.label}。${voiceSteps[3].hint}`
                    : voiceSteps[takeIndex + 1].hint}
              </p>
            </div>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                void nextTake();
              }}
            >
              {busy ? "正在准备…" : `开始第 ${takeIndex + 2} 遍`}
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {phase === "review" && (
          <>
            <div className="review-heading">
              <span className="eyebrow">PRACTICE DONE. TAKE A MOMENT.</span>
              <h1>说完了，听听自己。</h1>
              <p>
                {modes[type].title} · {readableDuration(actualDuration.current)}{" "}
                · {type === "voice" ? "五遍表达" : "一轮练习"}
              </p>
            </div>
            <div className="review-prompt">{prompt}</div>
            {(type === "structured" || type === "triple") && (
              <section className="review-section">
                <h2>这一轮，我做到了什么？</h2>
                <p className="muted small">
                  诚实地勾选就好。这是一次自我观察，不是评分。
                </p>
                <div className="review-checks">
                  {reviews[type].map((label) => (
                    <label key={label}>
                      <input
                        type="checkbox"
                        checked={!!review[label]}
                        onChange={(e) =>
                          setReview({ ...review, [label]: e.target.checked })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            {type === "triple" && (
              <section className="review-section">
                <h2>出现过的词语</h2>
                <p className="muted small">
                  点选你实际使用过的词，✓ 只代表你的自我确认。
                </p>
                <div className="word-chips">
                  {appeared.length ? (
                    appeared.map((word, index) => (
                      <button
                        className={word.used ? "used" : ""}
                        key={`${word.word}-${index}`}
                        onClick={() =>
                          setAppeared((previous) =>
                            previous.map((item, i) =>
                              i === index
                                ? { ...item, used: !item.used }
                                : item,
                            ),
                          )
                        }
                      >
                        {word.word}
                        {word.used && <Check size={14} />}
                      </button>
                    ))
                  ) : (
                    <span>本轮结束较早，还没有出现随机词。</span>
                  )}
                </div>
              </section>
            )}
            {type === "free" && (
              <section className="review-section">
                <h2>今天说得顺畅吗？</h2>
                <div className="option-group">
                  <span>流畅度</span>
                  <div className="rating-row">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        aria-label={`流畅度 ${n}`}
                        className={review["流畅度"] === n ? "selected" : ""}
                        onClick={() => setReview({ ...review, 流畅度: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p>
                    1 有点卡顿 <span className="float-right">5 很顺畅</span>
                  </p>
                </div>
                <div className="option-group">
                  <span>今天最长卡顿</span>
                  <div className="segmented">
                    {["没有", "<2 秒", "2～5 秒", ">5 秒"].map((item) => (
                      <button
                        className={
                          review["最长卡顿"] === item ? "selected" : ""
                        }
                        key={item}
                        onClick={() => setReview({ ...review, 最长卡顿: item })}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {type === "voice" && (
              <>
                <VoiceABReview
                  takes={takes}
                  rating={voiceDifferenceRating}
                  onRatingChange={setVoiceDifferenceRating}
                />
                <section className="review-section">
                  <h2>今天我有做到</h2>
                  <p className="muted small">
                    依次试听，留意重音、节奏和意图的区别。
                  </p>
                  <div className="review-checks">
                    {voiceReviewLabels.map((label) => (
                      <label key={label}>
                        <input
                          type="checkbox"
                          checked={!!review[label]}
                          onChange={(e) =>
                            setReview({ ...review, [label]: e.target.checked })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </section>
              </>
            )}
            {type !== "voice" && (
              <ReferenceReview
                key={sessionId.current}
                context={{
                  type,
                  prompt,
                  promptId: getPromptId(type, prompt),
                  interruptWords: appeared,
                  completed: true,
                }}
                selfReview={review}
                onCompare={(key, checked) =>
                  setReview((previous) => ({ ...previous, [key]: checked }))
                }
              />
            )}
            <section className="review-section">
              <div className="section-heading">
                <h2>本轮录音</h2>
                {takes.length > 0 && (
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={saveAudio}
                      onChange={(e) => setSaveAudio(e.target.checked)}
                    />
                    保存录音
                  </label>
                )}
              </div>
              {takes.length ? (
                <div className="audio-grid">
                  {takes.map((take) => (
                    <AudioPlayer
                      key={take.id}
                      take={take}
                      onDelete={() =>
                        setTakes((previous) =>
                          previous.filter((t) => t.id !== take.id),
                        )
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="muted small">
                  本轮没有录音，练习与自评仍然值得留下。
                </p>
              )}
            </section>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <div className="review-actions">
              <button
                className="button secondary"
                onClick={() => reset()}
                disabled={busy}
              >
                <RotateCcw size={17} />
                重新训练
              </button>
              <button
                className="button primary"
                onClick={() => {
                  void save();
                }}
                disabled={busy}
              >
                {busy
                  ? "正在保存…"
                  : daily && daily.index < 3
                    ? "保存并继续下一项"
                    : daily
                      ? "保存，完成今日训练"
                      : "保存这次练习"}
                <ArrowRight size={18} />
              </button>
            </div>
            <p className="privacy-copy center">只保存在当前设备的浏览器里。</p>
          </>
        )}
        {message && (
          <div className="notice training-notice" role="status">
            <MicOff size={17} />
            <span>{message}</span>
            <button onClick={() => setMessage("")} aria-label="关闭提示">
              <X size={15} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Option({
  label,
  values,
  value,
  onChange,
  format,
}: {
  label: string;
  values: (number | null)[];
  value: number | null;
  onChange: (n: number | null) => void;
  format: (n: number | null) => string;
}) {
  return (
    <div className="option-group">
      <span>{label}</span>
      <div className="segmented">
        {values.map((n) => (
          <button
            key={n ?? "unlimited"}
            className={n === value ? "selected" : ""}
            onClick={() => onChange(n)}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
function LockNotice() {
  return <span aria-hidden="true">↳ </span>;
}
