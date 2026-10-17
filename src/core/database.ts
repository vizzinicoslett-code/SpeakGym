import type { AppSettings, Difficulty, TrainingSession } from "../types";

const DATABASE_NAME = "speakgym";
const DATABASE_VERSION = 1;
const SETTINGS_KEY = "app";
const DAILY_OPEN_KEY = "lastDailyOpened";
let connection: Promise<IDBDatabase> | null = null;

export const defaultSettings: AppSettings = Object.freeze({
  defaultDuration: 60,
  freeDuration: 30,
  autoRecord: true,
  cueSound: true,
  tripleDifficulty: "normal" as Difficulty,
  autoDaily: false,
});

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error(
          "当前浏览器无法使用 IndexedDB。请使用普通浏览窗口，并允许本地存储。",
        ),
      );
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      // Future schema migrations can branch on the old version here.
      if (!database.objectStoreNames.contains("sessions")) {
        const sessions = database.createObjectStore("sessions", {
          keyPath: "id",
        });
        sessions.createIndex("startedAt", "startedAt");
      }
      if (!database.objectStoreNames.contains("settings"))
        database.createObjectStore("settings");
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        connection = null;
      };
      resolve(database);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开本地训练数据库。"));
    request.onblocked = () =>
      reject(
        new Error(
          "数据库升级被另一个 SpeakGym 页面阻止，请关闭其他页面后重试。",
        ),
      );
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("本地数据操作失败。"));
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const tx = database.transaction(stores, mode);
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("本地数据事务被中止。"));
    tx.onerror = () => {
      /* onabort reports a failed commit. */
    };
  });
  // Await both the request and its transaction commit, including quota failures.
  const [value] = await Promise.all([
    Promise.resolve().then(() => work(tx)),
    committed,
  ]);
  return value;
}

export async function getSessions(): Promise<TrainingSession[]> {
  const sessions = await transaction(["sessions"], "readonly", (tx) =>
    requestResult(
      tx.objectStore("sessions").getAll() as IDBRequest<TrainingSession[]>,
    ),
  );
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export async function saveSession(session: TrainingSession): Promise<void> {
  if (
    !session.id ||
    !Number.isFinite(session.startedAt) ||
    !Number.isFinite(session.duration) ||
    session.duration < 0
  ) {
    throw new TypeError("无法保存无效的训练记录。");
  }
  await transaction(["sessions"], "readwrite", (tx) =>
    requestResult(tx.objectStore("sessions").put(session)),
  );
}

export async function deleteSession(id: string): Promise<void> {
  await transaction(["sessions"], "readwrite", (tx) =>
    requestResult(tx.objectStore("sessions").delete(id)),
  );
}

function parseSettings(value: unknown): AppSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const settings = value as Partial<AppSettings>;
  if (
    ![30, 60, 90].includes(settings.defaultDuration ?? 0) ||
    (settings.freeDuration !== undefined &&
      ![30, 45, 60, 90].includes(settings.freeDuration)) ||
    typeof settings.autoRecord !== "boolean" ||
    typeof settings.cueSound !== "boolean" ||
    !["easy", "normal", "hard", "chaos"].includes(
      settings.tripleDifficulty ?? "",
    ) ||
    typeof settings.autoDaily !== "boolean"
  )
    return null;
  return {
    defaultDuration: settings.defaultDuration!,
    // Version 1 records written before mode-specific preferences used no freeDuration.
    freeDuration: settings.freeDuration ?? defaultSettings.freeDuration,
    autoRecord: settings.autoRecord,
    cueSound: settings.cueSound,
    tripleDifficulty: settings.tripleDifficulty!,
    autoDaily: settings.autoDaily,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const settings: unknown = await transaction(["settings"], "readonly", (tx) =>
    requestResult(tx.objectStore("settings").get(SETTINGS_KEY)),
  );
  if (settings === undefined) return { ...defaultSettings };
  const parsed = parseSettings(settings);
  if (!parsed)
    throw new Error("本地设置格式无效，请在设置中清空数据后重新配置。");
  return parsed;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const parsed = parseSettings(settings);
  if (!parsed)
    throw new TypeError("设置无效：请检查时长、录音开关和训练难度。");
  await transaction(["settings"], "readwrite", (tx) =>
    requestResult(tx.objectStore("settings").put(parsed, SETTINGS_KEY)),
  );
}

/** Claim the first opening on a local calendar date in one transaction across tabs. */
export async function claimDailyOpen(date: string): Promise<boolean> {
  if (!date.trim()) throw new TypeError("每日打开日期不能为空。");
  return transaction(["settings"], "readwrite", async (tx) => {
    const store = tx.objectStore("settings");
    const lastOpened: unknown = await requestResult(store.get(DAILY_OPEN_KEY));
    if (lastOpened === date) return false;
    await requestResult(store.put(date, DAILY_OPEN_KEY));
    return true;
  });
}

export async function deleteAllAudio(): Promise<void> {
  await transaction(
    ["sessions"],
    "readwrite",
    (tx) =>
      new Promise<void>((resolve, reject) => {
        const cursorRequest = tx.objectStore("sessions").openCursor();
        cursorRequest.onerror = () =>
          reject(cursorRequest.error ?? new Error("删除录音失败。"));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            resolve();
            return;
          }
          const session = cursor.value as TrainingSession;
          cursor.update({ ...session, audio: [] });
          cursor.continue();
        };
      }),
  );
}

export async function clearAllData(): Promise<void> {
  await transaction(["sessions", "settings"], "readwrite", async (tx) => {
    await Promise.all([
      requestResult(tx.objectStore("sessions").clear()),
      requestResult(tx.objectStore("settings").clear()),
    ]);
  });
}

export async function getStorageUsage(): Promise<{
  audioBytes: number;
  sessionCount: number;
}> {
  const sessions = await getSessions();
  const audioBytes = sessions.reduce(
    (total, session) =>
      total + session.audio.reduce((bytes, take) => bytes + take.blob.size, 0),
    0,
  );
  return { audioBytes, sessionCount: sessions.length };
}
