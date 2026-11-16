/**
 * Trust v3 (WS6 + WS7): dependence-aware statistics. Every function here is pure and unit-tested (evidence.test.ts).
 * Nothing in this file changes a stored grade, the model, or the decision threshold. Everything it prints is a
 * robustness check shown NEXT TO the original per-call numbers, never in place of them.
 */
import { FEE_ROUND_TRIP, FLAT_THRESHOLD, netReturn } from "./grading";
import { wilson } from "./stats";
import type { Coin, Prediction } from "./types";

const H12 = 12 * 3600e3;
const t = (iso: string) => Date.parse(iso);
const windowEnd = (p: Pick<Prediction, "candle_close_time" | "target_time">) => (p.target_time ? t(p.target_time) : t(p.candle_close_time) + H12);

// ----------------------------------------------------------------------------- episodes (rule episode-v1)
export const EPISODE_RULE =
  "episode-v1: per coin, an UP or DOWN call joins the open episode if it has the same direction and its reference close is " +
  "strictly before the end of the episode's latest 12h window; otherwise it starts a new episode. An opposite call closes " +
  "the episode. NO CALL hours do not close it. An episode is graded by its FIRST call's stored outcome; later calls in it " +
  "are not counted again.";

export interface Episode {
  id: string; // "E<first prediction id>"
  coin: Coin;
  direction: "UP" | "DOWN";
  first: Prediction;
  members: number[];
  end: number; // ms, end of the latest member's window
}

/** Cluster calls into episodes. Pass ALL rows so ids are stable whatever filter is applied afterwards. */
export function clusterEpisodes(rows: Prediction[]): { episodes: Episode[]; byId: Map<number, string> } {
  const calls = rows.filter((r) => r.signal !== "NO_CALL").sort((a, b) => t(a.candle_close_time) - t(b.candle_close_time) || a.id - b.id);
  const open = new Map<Coin, Episode>();
  const episodes: Episode[] = [];
  const byId = new Map<number, string>();
  for (const r of calls) {
    const dir = r.signal as "UP" | "DOWN";
    const cur = open.get(r.coin);
    if (cur && cur.direction === dir && t(r.candle_close_time) < cur.end) {
      cur.members.push(r.id);
      cur.end = Math.max(cur.end, windowEnd(r));
    } else {
      const e: Episode = { id: `E${r.id}`, coin: r.coin, direction: dir, first: r, members: [r.id], end: windowEnd(r) };
      episodes.push(e);
      open.set(r.coin, e);
    }
    byId.set(r.id, open.get(r.coin)!.id);
  }
  return { episodes, byId };
}

export interface HitRate { hits: number; misses: number; flat: number; pending: number; n: number; rate: number; lo: number; hi: number }

function hitRate(outcomes: (Prediction["outcome"])[]): HitRate {
  let hits = 0, misses = 0, flat = 0, pending = 0;
  for (const o of outcomes) {
    if (o === null) pending++;
    else if (o === "HIT") hits++;
    else if (o === "MISS") misses++;
    else if (o === "FLAT") flat++;
  }
  const n = hits + misses;
  const w = wilson(hits, n);
  return { hits, misses, flat, pending, n, rate: n ? hits / n : NaN, lo: w.lo, hi: w.hi };
}

/** Episode hit rate for the episodes whose first call is in `selected` (the filtered rows). */
export function episodeHitRate(episodes: Episode[], selected: Prediction[]): HitRate & { episodes: number; calls: number } {
  const ids = new Set(selected.map((r) => r.id));
  const eps = episodes.filter((e) => ids.has(e.first.id));
  return { ...hitRate(eps.map((e) => e.first.outcome)), episodes: eps.length, calls: eps.reduce((a, e) => a + e.members.length, 0) };
}

// ----------------------------------------------------------------------------- non-overlapping schedule
export const NONOVERLAP_RULE =
  "sched-nonoverlap-v1: keep only calls whose reference close is 00:00 or 12:00 UTC. Fixed in advance from the clock, " +
  "never from outcomes. Each coin's 12h windows then touch but do not overlap. The three coins still move together.";

export function nonOverlapping<T extends Pick<Prediction, "candle_close_time">>(rows: T[]): T[] {
  return rows.filter((r) => {
    const d = new Date(r.candle_close_time);
    return d.getUTCMinutes() === 0 && (d.getUTCHours() === 0 || d.getUTCHours() === 12);
  });
}

export function callHitRate(rows: Prediction[]): HitRate {
  return hitRate(rows.filter((r) => r.signal !== "NO_CALL").map((r) => r.outcome));
}

// ----------------------------------------------------------------------------- block bootstrap
/** mulberry32: small seeded PRNG so every visitor gets the same interval from the same data. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const BOOT = { blockHours: 24, draws: 2000, seed: 20261116, minCalls: 30 } as const;
export const BOOT_RULE =
  `Moving-block bootstrap over calendar hours: every graded call is placed in the bucket of its reference-close hour ` +
  `(all coins together, so same-hour coins stay together). Blocks of ${BOOT.blockHours} consecutive hours (twice the 12h ` +
  `overlap) are drawn with replacement until the resample is as long as the original; ${BOOT.draws} draws, fixed seed ` +
  `${BOOT.seed}; 95% interval = 2.5th and 97.5th percentiles. Not computed with fewer than ${BOOT.minCalls} graded calls.`;

export interface Item { hour: number; hit: boolean | null; net: number | null }

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Generic moving-block bootstrap. `items` carry an hour index; `stat` maps a resampled item list to a number
 * (NaN results are dropped). Returns the point estimate on the original data and the percentile interval.
 */
export function blockBootstrap(items: Item[], stat: (xs: Item[]) => number, opts: { blockHours?: number; draws?: number; seed?: number } = {}) {
  const L = opts.blockHours ?? BOOT.blockHours, B = opts.draws ?? BOOT.draws, rand = rng(opts.seed ?? BOOT.seed);
  const point = stat(items);
  if (!items.length) return { point, lo: NaN, hi: NaN, draws: 0, blockHours: L };
  const h0 = Math.min(...items.map((i) => i.hour)), h1 = Math.max(...items.map((i) => i.hour));
  const T = h1 - h0 + 1;
  const buckets: Item[][] = Array.from({ length: T }, () => []);
  for (const i of items) buckets[i.hour - h0]!.push(i);
  const starts = Math.max(1, T - L + 1);
  const out: number[] = [];
  for (let b = 0; b < B; b++) {
    const xs: Item[] = [];
    for (let filled = 0; filled < T; filled += L) {
      const s = Math.floor(rand() * starts);
      for (let k = s; k < Math.min(T, s + L); k++) xs.push(...buckets[k]!);
    }
    const v = stat(xs);
    if (Number.isFinite(v)) out.push(v);
  }
  out.sort((a, b) => a - b);
  return { point, lo: quantile(out, 0.025), hi: quantile(out, 0.975), draws: out.length, blockHours: L };
}

export function toItems(rows: Prediction[]): Item[] {
  return rows
    .filter((r) => r.signal !== "NO_CALL" && r.outcome !== null && r.move !== null)
    .map((r) => ({ hour: Math.floor(t(r.candle_close_time) / 3600e3), hit: r.outcome === "HIT" ? true : r.outcome === "MISS" ? false : null, net: netReturn(r.signal, r.move!) }));
}

export const hitStat = (xs: Item[]) => {
  const d = xs.filter((x) => x.hit !== null);
  return d.length ? d.filter((x) => x.hit).length / d.length : NaN;
};
export const meanNetStat = (xs: Item[]) => {
  const d = xs.filter((x) => x.net !== null);
  return d.length ? d.reduce((a, x) => a + x.net!, 0) / d.length : NaN;
};

export function bootstrapSummary(rows: Prediction[]) {
  const items = toItems(rows);
  const graded = items.filter((i) => i.hit !== null).length;
  if (graded < BOOT.minCalls) return { insufficient: true as const, graded };
  return { insufficient: false as const, graded, hit: blockBootstrap(items, hitStat), net: blockBootstrap(items, meanNetStat) };
}

// ----------------------------------------------------------------------------- baselines
export const BASELINE_RULE =
  "Baselines are scored on exactly the rows the model called (graded UP/DOWN), with the same FLAT rule (|move| < 0.1%) " +
  "and the same 0.2% round-trip fee. always-UP: go long every one of those times. class-frequency: take the direction " +
  "that was more common among moves already graded before that call was made (target time at or before the reference " +
  "close, all coins pooled); UP when tied or when nothing was graded yet.";

function dirOutcome(dir: "UP" | "DOWN", m: number): "HIT" | "MISS" | "FLAT" {
  if (Math.abs(m) < FLAT_THRESHOLD) return "FLAT";
  return (dir === "UP" ? m > 0 : m < 0) ? "HIT" : "MISS";
}

export interface BaselineResult { name: string; hr: HitRate; meanNet: number; trades: number }

export function baselines(all: Prediction[], selected: Prediction[], fee = FEE_ROUND_TRIP): BaselineResult[] {
  const elig = selected.filter((r) => r.signal !== "NO_CALL" && r.move !== null && r.outcome !== null);
  const history = all.filter((r) => r.move !== null && r.outcome !== null).map((r) => ({ end: t(r.target_time), up: r.move! > 0, down: r.move! < 0 }));
  const prior = (at: number): "UP" | "DOWN" => {
    let up = 0, down = 0;
    for (const h of history) if (h.end <= at) { if (h.up) up++; else if (h.down) down++; }
    return down > up ? "DOWN" : "UP";
  };
  const score = (name: string, dirOf: (r: Prediction) => "UP" | "DOWN"): BaselineResult => {
    const outs = elig.map((r) => dirOutcome(dirOf(r), r.move!));
    const nets = elig.map((r) => netReturn(dirOf(r), r.move!, fee));
    return { name, hr: hitRate(outs), meanNet: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : NaN, trades: nets.length };
  };
  const model = score("model (stored grades)", (r) => r.signal as "UP" | "DOWN");
  model.hr = hitRate(elig.map((r) => r.outcome));
  return [model, score("always UP", () => "UP"), score("class frequency", (r) => prior(t(r.candle_close_time)))];
}

// ----------------------------------------------------------------------------- probabilities (WS7)
export const CAL = { edges: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 1], minBin: 10, minTotal: 100, minVersion: 100 } as const;
export const BRIER_RULE =
  "Brier score = mean of (p - y)^2, where y = 1 if the event happened. Lower is better. It mixes calibration (do 20% calls " +
  "happen 20% of the time) with resolution (does p separate hours that differ) and depends on how rare the event is, so " +
  "it is not a calibration score on its own. Baseline: for each hour, the share of earlier graded hours (target time at " +
  "or before that reference close, all coins) where the event happened; the first hours with no history are left out of " +
  "both. Skill = 1 - model / baseline; above 0 means better than the base rate.";

export type EventKind = "big_up" | "big_down";

export interface ProbRow { p: number; y: boolean; at: number; end: number; version: string }

export function probRows(rows: Prediction[], kind: EventKind): ProbRow[] {
  return rows
    .filter((r) => r.move !== null && r.outcome !== null && (kind === "big_up" ? (r.p_big_up ?? r.prob_up) : r.p_big_down) !== null)
    .map((r) => {
      const k = r.k ?? 0.01;
      const p = kind === "big_up" ? (r.p_big_up ?? r.prob_up) : r.p_big_down!;
      return { p, y: kind === "big_up" ? r.move! > k : r.move! < -k, at: t(r.candle_close_time), end: t(r.target_time), version: r.model_version };
    });
}

export interface Bin { lo: number; hi: number; n: number; predicted: number; actual: number; enough: boolean }

/** Reliability bins with a count per bin; bins with fewer than CAL.minBin rows are flagged, never interpreted. */
export function reliability(pr: ProbRow[], edges: readonly number[] = CAL.edges): Bin[] {
  const out: Bin[] = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b]!, hi = edges[b + 1]!;
    const last = b === edges.length - 2;
    const xs = pr.filter((r) => r.p >= lo && (r.p < hi || (last && r.p <= hi)));
    if (!xs.length) continue;
    out.push({ lo, hi, n: xs.length, predicted: xs.reduce((a, r) => a + r.p, 0) / xs.length, actual: xs.filter((r) => r.y).length / xs.length, enough: xs.length >= CAL.minBin });
  }
  return out;
}

export interface Brier { n: number; model: number; baseline: number; skill: number; insufficient: boolean }

export function brier(pr: ProbRow[], all: ProbRow[] = pr, minN: number = CAL.minTotal): Brier {
  const sortedEnds = all.map((r) => ({ end: r.end, y: r.y })).sort((a, b) => a.end - b.end);
  let m = 0, b = 0, n = 0;
  for (const r of pr) {
    let seen = 0, hits = 0;
    for (const h of sortedEnds) { if (h.end > r.at) break; seen++; if (h.y) hits++; }
    if (!seen) continue;
    const base = hits / seen;
    m += (r.p - (r.y ? 1 : 0)) ** 2;
    b += (base - (r.y ? 1 : 0)) ** 2;
    n++;
  }
  const model = n ? m / n : NaN, baseline = n ? b / n : NaN;
  return { n, model, baseline, skill: baseline > 0 ? 1 - model / baseline : NaN, insufficient: n < minN };
}

export function byVersion(pr: ProbRow[], all: ProbRow[]): { version: string; brier: Brier }[] {
  const vs = [...new Set(pr.map((r) => r.version))].sort();
  return vs.map((v) => ({ version: v, brier: brier(pr.filter((r) => r.version === v), all, CAL.minVersion) }));
}

/** Hopium Meter formula, the single source for every page that explains it. */
export const METER = {
  formula: "lean = 0.5 + |P(big up) - P(big down)| / 2",
  callRule: (thr: number) => `UP if P(big up) - P(big down) > ${thr}, DOWN if < -${thr}, otherwise NO CALL`,
  callLean: (thr: number) => 0.5 + thr / 2,
} as const;
