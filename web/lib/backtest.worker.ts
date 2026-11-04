/// <reference lib="webworker" />
import { backtest, type Bar, type Strategy } from "./backtest";

self.onmessage = (e: MessageEvent<{ bars: Bar[]; s: Strategy; seq: number }>) => {
  const { bars, s, seq } = e.data;
  const r = backtest(bars, s);
  // thin the curves for drawing
  const thin = <T,>(xs: T[], n = 600) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0 || i === xs.length - 1);
  (self as unknown as Worker).postMessage({ seq, r: { ...r, hold: thin(r.hold), equity: thin(r.equity), trades: r.trades.length } });
};
