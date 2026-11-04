import { describe, expect, it } from "vitest";
import { backtest, type Bar, DEFAULT_STRATEGY, decodeStrategy, encodeStrategy, INDICATORS, opinions, scores } from "./backtest";

function bars(n: number, seed = 1): Bar[] {
  let s = seed, p = 100;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p *= 1 + (r() - 0.5) * 0.02;
    return { t: i * 3600e3, o, h: Math.max(o, p) * (1 + r() * 0.003), l: Math.min(o, p) * (1 - r() * 0.003), c: p, v: 100 + r() * 900 };
  });
}

describe("lab backtest: no lookahead", () => {
  it("changing future bars never changes past indicator values or scores", () => {
    const a = bars(600);
    for (const cut of [100, 333, 550]) {
      const b = a.map((x, i) => (i > cut ? { ...x, c: x.c * 3, h: x.h * 3, l: x.l * 0.2, v: x.v * 50 } : x));
      const oa = opinions(a), ob = opinions(b);
      for (const k of INDICATORS) expect(ob[k].slice(0, cut + 1)).toEqual(oa[k].slice(0, cut + 1));
      expect(scores(b, DEFAULT_STRATEGY).slice(0, cut + 1)).toEqual(scores(a, DEFAULT_STRATEGY).slice(0, cut + 1));
    }
  });
  it("trades exit exactly `hold` bars later and never overlap", () => {
    const r = backtest(bars(800, 7), { ...DEFAULT_STRATEGY, enter: 0.05, shorts: true });
    expect(r.trades.length).toBeGreaterThan(5);
    r.trades.forEach((t, i) => {
      expect(t.exit - t.entry).toBe(DEFAULT_STRATEGY.hold);
      if (i) expect(t.entry).toBeGreaterThanOrEqual(r.trades[i - 1]!.exit);
    });
  });
  it("fees are charged on both sides", () => {
    const flat: Bar[] = Array.from({ length: 200 }, (_, i) => ({ t: i, o: 100, h: 100, l: 100, c: 100, v: 1 }));
    const s = { ...DEFAULT_STRATEGY, weights: { rsi: 0, macd: 0, ema: 0, bbands: 0, vwap: 0, supertrend: 1 }, enter: 0.5 };
    const r = backtest(flat, s);
    r.trades.forEach((t) => expect(t.ret).toBeCloseTo(-0.002, 12));
  });
  it("strategy survives a URL round trip", () => {
    const s = { ...DEFAULT_STRATEGY, enter: 0.42, hold: 6, shorts: true, weights: { ...DEFAULT_STRATEGY.weights, vwap: -0.3 } };
    const d = decodeStrategy(new URLSearchParams(encodeStrategy(s, "SOL")));
    expect(d.coin).toBe("SOL");
    expect(d.s).toEqual(s);
  });
});
