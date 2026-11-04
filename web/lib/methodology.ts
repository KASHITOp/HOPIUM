/** Exactly what each headline number is (trust v1). Text only; nothing here recomputes a published result. */
import engine from "./engine.json";

const wf = engine.walk_forward;
const sumNet = Object.values(wf.per_coin).reduce((s, c) => s + c.net_sum, 0);

export const WALK_FORWARD = {
  figure: wf["net_0.20%"],
  sumOfTradeReturns: sumNet,
  period: "test months 2024-09-01 to 2026-04-30 UTC (dev period); holdout 2026-05-01 to 2026-11-03 UTC",
  lines: [
    `Compounded return of a simulated equal-weight portfolio: three fixed sleeves of 1/3 of capital (BTC, ETH, SOL), each compounding its own trades, never rebalanced, no leverage. It is not a sum of trade returns (that sum is ${(sumNet * 100).toFixed(1)}%).`,
    "At most one open trade per coin; signals during an open trade are skipped, so capital is never used twice.",
    "Entry at the reference candle close the forecast was computed from, exit at the close 12h later. That is the forecast-grading convention, not an executable fill: a real order could only be placed after the forecast existed.",
    "Costs: 0.2% per round trip only. Not modelled: slippage, spread, short borrow or funding, taxes.",
    "Shorts: return = minus the move, as on a linear perpetual with zero funding.",
    "Sharpe: daily equity, annualised with sqrt(365), 95% interval from a 20-day block bootstrap (1,000 draws). Not adjusted for picking the best of 39 configs.",
    "Max drawdown on the daily equity curve, which books each trade on its entry day, so intratrade swings are not seen.",
    "Execution-convention (post-publication entry) walk-forward: not computed. Needs the research candle history; marked unavailable rather than estimated.",
  ],
} as const;
