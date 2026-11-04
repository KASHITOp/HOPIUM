/**
 * DEMO DATA. Deterministic, deliberately unflattering, and shaped like the real engine:
 * hourly 12h calls for BTC/ETH/SOL, mostly NO_CALL (live scores sit near +0.02 against a 0.16 threshold),
 * a hit rate near 50% on the rare calls, real losing streaks, FLAT moves, and a few missed runs.
 * Every page rendering this shows a "DEMO DATA" stamp. Never presented as real.
 */
import { grade } from "./grading";
import type { Candle, Coin, Prediction, RunLog } from "./types";

const COINS: Coin[] = ["BTC", "ETH", "SOL"];
const START: Record<Coin, number> = { BTC: 78000, ETH: 2300, SOL: 93 };
const H = 3600e3;
const THRESHOLD = 0.16;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

/** Hourly closes for the last `hours` hours, ending at the last closed candle. */
function paths(nowMs: number, hours: number) {
  const r = rng(20261104);
  const end = Math.floor(nowMs / H) * H;
  const out: Record<Coin, { t: number; c: number }[]> = { BTC: [], ETH: [], SOL: [] };
  for (const coin of COINS) {
    let p = START[coin];
    const vol = coin === "BTC" ? 0.006 : coin === "ETH" ? 0.008 : 0.011;
    const series = [];
    for (let i = hours; i >= 0; i--) {
      p *= 1 + gauss(r) * vol;
      series.push({ t: end - i * H, c: p });
    }
    out[coin] = series;
  }
  return out;
}

export function mockData(nowMs = Date.now(), days = 30) {
  const hours = days * 24;
  const px = paths(nowMs, hours); // px[coin][j] = candle opening at end - (hours - j)h; last element = last closed candle
  const r = rng(424242);
  const preds: Prediction[] = [];
  const runs: RunLog[] = [];
  let id = 1;
  const missed = new Set<number>();
  for (let i = 0; i < 4; i++) missed.add(Math.floor(r() * hours));
  for (let i = 0; i < px.BTC.length; i++) {
    const closeT = px.BTC[i]!.t + H; // candle close = prediction time
    if (closeT > nowMs) break;
    if (missed.has(i)) {
      runs.push({ id: runs.length + 1, job: "predict", candle_close_time: new Date(closeT).toISOString(), status: "missed",
        detail: `started ${(20 + r() * 25).toFixed(1)} min after candle close; skipped, never backfilled`, logged_at: new Date(closeT + 25 * 60e3).toISOString() });
      continue;
    }
    for (const coin of COINS) {
      const s = px[coin];
      const entry = s[i]!.c;
      const exitIdx = i + 12;
      // scores cluster near +0.02; roughly 1 in 20 clears the threshold
      const score = Math.max(-0.6, Math.min(0.6, 0.02 + gauss(r) * 0.075));
      const pDown = Math.min(0.6, Math.max(0.05, 0.2 - score / 2 + (r() - 0.5) * 0.04));
      const pUp = Math.min(0.9, pDown + score);
      const sig = score > THRESHOLD ? "UP" : score < -THRESHOLD ? "DOWN" : "NO_CALL";
      const target = closeT + 12 * H;
      const graded = target <= nowMs && exitIdx < s.length;
      const g = graded ? grade(sig, entry, s[exitIdx]!.c) : null;
      preds.push({
        id: id++, coin, horizon: "12h", prob_up: +pUp.toFixed(6), signal: sig, price_at_call: +entry.toFixed(2),
        candle_close_time: new Date(closeT).toISOString(),
        inserted_at: new Date(closeT + (2 + r() * 4) * 60e3).toISOString(),
        provenance: "demo",
        target_time: new Date(target).toISOString(), model_version: "v3-12h-logreg-DEMO",
        p_big_up: +pUp.toFixed(6), p_big_down: +pDown.toFixed(6), score: +(pUp - pDown).toFixed(6), threshold: THRESHOLD, k: 0.01,
        price_at_target: g ? +s[exitIdx]!.c.toFixed(2) : null, move: g ? g.move : null, outcome: g ? g.outcome : null,
        hit: g ? g.hit : null, graded_at: g ? new Date(target + 3 * 60e3).toISOString() : null,
      });
    }
  }
  preds.reverse();
  const candles: Candle[] = COINS.flatMap((coin) =>
    px[coin].map((p, j, arr) => {
      const o = j ? arr[j - 1]!.c : p.c;
      return { coin, open_time: new Date(p.t).toISOString(), o, h: Math.max(o, p.c) * 1.002, l: Math.min(o, p.c) * 0.998, c: p.c, v: 1000 };
    }),
  );
  return { predictions: preds, runs, candles };
}
