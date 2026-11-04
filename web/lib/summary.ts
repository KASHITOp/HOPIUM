/** Derives every number the site shows from raw prediction rows, with the counting rules made explicit. */
import { netReturn } from "./grading";
import { streaks, wilson } from "./stats";
import type { Prediction } from "./types";

export const DISCLAIMER = "Not financial advice. Crypto is unregulated and can be highly risky. Predictions are probabilistic and often wrong.";

/** Hopium Meter value: lean toward the leading direction, 0.5 + |score| / 2. Not a probability. */
export function lean(p: Pick<Prediction, "score" | "prob_up">): number {
  const s = p.score ?? p.prob_up * 2 - 1;
  return 0.5 + Math.abs(s) / 2;
}

export function meterCopy(l: number, historic: { k: number; n: number } | null): string {
  if (l < 0.52) return "Coin flip energy. Sitting this one out.";
  if (l < 0.56) return "Mild hopium detected.";
  if (l <= 0.6) return "The model has a hunch.";
  if (!historic || historic.n < 30) return `Unusually confident. Not enough history yet to say how often that pays off (n = ${historic?.n ?? 0}).`;
  return `Unusually confident. Historically that's right ${Math.floor((historic.k / historic.n) * 1000) / 10}% of the time (n = ${historic.n}).`;
}

export interface Tally {
  calls: number; // UP/DOWN graded with a direction verdict
  hits: number;
  misses: number;
  flat: number;
  satOut: number;
  pending: number;
  hitRate: number;
  ci: { lo: number; hi: number };
}

/** Hit rate counts only graded UP/DOWN calls with a HIT or MISS. FLAT, NO_CALL and pending are counted separately. */
export function tally(rows: Prediction[]): Tally {
  let hits = 0, misses = 0, flat = 0, satOut = 0, pending = 0;
  for (const r of rows) {
    if (r.outcome === null) pending++;
    else if (r.outcome === "HIT") hits++;
    else if (r.outcome === "MISS") misses++;
    else if (r.outcome === "FLAT") flat++;
    else satOut++;
  }
  const calls = hits + misses;
  const w = wilson(hits, calls);
  return { calls, hits, misses, flat, satOut, pending, hitRate: calls ? hits / calls : NaN, ci: { lo: w.lo, hi: w.hi } };
}

export function lastDays(rows: Prediction[], days: number, now = Date.now()): Prediction[] {
  return rows.filter((r) => Date.parse(r.candle_close_time) >= now - days * 86400e3);
}

export function historicConfident(rows: Prediction[], minLean = 0.6): { k: number; n: number } {
  const g = rows.filter((r) => r.hit !== null && lean(r) > minLean);
  return { k: g.filter((r) => r.hit).length, n: g.length };
}

export function wallOfShame(rows: Prediction[], n = 10): Prediction[] {
  return rows.filter((r) => r.outcome === "MISS").sort((a, b) => lean(b) - lean(a)).slice(0, n);
}

export function hitStreaks(rows: Prediction[]) {
  const seq = rows.filter((r) => r.hit !== null).sort((a, b) => Date.parse(a.target_time) - Date.parse(b.target_time)).map((r) => r.hit as boolean);
  return streaks(seq);
}

/** Rolling hit rate over the last `win` graded calls, oldest first. */
export function rollingHitRate(rows: Prediction[], win = 20): { t: number; v: number; n: number }[] {
  const g = rows.filter((r) => r.hit !== null).sort((a, b) => Date.parse(a.target_time) - Date.parse(b.target_time));
  return g.map((r, i) => {
    const s = g.slice(Math.max(0, i - win + 1), i + 1);
    return { t: Date.parse(r.target_time), v: s.filter((x) => x.hit).length / s.length, n: s.length };
  });
}

export { netReturn };
