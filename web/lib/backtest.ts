/**
 * Lab backtester. Pure and causal: every indicator value at bar i uses bars 0..i only; a signal at bar i is traded
 * at bar i's close and exited at bar (i + hold)'s close. Fees per side. Tested in backtest.test.ts (no lookahead).
 */
import { maxDrawdown, sharpe } from "./stats";

export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

export const INDICATORS = ["rsi", "macd", "ema", "bbands", "vwap", "supertrend"] as const;
export type Indicator = (typeof INDICATORS)[number];

export interface Strategy {
  weights: Record<Indicator, number>; // -1..1, sign flips the indicator's opinion
  enter: number; // score needed to act, 0..1
  hold: number; // bars
  fee: number; // per side
  shorts: boolean;
}

export const DEFAULT_STRATEGY: Strategy = {
  weights: { rsi: 0.5, macd: 0.5, ema: 0, bbands: 0, vwap: 0, supertrend: 0.5 },
  enter: 0.35, hold: 12, fee: 0.001, shorts: false,
};

function ema(x: number[], span: number): number[] {
  const a = 2 / (span + 1);
  const out: number[] = [];
  x.forEach((v, i) => out.push(i === 0 ? v : a * v + (1 - a) * out[i - 1]!));
  return out;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Each indicator mapped to an opinion in [-1, 1] (+1 = bullish). Causal by construction. */
export function opinions(bars: Bar[]): Record<Indicator, number[]> {
  const c = bars.map((b) => b.c);
  const n = c.length;
  // RSI(14), Wilder smoothing: oversold => bullish
  const rsi: number[] = new Array(n).fill(0);
  let up = 0, dn = 0;
  for (let i = 1; i < n; i++) {
    const d = c[i]! - c[i - 1]!;
    up = (up * 13 + Math.max(d, 0)) / 14;
    dn = (dn * 13 + Math.max(-d, 0)) / 14;
    const r = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    rsi[i] = i < 14 ? 0 : clamp((50 - r) / 25);
  }
  // MACD histogram (12, 26, 9), normalised by price
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macdLine = c.map((v, i) => (e12[i]! - e26[i]!) / v);
  const sig = ema(macdLine, 9);
  const macd = macdLine.map((m, i) => (i < 35 ? 0 : clamp(Math.tanh((m - sig[i]!) / 0.002))));
  // EMA cross (20 vs 50)
  const e20 = ema(c, 20), e50 = ema(c, 50);
  const emaX = c.map((v, i) => (i < 50 ? 0 : clamp(Math.tanh(((e20[i]! - e50[i]!) / v) / 0.01))));
  // Bollinger %B (20, 2): below the lower band => bullish
  const bb: number[] = new Array(n).fill(0);
  for (let i = 19; i < n; i++) {
    const w = c.slice(i - 19, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 19);
    bb[i] = sd === 0 ? 0 : clamp((0.5 - (c[i]! - (m - 2 * sd)) / (4 * sd)) * 2);
  }
  // distance from rolling 24-bar VWAP: below VWAP => bullish (snap-back)
  const vw: number[] = new Array(n).fill(0);
  for (let i = 23; i < n; i++) {
    let pv = 0, vv = 0;
    for (let j = i - 23; j <= i; j++) {
      const b = bars[j]!;
      pv += ((b.h + b.l + b.c) / 3) * b.v;
      vv += b.v;
    }
    vw[i] = vv === 0 ? 0 : clamp(-Math.tanh((c[i]! / (pv / vv) - 1) / 0.02));
  }
  // Supertrend (ATR 10, multiplier 3): +1 in an uptrend, -1 in a downtrend
  const st: number[] = new Array(n).fill(0);
  let atr = 0, upper = 0, lower = 0, trend = 1;
  for (let i = 1; i < n; i++) {
    const b = bars[i]!, p = bars[i - 1]!;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c));
    atr = i === 1 ? tr : (atr * 9 + tr) / 10;
    const mid = (b.h + b.l) / 2;
    const bu = mid + 3 * atr, bl = mid - 3 * atr;
    upper = i === 1 || bu < upper || p.c > upper ? bu : upper;
    lower = i === 1 || bl > lower || p.c < lower ? bl : lower;
    if (c[i]! > upper) trend = 1;
    else if (c[i]! < lower) trend = -1;
    st[i] = i < 10 ? 0 : trend;
  }
  return { rsi, macd, ema: emaX, bbands: bb, vwap: vw, supertrend: st };
}

export function scores(bars: Bar[], s: Strategy): number[] {
  const op = opinions(bars);
  const wsum = INDICATORS.reduce((a, k) => a + Math.abs(s.weights[k]), 0) || 1;
  return bars.map((_, i) => INDICATORS.reduce((a, k) => a + s.weights[k] * op[k][i]!, 0) / wsum);
}

export interface BacktestResult {
  trades: { entry: number; exit: number; side: 1 | -1; ret: number }[];
  equity: { t: number; v: number }[];
  hold: { t: number; v: number }[];
  totalReturn: number;
  holdReturn: number;
  sharpe: number;
  maxDD: number;
  winRate: number;
}

export function backtest(bars: Bar[], s: Strategy, start = 1000): BacktestResult {
  const sc = scores(bars, s);
  const trades: BacktestResult["trades"] = [];
  const equity = [{ t: bars[0]?.t ?? 0, v: start }];
  let v = start;
  let i = 0;
  while (i + s.hold < bars.length) {
    const side = sc[i]! > s.enter ? 1 : s.shorts && sc[i]! < -s.enter ? -1 : 0;
    if (side) {
      const ret = side * (bars[i + s.hold]!.c / bars[i]!.c - 1) - 2 * s.fee;
      v *= 1 + ret;
      trades.push({ entry: i, exit: i + s.hold, side, ret });
      equity.push({ t: bars[i + s.hold]!.t, v });
      i += s.hold;
    } else i++;
  }
  const first = bars[0]?.c ?? 1;
  const hold = bars.map((b) => ({ t: b.t, v: (start * b.c) / first }));
  const rets = trades.map((t) => t.ret);
  return {
    trades, equity, hold, totalReturn: v / start - 1, holdReturn: (bars[bars.length - 1]?.c ?? first) / first - 1,
    sharpe: sharpe(rets, rets.length ? (365 * 24) / s.hold : 1), maxDD: maxDrawdown(equity.map((e) => e.v)),
    winRate: trades.length ? trades.filter((t) => t.ret > 0).length / trades.length : NaN,
  };
}

/** Strategy <-> URL query string, so a strategy can be shared. */
export function encodeStrategy(s: Strategy, coin: string): string {
  const p = new URLSearchParams({ coin, enter: String(s.enter), hold: String(s.hold), fee: String(s.fee), shorts: s.shorts ? "1" : "0" });
  INDICATORS.forEach((k) => p.set(k, String(s.weights[k])));
  return p.toString();
}

export function decodeStrategy(q: URLSearchParams): { s: Strategy; coin: string } {
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  };
  const weights = { ...DEFAULT_STRATEGY.weights };
  INDICATORS.forEach((k) => (weights[k] = num(k, DEFAULT_STRATEGY.weights[k], -1, 1)));
  const coin = ["BTC", "ETH", "SOL"].includes(q.get("coin") ?? "") ? q.get("coin")! : "BTC";
  return {
    coin,
    s: {
      weights, enter: num("enter", DEFAULT_STRATEGY.enter, 0, 1), hold: Math.round(num("hold", DEFAULT_STRATEGY.hold, 1, 72)),
      fee: num("fee", DEFAULT_STRATEGY.fee, 0, 0.005), shorts: q.get("shorts") === "1",
    },
  };
}
