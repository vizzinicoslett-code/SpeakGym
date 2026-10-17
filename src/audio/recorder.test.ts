import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRecorder, isSupported } from "./recorder";

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = vi.fn(
    (type: string) => type === "audio/webm;codecs=opus",
  );
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeRecorder.instances.push(this);
  }
  start = vi.fn(() => {
    this.state = "recording";
  });
  pause = vi.fn(() => {
    this.state = "paused";
  });
  resume = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({
        data: new Blob(["recorded audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    });
  });
}

function microphone() {
  const track = { stop: vi.fn(), readyState: "live" };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

describe("local microphone recording", () => {
  let recorder: LocalRecorder;
  let mic: ReturnType<typeof microphone>;
  let getUserMedia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mic = microphone();
    getUserMedia = vi.fn().mockResolvedValue(mic.stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("AudioContext", undefined);
    FakeRecorder.instances = [];
    recorder = new LocalRecorder();
  });
  afterEach(() => {
    recorder.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports support and gracefully explains unsupported browsers", async () => {
    expect(isSupported()).toBe(true);
    expect(LocalRecorder.supported).toBe(true);
    vi.stubGlobal("MediaRecorder", undefined);
    expect(LocalRecorder.isSupported()).toBe(false);
    await expect(recorder.start()).rejects.toThrow("当前浏览器不支持录音");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("requests permission once during preparation and starts without recording thinking time", async () => {
    await recorder.prepare();
    expect(FakeRecorder.instances).toHaveLength(0);
    vi.setSystemTime(9000);
    await recorder.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances[0].mimeType).toBe("audio/webm;codecs=opus");
    vi.setSystemTime(12000);
    const stopped = recorder.stop();
    await vi.runAllTicks();
    const take = await stopped;
    expect(take?.duration).toBe(3);
    expect(take?.blob.size).toBeGreaterThan(0);
    expect(take?.mimeType).toBe("audio/webm;codecs=opus");
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
  });

  it("excludes paused time and treats redundant pause/resume calls safely", async () => {
    await recorder.start();
    vi.setSystemTime(4000);
    recorder.pause();
    recorder.pause();
    vi.setSystemTime(15000);
    recorder.resume();
    recorder.resume();
    vi.setSystemTime(17000);
    const stopped = recorder.stop();
    await vi.runAllTicks();
    expect((await stopped)?.duration).toBe(5);
    expect(FakeRecorder.instances[0].pause).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances[0].resume).toHaveBeenCalledTimes(1);
  });

  it("does not count a paused interval when stopped while paused", async () => {
    await recorder.start();
    vi.setSystemTime(2500);
    recorder.pause();
    vi.setSystemTime(9000);
    const stopped = recorder.stop();
    await vi.runAllTicks();
    expect((await stopped)?.duration).toBe(1.5);
  });

  it("stops a prepared stream even when speaking never starts", async () => {
    await recorder.prepare();
    expect(await recorder.stop()).toBeNull();
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("cleans a late permission result after stop without creating a recorder", async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    const started = recorder.start();
    const rejected = expect(started).rejects.toThrow("本次录音已取消");
    expect(await recorder.stop()).toBeNull();
    resolvePermission(mic.stream);
    await rejected;
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("cleans a late permission result after unmount", async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    const preparing = recorder.prepare();
    const rejected = expect(preparing).rejects.toThrow("本次录音已取消");
    recorder.dispose();
    resolvePermission(mic.stream);
    await rejected;
    expect(mic.track.stop).toHaveBeenCalledOnce();
    await expect(recorder.prepare()).rejects.toThrow("本次录音已结束");
  });

  it("explains denied permission and allows a retry", async () => {
    getUserMedia.mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    await expect(recorder.start()).rejects.toThrow("未获得麦克风权限");
    await recorder.start();
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  it("releases tracks if MediaRecorder fails to start", async () => {
    class BrokenRecorder extends FakeRecorder {
      start = vi.fn(() => {
        throw new Error("hardware error");
      });
    }
    vi.stubGlobal("MediaRecorder", BrokenRecorder);
    await expect(recorder.start()).rejects.toThrow("无法开启录音");
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(await recorder.stop()).toBeNull();
  });

  it("guards against simultaneous starts and duplicate active starts", async () => {
    await Promise.all([recorder.start(), recorder.start()]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(FakeRecorder.instances).toHaveLength(1);
    await expect(recorder.start()).rejects.toThrow("录音已经开始");
  });

  it("resolves a pending stop on disposal and leaves no active tracks", async () => {
    await recorder.start();
    const stopped = recorder.stop();
    recorder.dispose();
    expect(await stopped).toBeNull();
    await vi.runAllTicks();
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(await recorder.stop()).toBeNull();
  });

  it("releases the analyser and audio context when stopping", async () => {
    const disconnectSource = vi.fn();
    const disconnectAnalyser = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    class FakeAudioContext {
      state = "running";
      createAnalyser() {
        return {
          fftSize: 256,
          disconnect: disconnectAnalyser,
          getByteTimeDomainData: (array: Uint8Array) => array.fill(160),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: disconnectSource };
      }
      resume = vi.fn().mockResolvedValue(undefined);
      close = close;
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    await recorder.start();
    expect(recorder.getLevel()).toBe(0.75);
    recorder.pause();
    expect(recorder.getLevel()).toBe(0);
    const stopped = recorder.stop();
    await vi.runAllTicks();
    await stopped;
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(recorder.getLevel()).toBe(0);
  });
});
