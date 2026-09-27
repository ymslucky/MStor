import { describe, expect, test } from "vitest";
import { SpeedTracker } from "./speed";

describe("SpeedTracker", () => {
  test("首个样本无速度，之后给出瞬时速度", () => {
    const t = new SpeedTracker();
    expect(t.push(0, 1000)).toBe(0);
    // 1s 内传了 2000B → 2000 B/s
    expect(t.push(2000, 2000)).toBe(2000);
  });

  test("EMA 平滑：后续样本与历史加权", () => {
    const t = new SpeedTracker(0.4);
    t.push(0, 0);
    t.push(1000, 1000); // instant 1000
    // instant 3000 → ema = 0.4*3000 + 0.6*1000 = 1800
    expect(t.push(4000, 2000)).toBe(1800);
  });

  test("dt=0 不产生速度也不丢样本", () => {
    const t = new SpeedTracker();
    t.push(0, 1000);
    expect(t.push(500, 1000)).toBe(0); // dt=0，无法测速（样本仍更新为 500B）
    expect(t.push(2000, 2000)).toBe(1500); // 1s 内 500→2000
  });

  test("进度回退（重试）按负增量截断为 0", () => {
    const t = new SpeedTracker();
    t.push(1000, 0);
    t.push(2000, 1000); // 1000 B/s
    // bytes 回退到 1500：负增量 → instant 0，EMA 下降 = 0.4*0+0.6*1000 = 600
    expect(t.push(1500, 2000)).toBe(600);
  });

  test("speed getter 返回最近估计", () => {
    const t = new SpeedTracker();
    expect(t.speed).toBe(0);
    t.push(0, 0);
    t.push(1000, 1000);
    expect(t.speed).toBe(1000);
  });
});
