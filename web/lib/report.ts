/**
 * Weekly printer report (rule report-v1). Pure functions over public rows, unit-tested in report.test.ts.
 *
 * Week: ISO 8601 week, Monday 00:00 UTC to the next Monday 00:00 UTC, keyed "yyyy-ww" (ISO week-year).
 * A call belongs to the week of its reference close. The report is a snapshot AS OF a fixed cut-off, Monday 03:31 UTC
 * right after the week ends (the scheduled run time). Outcomes graded after the cut-off are shown as pending, so the
 * page, the committed markdown and a late or repeated run all print the same numbers.
 * Nothing here re-grades a row; stored outcomes are used as they are.
 */
import { gaps, ledger, summary, type Gap } from "./coverage";
import { clusterEpisodes, episodeHitRate } from "./evidence";
import { wilson } from "./stats";
import { lean } from "./summary";
import type { WitnessReceipt } from "./commit";
import type { Prediction, RunLog } from "./types";

const DAY = 86400e3;
const WEEK = 7 * DAY;
export const CUTOFF_AFTER_WEEK_MS = (3 * 60 + 31) * 60e3; // Monday 03:31 UTC
export const REPORT_RULE =
  "report-v1: ISO weeks (Monday 00:00 UTC to Monday 00:00 UTC). A call belongs to the week of its reference close. " +
  "Numbers are a snapshot as of Monday 03:31 UTC after the week ends; anything graded later shows as pending here and " +
  "counts on /receipts. Episodes are counted in the week their first call was made.";

// ----------------------------------------------------------------------------- ISO weeks
/** Monday 00:00 UTC of ISO week `week` of ISO week-year `year`. */
export function isoWeekStart(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  return jan4 - dow * DAY + (week - 1) * WEEK;
}

export function isoWeekOf(ms: number): { year: number; week: number } {
  const d = new Date(Math.floor(ms / DAY) * DAY);
  const dow = (d.getUTCDay() + 6) % 7;
  const thursday = d.getTime() + (3 - dow) * DAY; // the ISO year is the year of this week's Thursday
  const year = new Date(thursday).getUTCFullYear();
  return { year, week: Math.floor((thursday - isoWeekStart(year, 1)) / WEEK) + 1 };
}

export const weekKey = (w: { year: number; week: number }) => `${w.year}-${String(w.week).padStart(2, "0")}`;

export function parseWeekKey(key: string): { year: number; week: number; start: number; end: number; cutoff: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]), week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const start = isoWeekStart(year, week);
  if (weekKey(isoWeekOf(start)) !== key) return null; // e.g. week 53 in a 52-week year
  return { year, week, start, end: start + WEEK, cutoff: start + WEEK + CUTOFF_AFTER_WEEK_MS };
}

/** Newest week whose cut-off has passed. */
export function latestReportableWeek(now: number): string {
  let k = weekKey(isoWeekOf(now));
  while (parseWeekKey(k)!.cutoff > now) k = weekKey(isoWeekOf(parseWeekKey(k)!.start - DAY));
  return k;
}

/** Every reportable week from the launch week to the latest one, newest first. */
export function reportableWeeks(launchIso: string | null, now: number): string[] {
  if (!launchIso) return [];
  const first = parseWeekKey(weekKey(isoWeekOf(Date.parse(launchIso))))!.start;
  const out: string[] = [];
  for (let k = latestReportableWeek(now); parseWeekKey(k)!.start >= first; k = weekKey(isoWeekOf(parseWeekKey(k)!.start - DAY))) out.push(k);
  return out;
}

// ----------------------------------------------------------------------------- snapshot
/** The row as it stood at `cutoff`: rows inserted later are dropped, grades made later are blanked. */
export function asOf(rows: Prediction[], cutoff: number): Prediction[] {
  return rows
    .filter((r) => Date.parse(r.inserted_at) <= cutoff)
    .map((r) => (r.outcome !== null && (!r.graded_at || Date.parse(r.graded_at) > cutoff)
      ? { ...r, outcome: null, hit: null, move: null, price_at_target: null, graded_at: null }
      : r));
}

export interface Rekt { id: number; coin: string; signal: "UP" | "DOWN"; lean: number; move: number; close: string; version: string }

export interface WeeklyReport {
  key: string;
  start: string;
  end: string;
  cutoff: string;
  partial: boolean; // launch happened inside this week
  rows: number; // predictions printed (calls + NO CALL)
  calls: number; // UP or DOWN
  hits: number;
  misses: number;
  flat: number;
  pending: number; // calls not graded by the cut-off
  satOut: number; // NO CALL rows
  callRate: { n: number; rate: number; lo: number; hi: number };
  episodes: { started: number; calls: number; n: number; hits: number; misses: number; flat: number; pending: number; rate: number; lo: number; hi: number };
  coverage: { expected: number; published: number; pct: number | null };
  outages: Gap[];
  versions: string[];
  rekt: Rekt | null;
  witness: { submitted: number; failed: number };
}

export function buildWeeklyReport(all: Prediction[], runs: RunLog[], witness: WitnessReceipt[], key: string): WeeklyReport {
  const w = parseWeekKey(key);
  if (!w) throw new Error(`bad week key ${key}`);
  const rows = asOf(all, w.cutoff);
  const inWeek = (iso: string) => { const t = Date.parse(iso); return t >= w.start && t < w.end; };
  const week = rows.filter((r) => inWeek(r.candle_close_time));
  const calls = week.filter((r) => r.signal !== "NO_CALL");
  const count = (o: string) => calls.filter((r) => r.outcome === o).length;
  const hits = count("HIT"), misses = count("MISS");
  const cw = wilson(hits, hits + misses);

  const ep = clusterEpisodes(rows); // all rows, so an episode that started last week is not re-counted
  const eh = episodeHitRate(ep.episodes, week);

  const launchT = rows.map((r) => Date.parse(r.candle_close_time)).sort((a, b) => a - b)[0];
  const slots = ledger(rows, runs.filter((r) => Date.parse(r.logged_at) <= w.cutoff), w.cutoff).filter((s) => inWeek(s.close));
  const cov = summary(slots);

  const missed = calls.filter((r) => r.outcome === "MISS" && r.move !== null)
    .sort((a, b) => lean(b) - lean(a) || a.id - b.id)[0];
  const ws = witness.filter((x) => inWeek(x.logged_at));

  return {
    key, start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(), cutoff: new Date(w.cutoff).toISOString(),
    partial: launchT !== undefined && launchT > w.start,
    rows: week.length, calls: calls.length, hits, misses, flat: count("FLAT"), pending: calls.filter((r) => r.outcome === null).length,
    satOut: week.length - calls.length,
    callRate: { n: hits + misses, rate: hits + misses ? hits / (hits + misses) : NaN, lo: cw.lo, hi: cw.hi },
    episodes: { started: eh.episodes, calls: eh.calls, n: eh.n, hits: eh.hits, misses: eh.misses, flat: eh.flat, pending: eh.pending, rate: eh.rate, lo: eh.lo, hi: eh.hi },
    coverage: { expected: cov.expected, published: cov.published, pct: cov.pct },
    outages: gaps(slots),
    versions: [...new Set(week.map((r) => r.model_version))].sort(),
    rekt: missed ? { id: missed.id, coin: missed.coin, signal: missed.signal as "UP" | "DOWN", lean: lean(missed), move: missed.move!, close: missed.candle_close_time, version: missed.model_version } : null,
    witness: { submitted: ws.filter((x) => x.status !== "failed").length, failed: ws.filter((x) => x.status === "failed").length },
  };
}

// ----------------------------------------------------------------------------- formatting (shared by page, markdown, image)
/** Floors hit rates and ceils upper bounds, same convention as /receipts. */
export const floorPct = (x: number | null) => (x === null || !Number.isFinite(x) ? "n/a" : `${(Math.floor(x * 1000) / 10).toFixed(1)}%`);
export const ceilPct = (x: number) => (Number.isFinite(x) ? `${(Math.ceil(x * 1000) / 10).toFixed(1)}%` : "n/a");
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "-" : ""}${Math.abs(x * 100).toFixed(2)}%`;
const hm = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function weekRange(r: Pick<WeeklyReport, "start" | "end">): string {
  const a = new Date(r.start), b = new Date(Date.parse(r.end) - DAY);
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} to ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

export function caveats(r: WeeklyReport): string[] {
  return [
    `Small sample: ${r.callRate.n} graded calls and ${r.episodes.n} graded episodes. One week says very little about skill; the interval above is wide for a reason.`,
    "Hourly 12h calls overlap and BTC, ETH and SOL move together, so per-call counts are not independent. The episode count is the more honest one.",
    "Hit rate counts only HIT and MISS. FLAT moves (under 0.1%), NO CALL hours and calls still pending at the cut-off are listed separately.",
    "A hit is a direction call, not a profit: every simulated trade pays 0.2% in fees.",
    "Not financial advice. Predictions are probabilistic and often wrong.",
  ];
}

export function linkedinCaption(r: WeeklyReport, url: string): string {
  const parts = [
    `HOPIUM weekly printer report, week ${r.key} (${weekRange(r)}, UTC).`,
    r.calls
      ? `The model made ${n(r.calls, "direction call")} on BTC, ETH and SOL and sat out ${n(r.satOut, "coin-hour")}.`
      : `The model made no direction calls and sat out all ${n(r.satOut, "coin-hour")}.`,
    r.calls ? `Graded by the cut-off: ${r.hits} hits, ${r.misses} misses, ${r.flat} flat, ${r.pending} pending.` : "",
    r.episodes.n ? `Grouped into episodes of overlapping calls: ${r.episodes.hits} of ${r.episodes.n} right.` : "",
    r.coverage.pct !== null ? `The printer published ${floorPct(r.coverage.pct)} of scheduled slots.` : "",
    r.rekt ? `Most confident wrong call: ${r.rekt.coin} ${r.rekt.signal}, moved ${signed(r.rekt.move)}.` : "",
    "Tiny sample, overlapping calls, so this says very little about skill.",
    r.witness.submitted ? "Every call is stored before the outcome and the record is timestamped on Bitcoin." : "Every call is stored before the outcome.",
    `Full receipt: ${url}`,
    "Not financial advice.",
  ];
  return parts.filter(Boolean).join(" ");
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function reportMarkdown(r: WeeklyReport, url: string): string {
  const L: string[] = [];
  L.push(`# HOPIUM weekly printer report ${r.key}`, "");
  L.push(`${weekRange(r)} (UTC). Snapshot as of ${hm(r.cutoff)}. Live page: ${url}`, "");
  if (r.partial) L.push("Partial week: HOPIUM launched inside this week, so it covers fewer hours than a full week.", "");
  L.push("| line | value |", "|---|---|");
  const row = (k: string, v: string | number) => L.push(`| ${k} | ${v} |`);
  row("predictions printed", r.rows);
  row("direction calls made", r.calls);
  row("hits / misses / flat", `${r.hits} / ${r.misses} / ${r.flat}`);
  row("pending at cut-off", r.pending);
  row("hit rate per call", r.callRate.n ? `${floorPct(r.callRate.rate)} (${r.hits} of ${r.callRate.n}, 95% Wilson ${floorPct(r.callRate.lo)} to ${ceilPct(r.callRate.hi)})` : "n/a (nothing graded)");
  row("episodes started", `${r.episodes.started} (from ${n(r.episodes.calls, "call")})`);
  row("hit rate per episode", r.episodes.n ? `${floorPct(r.episodes.rate)} (${r.episodes.hits} of ${r.episodes.n}, 95% Wilson ${floorPct(r.episodes.lo)} to ${ceilPct(r.episodes.hi)})` : "n/a (nothing graded)");
  row("sat out (NO CALL)", r.satOut);
  row("coverage", r.coverage.pct === null ? "n/a" : `${floorPct(r.coverage.pct)} (${r.coverage.published} of ${r.coverage.expected} scheduled slots)`);
  row("model version", r.versions.join(", ") || "none");
  row("witness (OpenTimestamps)", `${r.witness.submitted} stamps, ${r.witness.failed} failed attempts`);
  L.push("", "## Outages", "");
  if (!r.outages.length) L.push("None. Every scheduled slot was published.");
  else for (const g of r.outages) L.push(`- ${g.start === g.end ? hm(g.start) : `${hm(g.start)} to ${hm(g.end)}`}: ${n(g.slots, "slot")}, ${g.reason}`);
  L.push("", "## REKT of the week", "");
  L.push(r.rekt
    ? `Receipt #${r.rekt.id}: ${r.rekt.coin} ${r.rekt.signal} at ${hm(r.rekt.close)}, lean ${(r.rekt.lean * 100).toFixed(1)}%, moved ${signed(r.rekt.move)}. The most confident call that went the wrong way.`
    : "No graded misses this week.");
  L.push("", "## Caveats", "");
  for (const c of caveats(r)) L.push(`- ${c}`);
  L.push("", "## LinkedIn caption", "", "```text", linkedinCaption(r, url), "```", "", `Rule: ${REPORT_RULE}`, "");
  return L.join("\n");
}
