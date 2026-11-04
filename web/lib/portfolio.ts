/**
 * SIMULATED paper portfolio. Accounting, stated exactly (same rules as ml/research/harness.py `portfolio`):
 *   capital    $1,000 split into three fixed sleeves of 1/3 (BTC, ETH, SOL). Never rebalanced, no leverage.
 *   positions  at most one open trade per coin; a call arriving while that coin's trade is open is skipped (no overlap,
 *              no double use of a sleeve's capital). A new trade may start at the same instant the previous one exits.
 *   sizing     each trade uses the whole sleeve; sleeves compound their own trades.
 *   shorts     return = -move (linear). Borrow/funding costs not modelled.
 *   costs      fee per round trip (default 0.2%) plus 2 * slippage (default 0) subtracted from each trade's return.
 *   valuation  realized at trade exit only, no mark-to-market, so drawdown understates intratrade drawdown.
 * Two entry conventions: "reference" (forecast-grading close, not executable) and "exec-v1" (lib/execution.ts).
 */
import { FEE_ROUND_TRIP } from "./grading";
import { maxDrawdown } from "./stats";
import type { Coin, Prediction } from "./types";

export interface Candidate { id: number; coin: Coin; side: 1 | -1; entryT: number; exitT: number; gross: number }
export interface Trade extends Candidate { ret: number; sleeveBefore: number; sleeveAfter: number }
export interface Costs { fee: number; slippage: number } // slippage per side

export const COINS: Coin[] = ["BTC", "ETH", "SOL"];
export const ORIGINAL_COSTS: Costs = { fee: FEE_ROUND_TRIP, slippage: 0 };
export const COST_SCENARIOS: { name: string; costs: Costs }[] = [
  { name: "0.10% round trip", costs: { fee: 0.001, slippage: 0 } },
  { name: "0.20% round trip (published)", costs: ORIGINAL_COSTS },
  { name: "0.20% + 0.05% slippage per side", costs: { fee: 0.002, slippage: 0.0005 } },
  { name: "0.30% + 0.10% slippage per side", costs: { fee: 0.003, slippage: 0.001 } },
];

export function book(cands: Candidate[], mode: "long_short" | "up_only", start = 1000, costs: Costs = ORIGINAL_COSTS) {
  const sorted = [...cands].sort((a, b) => a.entryT - b.entryT || a.id - b.id);
  const busy: Record<Coin, number> = { BTC: -Infinity, ETH: -Infinity, SOL: -Infinity };
  const taken: Candidate[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (const c of sorted) {
    if (mode === "up_only" && c.side !== 1) continue;
    if (c.entryT < busy[c.coin]) { skipped.push({ id: c.id, reason: "overlaps open trade on this coin" }); continue; }
    taken.push(c);
    busy[c.coin] = c.exitT;
  }
  const eq: Record<Coin, number> = { BTC: start / 3, ETH: start / 3, SOL: start / 3 };
  const trades: Trade[] = [];
  const curve = [{ t: sorted[0]?.entryT ?? Date.now(), v: start }];
  for (const c of [...taken].sort((a, b) => a.exitT - b.exitT || a.id - b.id)) {
    const ret = c.gross - costs.fee - 2 * costs.slippage;
    const before = eq[c.coin];
    eq[c.coin] = before * (1 + ret);
    trades.push({ ...c, ret, sleeveBefore: before, sleeveAfter: eq[c.coin] });
    curve.push({ t: c.exitT, v: COINS.reduce((s, k) => s + eq[k], 0) });
  }
  const value = COINS.reduce((s, k) => s + eq[k], 0);
  const wins = trades.filter((t) => t.ret > 0).length;
  return {
    trades, skipped, curve, value, sleeves: eq, ret: value / start - 1,
    sumOfTradeReturns: trades.reduce((s, t) => s + t.ret, 0),
    winRate: trades.length ? wins / trades.length : NaN, maxDD: maxDrawdown(curve.map((p) => p.v)),
  };
}

/** Reference-close convention: entry = price_at_call, exit = price_at_target. Forecast-grading prices, not fills. */
export function referenceCandidates(rows: Prediction[]): Candidate[] {
  return rows.filter((r) => r.signal !== "NO_CALL" && r.move !== null && r.price_at_target !== null).map((r) => ({
    id: r.id, coin: r.coin, side: r.signal === "UP" ? 1 : -1, entryT: Date.parse(r.candle_close_time),
    exitT: Date.parse(r.target_time), gross: (r.signal === "UP" ? 1 : -1) * (r.move as number),
  }));
}

export function simulate(rows: Prediction[], mode: "long_short" | "up_only", start = 1000, costs: Costs = ORIGINAL_COSTS) {
  return book(referenceCandidates(rows), mode, start, costs);
}

/** Holding BTC from the first call's reference close to the latest reference close (same price convention). */
export function holdBtc(rows: Prediction[], start = 1000) {
  const btc = rows.filter((r) => r.coin === "BTC").sort((a, b) => Date.parse(a.candle_close_time) - Date.parse(b.candle_close_time));
  if (btc.length < 2) return null;
  const first = btc[0]!, last = btc[btc.length - 1]!;
  const curve = btc.map((r) => ({ t: Date.parse(r.candle_close_time), v: (start * r.price_at_call) / first.price_at_call }));
  return { value: curve[curve.length - 1]!.v, ret: last.price_at_call / first.price_at_call - 1, curve, maxDD: maxDrawdown(curve.map((p) => p.v)) };
}
