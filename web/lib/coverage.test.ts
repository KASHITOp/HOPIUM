import { describe, expect, it } from "vitest";
import { gaps, ledger, summary } from "./coverage";
import type { Prediction, RunLog } from "./types";

const H = 3600e3, T0 = Date.UTC(2026, 10, 4, 11);
const iso = (ms: number) => new Date(ms).toISOString();
const pred = (id: number, coin: string, t: number, extra: Partial<Prediction> = {}) =>
  ({ id, coin, horizon: "12h", signal: "NO_CALL", candle_close_time: iso(t), inserted_at: iso(t + 3 * 60e3), target_time: iso(t + 12 * H), outcome: null, ...extra }) as Prediction;
const run = (t: number, status: RunLog["status"], detail: string | null = null) =>
  ({ id: t, job: "predict", candle_close_time: iso(t), status, detail, logged_at: iso(t) }) as RunLog;

describe("coverage ledger", () => {
  const preds = [pred(1, "BTC", T0, { outcome: "SAT_OUT" }), pred(2, "ETH", T0), pred(3, "SOL", T0, { signal: "UP" }),
    pred(4, "BTC", T0 + 3 * H), pred(5, "SOL", T0 + 3 * H)];
  const runs = [run(T0, "ok"), run(T0 + H, "missed", "started 25 min late"), run(T0 + 3 * H, "ok")];
  const now = T0 + 4 * H + 5 * 60e3;
  const s = ledger(preds, runs, now);
  it("gives every coin/hour from launch exactly one state", () => {
    expect(s.length).toBe(5 * 3);
    expect(new Set(s.map((x) => `${x.coin}${x.close}`)).size).toBe(15);
    const at = (c: string, t: number) => s.find((x) => x.coin === c && x.close === iso(t))!.state;
    expect(at("BTC", T0)).toBe("no_call_graded");
    expect(at("SOL", T0)).toBe("pending");
    expect(at("BTC", T0 + H)).toBe("late_skipped");
    expect(at("BTC", T0 + 2 * H)).toBe("no_job");
    expect(at("ETH", T0 + 3 * H)).toBe("failed");
    expect(at("BTC", T0 + 4 * H)).toBe("in_progress");
  });
  it("coverage excludes in-progress slots and ignores accuracy", () => {
    const m = summary(s);
    expect(m.expected).toBe(12);
    expect(m.published).toBe(5);
    expect(m.latencyMedian).toBe(3);
  });
  it("merges consecutive missing hours by reason", () => {
    const g = gaps(ledger(preds, [run(T0, "ok"), run(T0 + 3 * H, "ok")], now));
    expect(g[0]).toMatchObject({ start: iso(T0 + H), end: iso(T0 + 2 * H), slots: 6, state: "no_job" });
  });
  it("duplicate run_log rows or retries do not create extra slots", () => {
    expect(ledger(preds, [...runs, run(T0, "ok"), run(T0, "ok")], now).length).toBe(15);
  });
  it("no predictions: no launch, empty ledger", () => expect(ledger([], runs, now)).toEqual([]));
});
