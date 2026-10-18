import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Headphones,
  History,
  Home,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { disposeCueAudio } from "./audio/recorder";
import type { AppSettings, TrainingSession, TrainingType } from "./types";
import {
  claimDailyOpen,
  clearAllData,
  defaultSettings,
  deleteAllAudio,
  deleteSession,
  getSessions,
  getSettings,
  getStorageUsage,
  saveSession,
  saveSettings,
} from "./core/database";
import { dailyPlan, getStats } from "./core/session";
import {
  ArrowLink,
  Modal,
  ModeIcon,
  modeOrder,
  modes,
  readableDuration,
  Toggle,
} from "./ui";
import { AudioPlayer } from "./components/AudioPlayer";
import Training from "./components/Training";

type Page = "home" | "history" | "settings";
type Daily = { id: string; index: number; seconds: number; rounds: number };
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function App() {
  useEffect(() => () => disposeCueAudio(), []);
  const [page, setPage] = useState<Page>("home");
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [training, setTraining] = useState<TrainingType | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [summary, setSummary] = useState<Daily | null>(null);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const stats = getStats(sessions);
  const startDaily = useCallback(() => {
    setDaily({ id: crypto.randomUUID(), index: 0, seconds: 0, rounds: 0 });
    setTraining(dailyPlan[0].type);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getSessions(), getSettings()])
      .then(async ([data, preferences]) => {
        if (cancelled) return;
        const today = dateKey(new Date());
        const firstOpenToday = await claimDailyOpen(today);
        if (cancelled) return;
        setSessions(data);
        setSettings(preferences);
        setLoaded(true);
        if (
          preferences.autoDaily &&
          firstOpenToday &&
          !data.some(
            (s) => s.dailyId && dateKey(new Date(s.startedAt)) === today,
          )
        )
          startDaily();
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(true);
          setError(
            "无法打开本地数据库。请检查浏览器是否允许此站点存储数据，再刷新重试。训练仍可进行，恢复存储后才能保存。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [startDaily]);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  const refresh = async () => {
    setSessions(await getSessions());
  };
  const persistSession = async (session: TrainingSession) => {
    await saveSession(session);
    await refresh();
    setError("");
    if (daily) {
      const next = {
        ...daily,
        index: daily.index + 1,
        rounds: daily.rounds + 1,
        seconds: daily.seconds + session.duration,
      };
      if (next.index < dailyPlan.length) {
        setDaily(next);
        setTraining(dailyPlan[next.index].type);
      } else {
        setSummary(next);
        setDaily(null);
        setTraining(null);
        setToast("今日训练已保存");
      }
    } else {
      setTraining(null);
      setToast("训练已保存，今天又向前一步。");
    }
  };
  const updateSettings = async (next: AppSettings) => {
    await saveSettings(next);
    setSettings(next);
    setToast("设置已保存");
  };
  const exitTraining = () => {
    setTraining(null);
    setDaily(null);
  };
  return (
    <>
      {training ? (
        <Training
          key={`${daily?.id ?? "single"}-${daily?.index ?? training}`}
          type={training}
          settings={settings}
          daily={
            daily
              ? {
                  id: daily.id,
                  index: daily.index,
                  duration: dailyPlan[daily.index].duration,
                }
              : undefined
          }
          onSave={persistSession}
          onExit={exitTraining}
        />
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPage("home");
              }}
            >
              <span className="brand-mark">
                <AudioLines size={25} strokeWidth={2} />
              </span>
              <span>
                <strong>
                  SpeakGym<span className="brand-dot">.</span>
                </strong>
                <small>表达训练场</small>
              </span>
            </a>
            <div className="sidebar-caption">YOUR DAILY PRACTICE</div>
            <nav aria-label="主导航">
              <button
                className={page === "home" ? "nav-item active" : "nav-item"}
                onClick={() => setPage("home")}
              >
                <Home size={20} />
                训练首页
                <span className="nav-indicator" />
              </button>
              <button className="nav-item" onClick={startDaily}>
                <CalendarDays size={20} />
                今日训练<span className="nav-small">5 min</span>
              </button>
              <button
                className={page === "history" ? "nav-item active" : "nav-item"}
                onClick={() => setPage("history")}
              >
                <History size={20} />
                训练记录
              </button>
              <button
                className={page === "settings" ? "nav-item active" : "nav-item"}
                onClick={() => setPage("settings")}
              >
                <Settings2 size={20} />
                设置
              </button>
            </nav>
            <div className="sidebar-bottom">
              <div className="local-note">
                <ShieldCheck size={19} />
                <span>
                  只属于你的练习空间<small>无需账号 · 数据保存在本机</small>
                </span>
              </div>
              <button
                className="install-button"
                onClick={() => {
                  if (install) {
                    void install
                      .prompt()
                      .then(() => install.userChoice)
                      .then((choice) => {
                        if (choice.outcome === "accepted") setInstall(null);
                      });
                  } else setInstallHelp(true);
                }}
              >
                <Download size={16} />
                安装到桌面
                <ArrowLink />
              </button>
              <span className="version">SPEAKGYM / V1.1</span>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>
                {page === "home"
                  ? "练习，从今天开始"
                  : page === "history"
                    ? "每一次开口，都算数"
                    : "调整你的练习空间"}
              </span>
              <span className="local-pill">
                <i />
                本地优先 <LockKeyhole size={12} />
              </span>
            </header>
            <main className="main-content">
              {error && (
                <div className="notice error" role="alert">
                  {error}
                  <button onClick={() => setError("")} aria-label="关闭提示">
                    <X size={16} />
                  </button>
                </div>
              )}
              {!loaded ? (
                <div className="empty-state">正在打开你的训练场…</div>
              ) : page === "home" ? (
                <>
                  <section className="welcome">
                    <div>
                      <div className="eyebrow">
                        <span />A LITTLE PRACTICE, EVERY DAY
                      </div>
                      <h1>
                        把想法，练成
                        <br />
                        <span>说得出的力量。</span>
                      </h1>
                      <p>每天几分钟，把“脑子里有东西”练成“嘴上说得出来”。</p>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <div className="art-circle">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="art-label">FIND YOUR VOICE.</span>
                    </div>
                  </section>
                  <section className="daily-card">
                    <div className="daily-symbol">
                      <Timer size={31} strokeWidth={1.5} />
                    </div>
                    <div className="daily-copy">
                      <span className="eyebrow">MAKE IT A DAILY THING</span>
                      <h2>今日 5 分钟训练</h2>
                      <p>热身 → 理清思路 → 抗干扰 → 唤醒声音</p>
                    </div>
                    <button className="button primary" onClick={startDaily}>
                      开始今日训练
                      <ArrowRight size={18} />
                    </button>
                    <span className="daily-card-foot">
                      4 个环节，一次完整的表达练习
                    </span>
                  </section>
                  <section className="training-section">
                    <div className="section-heading">
                      <div>
                        <h2>今天，想练点什么？</h2>
                        <p>选一种方式，给表达一点生长的空间。</p>
                      </div>
                      <span className="section-index">04 TRAINING MODES</span>
                    </div>
                    <div className="mode-grid">
                      {modeOrder.map((type) => (
                        <button
                          className={`mode-card ${modes[type].color}`}
                          key={type}
                          onClick={() => {
                            setDaily(null);
                            setTraining(type);
                          }}
                        >
                          <div className="mode-card-top">
                            <ModeIcon type={type} />
                            <span className="mode-number">
                              {modes[type].number}
                            </span>
                          </div>
                          <h3>
                            {modes[type].title}
                            <span>
                              {type === "triple"
                                ? "抗干扰表达"
                                : modes[type].english}
                            </span>
                          </h3>
                          <p>{modes[type].description}</p>
                          <div className="mode-card-footer">
                            <span>
                              {type === "voice"
                                ? "5 遍表达"
                                : type === "free"
                                  ? "30–90 秒"
                                  : type === "triple"
                                    ? "60–90 秒"
                                    : "30–90 秒"}
                              <i />
                              {modes[type].short}
                            </span>
                            <ArrowLink />
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="progress-section">
                    <div className="section-heading">
                      <h2>一点一滴，都是进步</h2>
                      <span className="muted small">
                        从你的第一轮练习开始记录
                      </span>
                    </div>
                    <div className="stats-strip">
                      <div>
                        <span>本周训练</span>
                        <strong>
                          {stats.weekDays}
                          <small>天</small>
                        </strong>
                      </div>
                      <div>
                        <span>累计练习</span>
                        <strong>
                          {Math.round(stats.totalSeconds / 60)}
                          <small>分钟</small>
                        </strong>
                      </div>
                      <div>
                        <span>连续训练</span>
                        <strong>
                          {stats.streak}
                          <small>天</small>
                        </strong>
                      </div>
                      <div className="mode-counts">
                        {modeOrder.map((type) => (
                          <span key={type}>
                            <i className={modes[type].color} />
                            {modes[type].title}
                            <b>{stats.counts[type]}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>最近练习</h2>
                      <button
                        className="text-button"
                        onClick={() => setPage("history")}
                      >
                        全部记录
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    {sessions.length ? (
                      <div className="recent-list">
                        {sessions.slice(0, 3).map((session) => (
                          <button
                            key={session.id}
                            onClick={() => setPage("history")}
                          >
                            <ModeIcon type={session.type} />
                            <div>
                              <strong>{session.prompt}</strong>
                              <span>
                                {modes[session.type].title} ·{" "}
                                {new Date(session.startedAt).toLocaleDateString(
                                  "zh-CN",
                                )}{" "}
                                · {readableDuration(session.duration)}
                              </span>
                            </div>
                            <ChevronRight size={18} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        <Headphones size={23} />
                        <span>
                          这里还很安静。完成第一轮练习，留下一点自己的声音。
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            setDaily(null);
                            setTraining("free");
                          }}
                        >
                          从热身开始
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </section>
                  <footer className="page-footer">
                    <span>不必一开口就完美，先让自己开口。</span>
                    <span>
                      <LockKeyhole size={12} />
                      没有上传，只有成长。
                    </span>
                  </footer>
                </>
              ) : page === "history" ? (
                <HistoryPage
                  sessions={sessions}
                  onDelete={async (id) => {
                    await deleteSession(id);
                    await refresh();
                    setToast("记录已删除");
                  }}
                />
              ) : (
                <SettingsPage
                  settings={settings}
                  onUpdate={updateSettings}
                  onClear={async (kind) => {
                    if (kind === "audio") await deleteAllAudio();
                    else {
                      await clearAllData();
                      setSettings(defaultSettings);
                    }
                    await refresh();
                    setToast(
                      kind === "audio"
                        ? "所有录音已删除，训练记录已保留"
                        : "本地数据已清空",
                    );
                  }}
                />
              )}
            </main>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {summary && (
        <Modal title="今日训练完成。" onClose={() => setSummary(null)}>
          <div className="completion-symbol">
            <Check size={34} />
          </div>
          <p className="center muted">又为自己的表达，留出了几分钟。</p>
          <div className="summary-stats">
            <div>
              <b>{readableDuration(summary.seconds)}</b>
              <span>训练总时长</span>
            </div>
            <div>
              <b>{summary.rounds} 轮</b>
              <span>完成训练</span>
            </div>
            <div>
              <b>{stats.streak} 天</b>
              <span>连续训练</span>
            </div>
          </div>
          <button
            className="button primary full"
            onClick={() => setSummary(null)}
          >
            收好今天的进步
          </button>
        </Modal>
      )}
      {installHelp && (
        <Modal title="把训练场放到桌面" onClose={() => setInstallHelp(false)}>
          <p>
            在 Chrome 或 Edge
            中打开本地地址，点击地址栏右侧的安装图标，或在浏览器菜单中选择“安装
            SpeakGym”。
          </p>
          <p className="muted">
            手机端可在浏览器菜单中选择“添加到主屏幕”。生产版本首次联网打开并缓存后，即可离线使用。开发模式不提供离线安装。
          </p>
          <button
            className="button primary full"
            onClick={() => setInstallHelp(false)}
          >
            知道了
          </button>
        </Modal>
      )}
    </>
  );
}

function HistoryPage({
  sessions,
  onDelete,
}: {
  sessions: TrainingSession[];
  onDelete: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState("全部");
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const week = new Date(now);
  week.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  week.setHours(0, 0, 0, 0);
  const data = sessions.filter(
    (s) =>
      filter === "全部" ||
      (filter === "今天"
        ? dateKey(new Date(s.startedAt)) === dateKey(now)
        : filter === "昨天"
          ? dateKey(new Date(s.startedAt)) === dateKey(yesterday)
          : s.startedAt >= week.getTime()),
  );
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">YOUR PRACTICE JOURNAL</div>
        <h1>
          训练记录<span className="heading-dot">.</span>
        </h1>
        <p>回头听听，发现那些细小的变化。</p>
      </div>
      <div className="filter-row" role="group" aria-label="记录日期范围">
        {["全部", "今天", "昨天", "本周"].map((item) => (
          <button
            key={item}
            className={filter === item ? "chip selected" : "chip"}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
        <span>{data.length} 次练习</span>
      </div>
      {!data.length ? (
        <div className="empty-state">
          <History size={34} />
          <h2>还没有训练记录</h2>
          <p>完成训练并保存后，就能在这里回听与复盘。</p>
        </div>
      ) : (
        <div className="history-list">
          {data.map((session) => (
            <button
              key={session.id}
              className="history-row"
              onClick={() => {
                setSelected(session);
                setConfirm(false);
                setError("");
              }}
            >
              <ModeIcon type={session.type} />
              <div className="history-content">
                <span className="history-type">
                  {modes[session.type].title}
                  {session.dailyId && <small>今日训练</small>}
                </span>
                <h3>{session.prompt}</h3>
                <p>
                  {new Date(session.startedAt).toLocaleString("zh-CN", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {readableDuration(session.duration)}
                  {session.audio.length > 0 &&
                    ` · ${session.audio.length} 段录音`}
                </p>
              </div>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Modal
          title={confirm ? "删除这条训练记录？" : modes[selected.type].title}
          onClose={() => !busy && setSelected(null)}
        >
          {confirm ? (
            <>
              <p>这条训练的自评和录音也会一并删除，删除后无法恢复。</p>
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  取消
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void onDelete(selected.id)
                      .then(() => setSelected(null))
                      .catch(() => setError("删除失败，请重试。"))
                      .finally(() => setBusy(false));
                  }}
                >
                  {busy ? "正在删除…" : "确认删除"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="detail-prompt">{selected.prompt}</p>
              {selected.mainIdea && (
                <p className="history-main-idea">
                  我的主线：{selected.mainIdea}
                </p>
              )}
              {selected.voiceDifferenceRating && (
                <p className="muted small">
                  Take 1 / Take 5：{selected.voiceDifferenceRating}
                </p>
              )}
              {selected.promptHintsUsed && (
                <p className="muted small">本轮使用过思路提示</p>
              )}
              <p className="muted small">
                {new Date(selected.startedAt).toLocaleString("zh-CN")} ·{" "}
                {readableDuration(selected.duration)}
              </p>
              {selected.interruptWords.length > 0 && (
                <div className="word-chips">
                  {selected.interruptWords.map((w) => (
                    <span
                      className={w.used ? "used" : ""}
                      key={`${w.word}-${w.at}`}
                    >
                      {w.word} {w.used ? "✓" : ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="saved-reviews">
                {Object.entries(selected.selfReview).map(([key, value]) => (
                  <div key={key}>
                    <span>
                      {typeof value === "boolean" ? (value ? "✓" : "○") : ""}
                    </span>
                    {key}
                    {typeof value !== "boolean" && <strong>{value}</strong>}
                  </div>
                ))}
              </div>
              {selected.audio.length ? (
                <div className="audio-grid">
                  {selected.audio.map((take) => (
                    <AudioPlayer key={take.id} take={take} />
                  ))}
                </div>
              ) : (
                <p className="muted small">本轮未保存录音</p>
              )}
              <button
                className="text-button danger-text"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={16} />
                删除这条记录
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function SettingsPage({
  settings,
  onUpdate,
  onClear,
}: {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => Promise<void>;
  onClear: (kind: "audio" | "all") => Promise<void>;
}) {
  const [usage, setUsage] = useState({ audioBytes: 0, sessionCount: 0 });
  const [confirm, setConfirm] = useState<"audio" | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void getStorageUsage()
      .then(setUsage)
      .catch(() => setError("暂时无法读取本地存储。"));
  }, []);
  const update = (next: Partial<AppSettings>) => {
    setError("");
    setBusy(true);
    void onUpdate({ ...settings, ...next })
      .catch(() => setError("设置保存失败，请检查本地存储权限。"))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>
          设置<span className="heading-dot">.</span>
        </h1>
        <p>让每次练习，都适合你的节奏。</p>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <section className="settings-section">
        <h2>训练偏好</h2>
        <div className="setting-row">
          <div>
            <strong>默认训练时长</strong>
            <p>三根钉子的默认讲话时长</p>
          </div>
          <select
            disabled={busy}
            aria-label="默认训练时长"
            value={settings.defaultDuration}
            onChange={(e) =>
              update({ defaultDuration: Number(e.target.value) })
            }
          >
            {[30, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} 秒
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>不停说默认时长</strong>
            <p>从短一点的热身开始，逐渐找到节奏</p>
          </div>
          <select
            disabled={busy}
            aria-label="不停说默认时长"
            value={settings.freeDuration}
            onChange={(e) => update({ freeDuration: Number(e.target.value) })}
          >
            {[30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} 秒
              </option>
            ))}
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>自动录音</strong>
            <p>每轮仍可单独开关。录音仅保存在当前设备，不会上传。</p>
          </div>
          <Toggle
            checked={settings.autoRecord}
            label="自动录音"
            onChange={(autoRecord) => {
              if (!busy) update({ autoRecord });
            }}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>随机词提示音</strong>
            <p>Triple Step 新词出现时，播放一个轻提示音</p>
          </div>
          <Toggle
            checked={settings.cueSound}
            label="随机词提示音"
            onChange={(cueSound) => {
              if (!busy) update({ cueSound });
            }}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Triple Step 默认难度</strong>
            <p>慢慢增加干扰，先练习稳稳地说</p>
          </div>
          <select
            disabled={busy}
            aria-label="Triple Step 默认难度"
            value={settings.tripleDifficulty}
            onChange={(e) =>
              update({
                tripleDifficulty: e.target
                  .value as AppSettings["tripleDifficulty"],
              })
            }
          >
            <option value="easy">Easy · 轻松</option>
            <option value="normal">Normal · 标准</option>
            <option value="hard">Hard · 进阶</option>
            <option value="chaos">Chaos · 随机</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <strong>每天第一次打开，进入今日训练</strong>
            <p>自动打开准备页，由你决定何时开始</p>
          </div>
          <Toggle
            checked={settings.autoDaily}
            label="自动进入今日训练"
            onChange={(autoDaily) => {
              if (!busy) update({ autoDaily });
            }}
          />
        </div>
      </section>
      <section className="settings-section">
        <h2>本地数据</h2>
        <div className="storage-info">
          <ShieldCheck size={25} />
          <div>
            <strong>
              {usage.sessionCount} 条训练记录 ·{" "}
              {(usage.audioBytes / 1024 / 1024).toFixed(2)} MB 录音
            </strong>
            <p>数据与当前浏览器和本地地址绑定。请避免清除浏览器站点数据。</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>删除所有录音</strong>
            <p>保留训练记录与自评，只释放录音占用的空间</p>
          </div>
          <button
            className="button secondary small-button"
            onClick={() => {
              setError("");
              setConfirm("audio");
            }}
          >
            删除录音
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>清空全部数据</strong>
            <p>删除全部训练记录、录音，并恢复默认设置</p>
          </div>
          <button
            className="button secondary danger-text small-button"
            onClick={() => {
              setError("");
              setConfirm("all");
            }}
          >
            清空数据
          </button>
        </div>
      </section>
      <div className="privacy-footer">
        <LockKeyhole size={18} />
        <p>
          SpeakGym 没有账号，也不连接 AI 或云服务。
          <br />
          你的表达，只留在你的设备里。
        </p>
        <span>VERSION 1.1 · 轻量提示与声音对比</span>
      </div>
      {confirm && (
        <Modal
          title={confirm === "audio" ? "删除所有录音？" : "清空全部本地数据？"}
          onClose={() => !busy && setConfirm(null)}
        >
          <p>
            {confirm === "audio"
              ? "所有训练录音将永久删除，训练记录与自评会保留。"
              : "所有训练记录、录音和设置都将永久删除。此操作无法撤销。"}
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onClear(confirm)
                  .then(() => getStorageUsage())
                  .then((data) => {
                    setUsage(data);
                    setConfirm(null);
                  })
                  .catch(() => setError("删除失败，请重试。"))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "正在删除…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
