/** A pausable countdown driven by the monotonic clock, rather than tick counts. */
export class Countdown {
  private duration: number;
  private accumulatedMs = 0;
  private startedAt = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private finished = false;
  private lastTick = -1;

  constructor(
    durationSeconds: number,
    private readonly onTick: (remaining: number) => void,
    private readonly onFinish: () => void,
  ) {
    this.duration = this.validateDuration(durationSeconds);
  }

  get elapsed(): number {
    const activeMs =
      this.interval === null
        ? 0
        : Math.max(0, performance.now() - this.startedAt);
    return Math.min(this.duration, (this.accumulatedMs + activeMs) / 1000);
  }

  get remaining(): number {
    return Math.max(0, Math.ceil(this.duration - this.elapsed));
  }

  get running(): boolean {
    return this.interval !== null;
  }

  start(): void {
    if (this.running || this.finished) return;
    this.startedAt = performance.now();
    this.interval = setInterval(() => this.tick(), 100);
    this.tick();
  }

  pause(): void {
    if (!this.running) return;
    this.accumulatedMs = this.elapsed * 1000;
    this.clearInterval();
    this.emitTick();
    if (this.remaining === 0) this.finish();
  }

  resume(): void {
    this.start();
  }

  /** Stop and retain the current elapsed time. Call reset to start a new round. */
  stop(): void {
    if (!this.running) return;
    this.accumulatedMs = this.elapsed * 1000;
    this.clearInterval();
  }

  reset(durationSeconds = this.duration): void {
    const duration = this.validateDuration(durationSeconds);
    this.clearInterval();
    this.duration = duration;
    this.accumulatedMs = 0;
    this.startedAt = 0;
    this.finished = false;
    this.lastTick = -1;
    this.emitTick();
  }

  private validateDuration(value: number): number {
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError("训练时长必须是非负有限数值。");
    return value;
  }

  private tick(): void {
    this.emitTick();
    if (this.remaining === 0) this.finish();
  }

  private emitTick(): void {
    const remaining = this.remaining;
    if (remaining === this.lastTick) return;
    this.lastTick = remaining;
    this.onTick(remaining);
  }

  private finish(): void {
    if (this.finished) return;
    this.accumulatedMs = this.duration * 1000;
    this.clearInterval();
    this.finished = true;
    this.onFinish();
  }

  private clearInterval(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }
}
