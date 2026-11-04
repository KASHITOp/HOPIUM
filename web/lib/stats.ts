/**
 * All statistics shown on the site. Pure functions, unit-tested against hand-checked values (stats.test.ts).
 */

/** Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.959964): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 1, p: NaN };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half), p };
}

function logGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function binomPmf(k: number, n: number, p = 0.5): number {
  if (k < 0 || k > n) return 0;
  const lc = logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  return Math.exp(lc + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** Exact binomial test vs p. two-sided = sum of P(X=i) for all i with P(X=i) <= P(X=k) (R's binom.test). */
export function binomialTest(k: number, n: number, p = 0.5): { twoSided: number; atLeast: number } {
  if (n === 0) return { twoSided: 1, atLeast: 1 };
  const pk = binomPmf(k, n, p);
  let two = 0;
  let atLeast = 0;
  for (let i = 0; i <= n; i++) {
    const pi = binomPmf(i, n, p);
    if (pi <= pk * (1 + 1e-7)) two += pi;
    if (i >= k) atLeast += pi;
  }
  return { twoSided: Math.min(1, two), atLeast: Math.min(1, atLeast) };
}

/** Plain-English answer to "could this be luck?" for a hit rate vs a 50% coin flip. */
export function luckSentence(k: number, n: number): string {
  if (n < 10) return `Only ${n} graded calls. Far too few to tell skill from luck.`;
  const { atLeast } = binomialTest(k, n, 0.5);
  const pct = atLeast * 100;
  const shown = pct < 0.1 ? "under 0.1%" : pct < 1 ? `about ${pct.toFixed(1)}%` : `about ${Math.round(pct)}%`;
  if (k / n <= 0.5) return `Could this be luck? It is not even beating a coin flip (${k} of ${n}).`;
  return `Could this be luck? A fair coin would do at least this well ${shown} of the time (${k} of ${n}).`;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Annualised Sharpe ratio of periodic returns (risk-free = 0). */
export function sharpe(returns: number[], periodsPerYear = 365): number {
  const s = stdev(returns);
  if (!Number.isFinite(s) || s === 0) return NaN;
  return (mean(returns) / s) * Math.sqrt(periodsPerYear);
}

/** Largest peak-to-trough fall of an equity curve, as a positive fraction. */
export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.max(dd, 1 - v / peak);
  }
  return dd;
}

export interface CalBin {
  lo: number;
  hi: number;
  n: number;
  predicted: number;
  actual: number;
}

/** Reliability bins: mean predicted probability vs observed frequency. Empty bins are dropped. */
export function calibrationBins(probs: number[], outcomes: boolean[], edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]): CalBin[] {
  const out: CalBin[] = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b]!;
    const hi = edges[b + 1]!;
    const idx = probs.map((p, i) => ((p >= lo && p < hi) || (b === edges.length - 2 && p === hi) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    out.push({ lo, hi, n: idx.length, predicted: mean(idx.map((i) => probs[i]!)), actual: idx.filter((i) => outcomes[i]).length / idx.length });
  }
  return out;
}

/** Longest and current streaks of a hit/miss sequence (oldest first). */
export function streaks(hits: boolean[]): { current: number; currentKind: "hit" | "miss" | null; longestHit: number; longestMiss: number } {
  let longestHit = 0, longestMiss = 0, run = 0;
  let kind: boolean | null = null;
  for (const h of hits) {
    if (h === kind) run++;
    else { kind = h; run = 1; }
    if (h) longestHit = Math.max(longestHit, run);
    else longestMiss = Math.max(longestMiss, run);
  }
  return { current: run, currentKind: kind === null ? null : kind ? "hit" : "miss", longestHit, longestMiss };
}

/** Never round in a flattering direction: hit rates are floored, losses are shown as computed. */
export function pctFloor(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "n/a";
  const f = 10 ** digits;
  return `${(Math.floor(x * 100 * f) / f).toFixed(digits)}%`;
}

/** Upper bounds of intervals round UP so the printed interval is never narrower than the real one. */
export function pctCeil(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "n/a";
  const f = 10 ** digits;
  return `${(Math.ceil(x * 100 * f) / f).toFixed(digits)}%`;
}
