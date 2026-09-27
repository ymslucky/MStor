/**
 * 上传速度估计器：对 (bytes, t) 采样序列做 EMA 平滑，
 * 输出 bytes/s。瞬时速度抖动大，EMA 让 UI 数字稳定可读。
 */
export class SpeedTracker {
  private ema: number | null = null;
  private prev: { t: number; bytes: number } | null = null;

  constructor(private readonly alpha = 0.4) {}

  /** 记录当前已传字节与时间戳（ms），返回当前速度估计（bytes/s） */
  push(bytes: number, now: number): number {
    if (this.prev) {
      const dt = (now - this.prev.t) / 1000;
      if (dt > 0) {
        // 进度回退（分片重试等）按 0 计，不产生负速度
        const instant = Math.max(0, (bytes - this.prev.bytes) / dt);
        this.ema = this.ema === null ? instant : this.alpha * instant + (1 - this.alpha) * this.ema;
      }
    }
    if (!this.prev || bytes > this.prev.bytes || now > this.prev.t) this.prev = { t: now, bytes };
    return this.ema ?? 0;
  }

  /** 最近一次速度估计（bytes/s），无样本时为 0 */
  get speed(): number {
    return this.ema ?? 0;
  }
}
