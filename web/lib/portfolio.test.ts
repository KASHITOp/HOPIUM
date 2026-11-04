import { describe, expect, it } from "vitest";
import { holdBtc, simulate } from "./portfolio";
import type { Prediction } from "./types";

const H = 3600e3;
function row(id: number, coin: "BTC" | "ETH" | "SOL", hour: number, signal: Prediction["signal"], move: number | null, entry = 100): Prediction {
  const t = Date.UTC(2026, 0, 1) + hour * H;
  return {
    id, coin, horizon: "12h", prob_up: 0.3, signal, price_at_call: entry, candle_close_time: new Date(t).toISOString(),
    inserted_at: new Date(t + 120e3).toISOString(), target_time: new Date(t + 12 * H).toISOString(), model_version: "t",
    p_big_up: 0.3, p_big_down: 0.1, score: 0.2, threshold: 0.16, k: 0.01, price_at_target: move === null ? null : entry * (1 + move),
    move, outcome: move === null ? null : "HIT", hit: true, graded_at: null,
  };
}

describe("paper portfolio", () => {
  it("charges 0.2% round trip and splits $1,000 into three sleeves", () => {
    const s = simulate([row(1, "BTC", 0, "UP", 0.01)], "long_short");
    expect(s.trades).toHaveLength(1);
    expect(s.trades[0]!.ret).toBeCloseTo(0.008, 12);
    expect(s.value).toBeCloseTo(1000 / 3 * 1.008 + 2000 / 3, 9);
  });
  it("never overlaps trades within a coin (12h hold)", () => {
    const s = simulate([row(1, "BTC", 0, "UP", 0.01), row(2, "BTC", 5, "UP", 0.05), row(3, "BTC", 12, "DOWN", -0.02)], "long_short");
    expect(s.trades.map((t) => t.id)).toEqual([1, 3]);
    expect(s.trades[1]!.ret).toBeCloseTo(0.02 - 0.002, 12); // short profits from a fall
  });
  it("up-only mode skips DOWN calls; ignores NO_CALL and pending", () => {
    const s = simulate([row(1, "ETH", 0, "DOWN", -0.03), row(2, "ETH", 1, "NO_CALL", 0.02), row(3, "ETH", 2, "UP", null)], "up_only");
    expect(s.trades).toHaveLength(0);
    expect(s.value).toBeCloseTo(1000, 9);
  });
  it("hold-BTC benchmark uses first and last BTC entry prices", () => {
    const h = holdBtc([row(1, "BTC", 0, "NO_CALL", null, 100), row(2, "BTC", 1, "NO_CALL", null, 90), row(3, "BTC", 2, "NO_CALL", null, 110)]);
    expect(h!.ret).toBeCloseTo(0.1, 12);
    expect(h!.maxDD).toBeCloseTo(0.1, 12);
  });
});
