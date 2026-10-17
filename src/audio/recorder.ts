import type { AudioTake } from "../types";

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

function permissionError(error: unknown): Error {
  const name =
    error instanceof Error
      ? error.name
      : String((error as { name?: string } | null)?.name ?? "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new Error(
      "未获得麦克风权限。你仍然可以继续训练，也可以在浏览器设置中允许麦克风后重试。",
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new Error("没有找到可用的麦克风。你仍然可以继续训练。");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new Error(
      "麦克风暂时无法使用，可能被其他应用占用。你仍然可以继续训练。",
    );
  }
  return new Error(
    "无法开启录音，请检查麦克风和浏览器权限。你仍然可以继续训练。",
  );
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function createAudioContext(): AudioContext | null {
  const AudioContextClass =
    globalThis.AudioContext ??
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

/** A local-only recording. A disposed instance cannot be reused. Durations are in seconds. */
export class LocalRecorder {
  static isSupported = isSupported;
  static get supported(): boolean {
    return isSupported();
  }

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private chunks: Blob[] = [];
  private elapsedMs = 0;
  private activeSince: number | null = null;
  private epoch = 0;
  private disposed = false;
  private preparing: Promise<void> | null = null;
  private starting: Promise<void> | null = null;
  private stopping: Promise<AudioTake | null> | null = null;
  private resolveStop: ((take: AudioTake | null) => void) | null = null;
  private completedTake: AudioTake | null = null;

  /** Request permission before the countdown, without recording the preparation time. */
  async prepare(): Promise<void> {
    if (this.disposed) throw new Error("本次录音已结束，请重新开始训练。");
    if (!isSupported())
      throw new Error(
        "当前浏览器不支持录音。请使用 localhost 或 HTTPS 打开，也可以直接继续训练。",
      );
    if (this.stream) return;
    if (this.preparing) return this.preparing;

    const epoch = this.epoch;
    const request = (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        throw permissionError(error);
      }
      if (this.disposed || epoch !== this.epoch) {
        stopTracks(stream);
        throw new Error("本次录音已取消，你可以继续训练。");
      }
      this.stream = stream;
      this.prepareMeter(stream);
    })();
    this.preparing = request;
    try {
      await request;
    } finally {
      if (this.preparing === request) this.preparing = null;
    }
  }

  async start(): Promise<void> {
    if (this.recorder || this.stopping)
      throw new Error("录音已经开始，请先结束当前录音。");
    if (this.starting) return this.starting;
    const epoch = this.epoch;
    const request = (async () => {
      await this.prepare();
      if (!this.stream || this.disposed || epoch !== this.epoch)
        throw new Error("本次录音已取消，你可以继续训练。");
      try {
        const mimeType = MIME_TYPES.find(
          (type) =>
            typeof MediaRecorder.isTypeSupported === "function" &&
            MediaRecorder.isTypeSupported(type),
        );
        const recorder = mimeType
          ? new MediaRecorder(this.stream, { mimeType })
          : new MediaRecorder(this.stream);
        this.recorder = recorder;
        this.completedTake = null;
        this.chunks = [];
        this.elapsedMs = 0;
        recorder.ondataavailable = (event) => {
          if (this.recorder === recorder && event.data.size > 0)
            this.chunks.push(event.data);
        };
        recorder.onstop = () => this.finish(recorder);
        recorder.onerror = () => {
          if (this.recorder !== recorder) return;
          this.captureElapsed();
          try {
            if (recorder.state !== "inactive") recorder.stop();
            else this.finish(recorder);
          } catch {
            this.finish(recorder);
          }
          this.releaseMedia();
        };
        recorder.start(1000);
        this.activeSince = Date.now();
      } catch (error) {
        this.recorder = null;
        this.releaseMedia();
        throw permissionError(error);
      }
    })();
    this.starting = request;
    try {
      await request;
    } finally {
      if (this.starting === request) this.starting = null;
    }
  }

  pause(): void {
    if (this.recorder?.state !== "recording") return;
    try {
      this.recorder.pause();
      this.captureElapsed();
    } catch {
      /* A concurrent browser stop must not interrupt training. */
    }
  }

  resume(): void {
    if (this.recorder?.state !== "paused") return;
    try {
      this.recorder.resume();
      this.activeSince = Date.now();
    } catch {
      /* A concurrent browser stop must not interrupt training. */
    }
  }

  async stop(): Promise<AudioTake | null> {
    this.epoch += 1;
    this.preparing = null;
    this.starting = null;
    if (this.stopping) return this.stopping;
    const recorder = this.recorder;
    if (!recorder) {
      this.releaseMedia();
      const take = this.completedTake;
      this.completedTake = null;
      return take;
    }
    this.captureElapsed();
    const result = new Promise<AudioTake | null>((resolve) => {
      this.resolveStop = resolve;
    });
    this.stopping = result;
    try {
      if (recorder.state !== "inactive") recorder.stop();
      // An inactive recorder may already have queued its final data and stop events.
    } catch {
      this.finish(recorder);
    }
    this.releaseMedia();
    return result;
  }

  /** Stop synchronously on unmount; pending permission results are also cleaned up. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* Already stopped. */
      }
    }
    this.releaseMedia();
    this.resolveStop?.(null);
    this.resolveStop = null;
    this.stopping = null;
    this.preparing = null;
    this.starting = null;
    this.chunks = [];
    this.completedTake = null;
    this.activeSince = null;
  }

  /** Normalized microphone RMS, for a gentle visual indicator rather than a score. */
  getLevel(): number {
    if (!this.analyser || !this.samples || this.recorder?.state !== "recording")
      return 0;
    try {
      this.analyser.getByteTimeDomainData(this.samples);
      let squared = 0;
      for (const sample of this.samples) squared += ((sample - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(squared / this.samples.length) * 3);
    } catch {
      return 0;
    }
  }

  private captureElapsed(): void {
    if (this.activeSince !== null)
      this.elapsedMs += Math.max(0, Date.now() - this.activeSince);
    this.activeSince = null;
  }

  private finish(recorder: MediaRecorder): void {
    if (this.recorder !== recorder) return;
    this.captureElapsed();
    const mimeType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    const take: AudioTake | null = blob.size
      ? {
          id:
            globalThis.crypto?.randomUUID?.() ??
            `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          label: "训练录音",
          blob,
          duration: this.elapsedMs / 1000,
          mimeType,
        }
      : null;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    this.recorder = null;
    this.chunks = [];
    this.releaseMedia();
    const resolve = this.resolveStop;
    this.resolveStop = null;
    this.stopping = null;
    if (resolve) resolve(take);
    else this.completedTake = take;
  }

  private prepareMeter(stream: MediaStream): void {
    try {
      this.context = createAudioContext();
      if (!this.context) return;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      void this.context.resume().catch(() => {});
    } catch {
      this.releaseMeter();
    }
  }

  private releaseMeter(): void {
    try {
      this.source?.disconnect();
    } catch {
      /* Already disconnected. */
    }
    try {
      this.analyser?.disconnect();
    } catch {
      /* Already disconnected. */
    }
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.source = null;
    this.analyser = null;
    this.context = null;
    this.samples = null;
  }

  private releaseMedia(): void {
    stopTracks(this.stream);
    this.stream = null;
    this.releaseMeter();
  }
}

let cueContext: AudioContext | null = null;
let cueCleanupTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCueCleanup(): void {
  if (cueCleanupTimer) clearTimeout(cueCleanupTimer);
  cueCleanupTimer = setTimeout(
    () => {
      const context = cueContext;
      cueContext = null;
      cueCleanupTimer = null;
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
    10 * 60 * 1000,
  );
}

/** Call in the start-button gesture to enable later countdown tones on mobile browsers. */
export function unlockCueAudio(): void {
  try {
    if (!cueContext || cueContext.state === "closed")
      cueContext = createAudioContext();
    if (!cueContext) return;
    void cueContext.resume().catch(() => {});
    const oscillator = cueContext.createOscillator();
    const gain = cueContext.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(cueContext.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(cueContext.currentTime + 0.01);
    scheduleCueCleanup();
  } catch {
    /* Cue sounds are optional. */
  }
}

export function playCue(): void {
  try {
    if (!cueContext || cueContext.state === "closed") unlockCueAudio();
    const context = cueContext;
    if (!context) return;
    void context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    scheduleCueCleanup();
  } catch {
    /* Sound must never block the timer or speech. */
  }
}

export function disposeCueAudio(): void {
  if (cueCleanupTimer) clearTimeout(cueCleanupTimer);
  cueCleanupTimer = null;
  const context = cueContext;
  cueContext = null;
  if (context && context.state !== "closed")
    void context.close().catch(() => {});
}
