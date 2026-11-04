/**
 * Execution simulation, kept separate from forecast grading (trust v1).
 * Forecast grading uses the reference close (the candle close the forecast was computed from). That price was
 * already in the past when the forecast was stored, so it is NOT an attainable fill.
 * Convention "exec-v1": entry = close of the first 1h Binance spot candle that closes strictly after inserted_at
 * (the database-stamped publication time); exit = close h hours after that; cost = fee + 2 * slippage.
 * If either candle is missing, the fill is "unavailable". An earlier close is never substituted.
 */
import type { Candle, Coin, Prediction } from "./types";

const H = 3600e3;
export const EXEC_RULE = "exec-v1";
export const EXEC_RULE_TEXT =
  "entry at the close of the first 1h candle closing after the receipt was stored; exit at the close h hours later";

export type Fill =
  | { status: "filled"; id: number; coin: Coin; side: 1 | -1; entryT: number; exitT: number; entry: number; exit: number; gross: number; rule: string }
  | { status: "unavailable"; id: number; reason: string };

export type CloseIndex = Map<string, number>; // `${coin}|${closeMs}` -> close

export function indexCloses(candles: Candle[]): CloseIndex {
  const m: CloseIndex = new Map();
  for (const c of candles) m.set(`${c.coin}|${Date.parse(c.open_time) + H}`, c.c);
  return m;
}

export function fill(p: Prediction, closes: CloseIndex): Fill {
  if (p.signal === "NO_CALL") return { status: "unavailable", id: p.id, reason: "no call, no trade" };
  const h = parseInt(p.horizon, 10) * H;
  const ins = Date.parse(p.inserted_at);
  const entryT = Math.floor(ins / H) * H + H; // strictly after publication
  const exitT = entryT + h;
  const entry = closes.get(`${p.coin}|${entryT}`), exit = closes.get(`${p.coin}|${exitT}`);
  if (entry === undefined) return { status: "unavailable", id: p.id, reason: exitT > Date.now() ? "pending" : "entry candle not in cache" };
  if (exit === undefined) return { status: "unavailable", id: p.id, reason: exitT > Date.now() ? "pending" : "exit candle not in cache" };
  const side = p.signal === "UP" ? 1 : -1;
  return { status: "filled", id: p.id, coin: p.coin, side, entryT, exitT, entry, exit, gross: (side * (exit - entry)) / entry, rule: EXEC_RULE };
}
