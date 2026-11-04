/**
 * SIMULATED paper portfolio from graded live calls. Same rules as the research harness (ml/research/harness.py):
 * $1,000 split equally across BTC/ETH/SOL sleeves; each sleeve takes a call only when its previous trade has closed;
 * UP = long, DOWN = short (or skipped in "up only" mode); entry/exit = the graded 1h closes; 0.1% fee per side; no leverage.
 */
import { FEE_ROUND_TRIP } from "./grading";
import { maxDrawdown } from "./stats";
import type { Coin, Prediction } from "./types";

export interface Trade { id: number; coin: Coin; side: 1 | -1; entryT: number; exitT: number; ret: number }

export function simulate(rows: Prediction[], mode: "long_short" | "up_only", start = 1000, fee = FEE_ROUND_TRIP) {
  const coins: Coin[] = ["BTC", "ETH", "SOL"];
  const graded = rows.filter((r) => r.signal !== "NO_CALL" && r.move !== null && r.price_at_target !== null)
    .sort((a, b) => Date.parse(a.candle_close_time) - Date.parse(b.candle_close_time));
  const trades: Trade[] = [];
  const eq: Record<Coin, number> = { BTC: start / 3, ETH: start / 3, SOL: start / 3 };
  const busy: Record<Coin, number> = { BTC: 0, ETH: 0, SOL: 0 };
  for (const r of graded) {
    if (mode === "up_only" && r.signal !== "UP") continue;
    const t = Date.parse(r.candle_close_time);
    if (t < busy[r.coin]) continue;
    const side = r.signal === "UP" ? 1 : -1;
    const ret = side * (r.move as number) - fee;
    trades.push({ id: r.id, coin: r.coin, side, entryT: t, exitT: Date.parse(r.target_time), ret });
    busy[r.coin] = Date.parse(r.target_time);
  }
  // equity curve at each trade exit, in exit order
  const byExit = [...trades].sort((a, b) => a.exitT - b.exitT);
  const curve = [{ t: graded[0] ? Date.parse(graded[0].candle_close_time) : Date.now(), v: start }];
  for (const tr of byExit) {
    eq[tr.coin] *= 1 + tr.ret;
    curve.push({ t: tr.exitT, v: coins.reduce((s, c) => s + eq[c], 0) });
  }
  const value = coins.reduce((s, c) => s + eq[c], 0);
  const wins = trades.filter((t) => t.ret > 0).length;
  return { trades, curve, value, ret: value / start - 1, winRate: trades.length ? wins / trades.length : NaN, maxDD: maxDrawdown(curve.map((p) => p.v)) };
}

/** Holding BTC from the first call's entry price to the latest known 1h close. */
export function holdBtc(rows: Prediction[], start = 1000) {
  const btc = rows.filter((r) => r.coin === "BTC").sort((a, b) => Date.parse(a.candle_close_time) - Date.parse(b.candle_close_time));
  if (btc.length < 2) return null;
  const first = btc[0]!, last = btc[btc.length - 1]!;
  const curve = btc.map((r) => ({ t: Date.parse(r.candle_close_time), v: (start * r.price_at_call) / first.price_at_call }));
  return { value: curve[curve.length - 1]!.v, ret: last.price_at_call / first.price_at_call - 1, curve, maxDD: maxDrawdown(curve.map((p) => p.v)) };
}
