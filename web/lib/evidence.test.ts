import { describe, expect, it } from "vitest";
import { baselines, blockBootstrap, bootstrapSummary, brier, byVersion, CAL, clusterEpisodes, episodeHitRate, hitStat, METER, nonOverlapping, probRows, rng, reliability, toItems } from "./evidence";
import type { Coin, Prediction, Signal } from "./types";

const T0 = Date.parse("2026-11-10T00:00:00Z");
let nextId = 1;
function row(coin: Coin, hour: number, signal: Signal, move: number | null, extra: Partial<Prediction> = {}): Prediction {
  const close = new Date(T0 + hour * 3600e3).toISOString();
  const target = new Date(T0 + (hour + 12) * 3600e3).toISOString();
  const outcome = move === null ? null : signal === "NO_CALL" ? "SAT_OUT" : Math.abs(move) < 0.001 ? "FLAT" : (signal === "UP") === move > 0 ? "HIT" : "MISS";
  return { id: nextId++, coin, horizon: "12h", prob_up: 0.2, signal, price_at_call: 100, candle_close_time: close, inserted_at: close, target_time: target,
    model_version: "v1", p_big_up: 0.2, p_big_down: 0.1, score: 0.1, threshold: 0.16, k: 0.01, price_at_target: null, move, outcome,
    hit: outcome === "HIT" ? true : outcome === "MISS" ? false : null, graded_at: null, ...extra } as Prediction;
}

describe("episodes", () => {
  it("joins overlapping same-direction calls; boundary at exactly 12h starts a new episode", () => {
    const a = row("BTC", 0, "UP", 0.01), b = row("BTC", 11, "UP", -0.01), c = row("BTC", 23, "UP", 0.01), d = row("BTC", 35, "UP", 0.01);
    const { episodes, byId } = clusterEpisodes([d, c, b, a]);
    // b overlaps a (11 < 12); c at 23 < 11+12 = 23? no: strict, so new episode; d at 35 = 23+12, new
    expect(episodes.map((e) => e.members)).toEqual([[a.id, b.id], [c.id], [d.id]]);
    expect(byId.get(b.id)).toBe(`E${a.id}`);
  });
  it("chains through the latest member's window", () => {
    const a = row("ETH", 0, "DOWN", -0.01), b = row("ETH", 10, "DOWN", 0.01), c = row("ETH", 21, "DOWN", 0.01);
    expect(clusterEpisodes([a, b, c]).episodes).toHaveLength(1);
  });
  it("direction change closes the episode; NO CALL does not", () => {
    const a = row("SOL", 0, "UP", 0.01), n = row("SOL", 1, "NO_CALL", 0.01), b = row("SOL", 2, "UP", 0.01), c = row("SOL", 3, "DOWN", 0.01), d = row("SOL", 4, "UP", 0.01);
    const { episodes, byId } = clusterEpisodes([a, n, b, c, d]);
    expect(episodes.map((e) => e.members)).toEqual([[a.id, b.id], [c.id], [d.id]]);
    expect(byId.has(n.id)).toBe(false);
  });
  it("coins are clustered separately", () => {
    const a = row("BTC", 0, "UP", 0.01), b = row("ETH", 1, "UP", 0.01), c = row("BTC", 2, "UP", 0.01);
    const { episodes } = clusterEpisodes([a, b, c]);
    expect(episodes.map((e) => [e.coin, e.members.length])).toEqual([["BTC", 2], ["ETH", 1]]);
  });
  it("graded by the first call only", () => {
    const a = row("BTC", 0, "UP", -0.01), b = row("BTC", 1, "UP", 0.02), c = row("BTC", 2, "UP", 0.02);
    const { episodes } = clusterEpisodes([a, b, c]);
    const hr = episodeHitRate(episodes, [a, b, c]);
    expect([hr.episodes, hr.calls, hr.hits, hr.misses]).toEqual([1, 3, 0, 1]);
  });
});

describe("non-overlapping schedule", () => {
  it("keeps only 00:00 and 12:00 UTC", () => {
    const rs = [0, 1, 11, 12, 13, 24, 36].map((h) => row("BTC", h, "UP", 0.01));
    expect(nonOverlapping(rs).map((r) => new Date(r.candle_close_time).getUTCHours())).toEqual([0, 12, 0, 12]);
  });
});

describe("block bootstrap", () => {
  const rs = Array.from({ length: 120 }, (_, i) => row(["BTC", "ETH", "SOL"][i % 3] as Coin, Math.floor(i / 3), "UP", i % 5 < 3 ? 0.01 : -0.01));
  it("is reproducible with a fixed seed and different with another", () => {
    const a = blockBootstrap(toItems(rs), hitStat, { seed: 7, draws: 500 });
    const b = blockBootstrap(toItems(rs), hitStat, { seed: 7, draws: 500 });
    const c = blockBootstrap(toItems(rs), hitStat, { seed: 8, draws: 500 });
    expect(a).toEqual(b);
    expect(c.draws).toBe(500);
    expect(rng(7)()).toBe(rng(7)());
    expect(rng(7)()).not.toBe(rng(8)());
    expect(a.point).toBeCloseTo(0.6, 10);
    expect(a.lo).toBeLessThan(0.6);
    expect(a.hi).toBeGreaterThan(0.6);
  });
  it("refuses small samples", () => {
    expect(bootstrapSummary(rs.slice(0, 20)).insufficient).toBe(true);
    expect(bootstrapSummary(rs).insufficient).toBe(false);
  });
});

describe("baselines", () => {
  it("always UP and prior-only class frequency on the model's rows, same fee and flat rule", () => {
    const h1 = row("BTC", 0, "NO_CALL", -0.02); // graded by hour 12: history says DOWN
    const h2 = row("BTC", 1, "NO_CALL", -0.02);
    const c1 = row("BTC", 5, "DOWN", 0.03); // before any history: class-freq goes UP
    const c2 = row("BTC", 20, "UP", -0.0005); // FLAT for everyone; class-freq goes DOWN
    const c3 = row("BTC", 30, "UP", -0.02);
    const [m, up, cf] = baselines([h1, h2, c1, c2, c3], [h1, h2, c1, c2, c3]);
    expect([m!.hr.hits, m!.hr.misses, m!.hr.flat]).toEqual([0, 2, 1]);
    expect([up!.hr.hits, up!.hr.misses, up!.hr.flat]).toEqual([1, 1, 1]);
    expect([cf!.hr.hits, cf!.hr.misses, cf!.hr.flat]).toEqual([2, 0, 1]);
    expect(up!.meanNet).toBeCloseTo((0.03 - 0.0005 - 0.02) / 3 - 0.002, 12);
    expect(up!.trades).toBe(3);
  });
});

describe("calibration and Brier", () => {
  it("bins carry counts and flag small bins", () => {
    const rs = [...Array(12)].map((_, i) => row("BTC", i, "NO_CALL", i < 3 ? 0.02 : 0, { p_big_up: 0.22 }))
      .concat([row("BTC", 50, "NO_CALL", 0, { p_big_up: 0.07 })]);
    const bins = reliability(probRows(rs, "big_up"));
    expect(bins.map((b) => [b.lo, b.n, b.enough])).toEqual([[0.05, 1, false], [0.2, 12, true]]);
    expect(bins[1]!.actual).toBeCloseTo(0.25, 12);
  });
  it("Brier uses prior-only base rates and marks small samples insufficient", () => {
    const rs = [row("BTC", 0, "NO_CALL", 0.02, { p_big_up: 0.5 }), row("BTC", 12, "NO_CALL", 0, { p_big_up: 0.5 }), row("BTC", 24, "NO_CALL", 0.02, { p_big_up: 0.5 })];
    const b = brier(probRows(rs, "big_up"));
    // row 0 has no history (excluded); row 1 base 1.0, y=0 -> 1; row 2 base 0.5, y=1 -> 0.25
    expect(b.n).toBe(2);
    expect(b.model).toBeCloseTo(0.25, 12);
    expect(b.baseline).toBeCloseTo(0.625, 12);
    expect(b.insufficient).toBe(true);
    expect(CAL.minTotal).toBeGreaterThan(2);
  });
  it("splits by model version", () => {
    const rs = [row("BTC", 0, "NO_CALL", 0.02), row("BTC", 12, "NO_CALL", 0, { model_version: "v2" })];
    const pr = probRows(rs, "big_up");
    expect(byVersion(pr, pr).map((v) => v.version)).toEqual(["v1", "v2"]);
  });
});

describe("meter", () => {
  it("call lean for threshold 0.16 is 58%", () => {
    expect(METER.callLean(0.16)).toBeCloseTo(0.58, 12);
  });
});

describe("csv", async () => {
  const { toCsv } = await import("./filters");
  it("adds episode_id as the last column", () => {
    const a = row("BTC", 0, "UP", 0.01), b = row("BTC", 1, "UP", 0.01), n = row("BTC", 2, "NO_CALL", 0.01);
    const lines = toCsv([a, b, n], clusterEpisodes([a, b, n]).byId).trim().split("\n");
    expect(lines[0]!.endsWith(",episode_id")).toBe(true);
    expect(lines[1]!.endsWith(`,E${a.id}`)).toBe(true);
    expect(lines[2]!.endsWith(`,E${a.id}`)).toBe(true);
    expect(lines[3]!.endsWith(",")).toBe(true);
  });
});
