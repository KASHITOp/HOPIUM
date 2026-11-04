import { describe, expect, it } from "vitest";
import { fill, indexCloses } from "./execution";
import { latency, orderingIssues, stages } from "./lifecycle";
import { rowOutcome, summarizeOutcomes } from "./outcomes";
import { book, COST_SCENARIOS, ORIGINAL_COSTS, simulate } from "./portfolio";
import { liveOnly, period, provenanceOf } from "./provenance";
import { tally } from "./summary";
import type { Candle, Prediction } from "./types";

const H = 3600e3, T0 = Date.UTC(2026, 0, 1);
const iso = (ms: number) => new Date(ms).toISOString();
function row(id: number, o: Partial<Prediction> & { hour?: number } = {}): Prediction {
  const t = T0 + (o.hour ?? 0) * H;
  const move = o.move === undefined ? 0.02 : o.move;
  const signal = o.signal ?? "UP";
  return {
    id, coin: "BTC", horizon: "12h", prob_up: 0.3, signal, price_at_call: 100, candle_close_time: iso(t),
    inserted_at: iso(t + 120e3), target_time: iso(t + 12 * H), model_version: "t", p_big_up: 0.3, p_big_down: 0.1,
    score: 0.2, threshold: 0.16, k: 0.01, price_at_target: move === null ? null : 100 * (1 + move), move,
    outcome: move === null ? null : signal === "NO_CALL" ? "SAT_OUT" : Math.abs(move) < 0.001 ? "FLAT" : (signal === "UP") === move > 0 ? "HIT" : "MISS",
    hit: null, graded_at: move === null ? null : iso(t + 12 * H + 120e3), ...o,
  } as Prediction;
}

describe("provenance isolation", () => {
  it("demo rows never reach live metrics", () => {
    const live = [row(1), row(2, { move: -0.02 })];
    const demo = Array.from({ length: 50 }, (_, i) => ({ ...row(100 + i), provenance: "demo" as const }));
    expect(tally(liveOnly([...live, ...demo]))).toEqual(tally(live));
    expect(simulate(liveOnly([...live, ...demo]), "long_short").value).toBeCloseTo(simulate(live, "long_short").value, 12);
  });
  it("unlabelled database rows are legacy, not silently 'live_prospective'", () => {
    expect(provenanceOf(row(1))).toBe("legacy_live");
    expect(provenanceOf({ provenance: "live_prospective" })).toBe("live_prospective");
    expect(provenanceOf({ provenance: "demo" })).toBe("demo");
  });
  it("period reports exact first and last reference close", () => {
    expect(period([row(1, { hour: 5 }), row(2, { hour: 1 })])).toEqual({ start: iso(T0 + H), end: iso(T0 + 5 * H) });
    expect(period([])).toBeNull();
  });
});

describe("lifecycle timestamps", () => {
  it("missing historical times stay unknown", () => {
    const p = row(1);
    expect(stages(p).find((s) => s.key === "generated")!.iso).toBeNull();
    expect(latency(p).generation).toBeNull();
    expect(latency(p).publication).toBeCloseTo(2, 9);
  });
  it("flags misordered timestamps", () => {
    expect(orderingIssues(row(1))).toEqual([]);
    expect(orderingIssues(row(1, { inserted_at: iso(T0 - 1000) }))).toContain("stored before the reference candle closed");
    expect(orderingIssues(row(1, { inserted_at: iso(T0 + 21 * 60e3) }))).toContain("stored after the 20-minute limit");
    expect(orderingIssues(row(1, { generated_at: iso(T0 + 10 * 60e3) }))).toContain("generated after it was stored");
    expect(orderingIssues(row(1, { graded_at: iso(T0 + 11 * H) }))).toContain("graded before the horizon ended");
  });
});

describe("direction vs target event vs profit", () => {
  it("a small correct move is a directional hit, no big move, and an unprofitable trade", () => {
    const o = rowOutcome(row(1, { move: 0.0015 }));
    expect(o).toMatchObject({ direction: "HIT", declared: "BIG_UP", target: false, profitable: false });
    expect(o.net).toBeCloseTo(-0.0005, 12);
  });
  it("boundaries: flat strict at 0.1%, target strict at k", () => {
    expect(rowOutcome(row(1, { move: 0.00099 })).direction).toBe("FLAT");
    expect(rowOutcome(row(1, { move: 0.001 })).direction).toBe("HIT");
    expect(rowOutcome(row(1, { move: 0.01 })).target).toBe(false);
    expect(rowOutcome(row(1, { move: 0.0101 })).target).toBe(true);
    expect(rowOutcome(row(1, { signal: "DOWN", move: -0.0101 })).target).toBe(true);
    expect(rowOutcome(row(1, { move: 0.002 })).profitable).toBe(false); // exactly breaks even
  });
  it("denominators and exclusions are explicit", () => {
    const s = summarizeOutcomes([row(1), row(2, { move: -0.02 }), row(3, { move: 0.0005 }), row(4, { signal: "NO_CALL" }), row(5, { move: null })]);
    expect(s.direction).toEqual({ hits: 1, misses: 1, flat: 1, denominator: 2 });
    expect(s.target).toEqual({ occurred: 1, denominator: 3 });
    expect(s.trade.denominator).toBe(3);
    expect(s.excluded).toEqual({ noCall: 1, pending: 1 });
  });
});

describe("execution simulation", () => {
  const candles = (closes: [number, number][]): Candle[] => closes.map(([closeMs, c]) => ({ coin: "BTC", open_time: iso(closeMs - H), o: c, h: c, l: c, c, v: 1 }));
  it("enters at the first close after publication, never the reference close", () => {
    const idx = indexCloses(candles([[T0, 100], [T0 + H, 101], [T0 + 13 * H, 103.02]]));
    const f = fill(row(1), idx);
    expect(f.status).toBe("filled");
    if (f.status === "filled") { expect(f.entry).toBe(101); expect(f.entryT).toBe(T0 + H); expect(f.gross).toBeCloseTo(0.02, 9); }
  });
  it("is unavailable when a candle is missing; no earlier price is substituted", () => {
    const f = fill(row(1), indexCloses(candles([[T0, 100], [T0 + 13 * H, 103]])));
    expect(f).toEqual({ status: "unavailable", id: 1, reason: "entry candle not in cache" });
  });
});

describe("portfolio accounting", () => {
  const c = (id: number, coin: "BTC" | "ETH", h0: number, gross: number, side: 1 | -1 = 1) => ({ id, coin, side, entryT: T0 + h0 * H, exitT: T0 + (h0 + 12) * H, gross });
  it("compounds within a sleeve and reconciles to the trade ledger", () => {
    const b = book([c(1, "BTC", 0, 0.1), c(2, "BTC", 12, 0.1), c(3, "ETH", 0, -0.05)], "long_short");
    expect(b.sleeves.BTC).toBeCloseTo((1000 / 3) * 1.098 * 1.098, 9);
    expect(b.value).toBeCloseTo(b.sleeves.BTC + b.sleeves.ETH + b.sleeves.SOL, 9);
    for (const t of b.trades) expect(t.sleeveAfter).toBeCloseTo(t.sleeveBefore * (1 + t.ret), 9);
    expect(b.sumOfTradeReturns).toBeCloseTo(0.098 + 0.098 - 0.052, 12);
    expect(b.ret).not.toBeCloseTo(b.sumOfTradeReturns, 3); // sum of trade returns is not portfolio return
  });
  it("skips overlapping signals instead of reusing capital", () => {
    const b = book([c(1, "BTC", 0, 0.1), c(2, "BTC", 6, 0.1)], "long_short");
    expect(b.trades.map((t) => t.id)).toEqual([1]);
    expect(b.skipped).toEqual([{ id: 2, reason: "overlaps open trade on this coin" }]);
  });
  it("cost scenarios never change the published-cost result", () => {
    const cands = [c(1, "BTC", 0, 0.03), c(2, "ETH", 0, -0.01, -1)];
    const base = book(cands, "long_short").value;
    const vals = COST_SCENARIOS.map((s) => book(cands, "long_short", 1000, s.costs).value);
    expect(book(cands, "long_short", 1000, ORIGINAL_COSTS).value).toBe(base);
    expect(vals[0]).toBeGreaterThan(vals[1]!);
    expect(vals[1]).toBe(base);
    expect(vals[2]).toBeLessThan(vals[1]!);
    expect(book(cands, "long_short", 1000, { fee: 0.002, slippage: 0.001 }).trades[0]!.ret).toBeCloseTo(0.03 - 0.004, 12);
  });
});
