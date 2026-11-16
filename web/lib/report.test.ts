import { describe, expect, it } from "vitest";
import { asOf, buildWeeklyReport, isoWeekOf, latestReportableWeek, linkedinCaption, parseWeekKey, reportableWeeks, reportMarkdown, weekKey, wordCount } from "./report";
import type { WitnessReceipt } from "./commit";
import type { Prediction, RunLog } from "./types";

const H = 3600e3;
const iso = (ms: number) => new Date(ms).toISOString();
const W46 = Date.UTC(2026, 10, 9); // Monday 2026-11-09 00:00 UTC
let nextId = 1;
function row(coin: string, t: number, signal: Prediction["signal"], o: Partial<Prediction> = {}): Prediction {
  const score = signal === "UP" ? 0.3 : signal === "DOWN" ? -0.3 : 0.01;
  return { id: nextId++, coin, horizon: "12h", prob_up: 0.3, signal, price_at_call: 100, candle_close_time: iso(t), inserted_at: iso(t + 2 * 60e3),
    target_time: iso(t + 12 * H), model_version: "v3-test", p_big_up: 0.3, p_big_down: 0.1, score, threshold: 0.16, k: 0.01,
    price_at_target: null, move: null, outcome: null, hit: null, graded_at: null, provenance: "live_prospective", ...o } as Prediction;
}
const graded = (outcome: Prediction["outcome"], move: number, t: number) =>
  ({ outcome, move, hit: outcome === "HIT" ? true : outcome === "MISS" ? false : null, price_at_target: 100 * (1 + move), graded_at: iso(t + 12 * H + 3 * 60e3) });

describe("ISO weeks", () => {
  it("keys weeks by ISO week-year", () => {
    expect(weekKey(isoWeekOf(W46))).toBe("2026-46");
    expect(weekKey(isoWeekOf(W46 + 7 * 24 * H - 1))).toBe("2026-46");
    expect(weekKey(isoWeekOf(Date.UTC(2027, 0, 1)))).toBe("2026-53"); // Fri 1 Jan 2027 belongs to 2026's week 53
    expect(weekKey(isoWeekOf(Date.UTC(2024, 11, 30)))).toBe("2025-01");
    expect(parseWeekKey("2026-46")!.start).toBe(W46);
    expect(parseWeekKey("2025-53")).toBeNull(); // 2025 has 52 weeks
    expect(parseWeekKey("2026-4")).toBeNull();
  });
  it("only reports a week after its Monday 03:31 UTC cut-off", () => {
    const mon = Date.UTC(2026, 10, 16);
    expect(latestReportableWeek(mon + 3 * H + 30 * 60e3)).toBe("2026-45");
    expect(latestReportableWeek(mon + 3 * H + 31 * 60e3)).toBe("2026-46");
    expect(reportableWeeks(iso(Date.UTC(2026, 10, 4, 7)), mon + 4 * H)).toEqual(["2026-46", "2026-45"]);
    expect(reportableWeeks(null, mon)).toEqual([]);
  });
});

describe("weekly report", () => {
  nextId = 1;
  const launch = W46 - 2 * 24 * H; // launched the Saturday before
  const rows: Prediction[] = [];
  const runs: RunLog[] = [];
  for (let t = launch; t < W46 + 7 * 24 * H + 6 * H; t += H) {
    if (t === W46 + 30 * H || t === W46 + 31 * H) { runs.push({ id: t, job: "predict", candle_close_time: iso(t), status: "missed", detail: "started 25 min late", logged_at: iso(t + 25 * 60e3) }); continue; }
    for (const c of ["BTC", "ETH", "SOL"]) rows.push(row(c, t, "NO_CALL", t + 12 * H < W46 + 7 * 24 * H ? { outcome: "SAT_OUT", move: 0.001, graded_at: iso(t + 12 * H + 2 * 60e3) } : {}));
  }
  const set = (coin: string, t: number, signal: "UP" | "DOWN", o: Partial<Prediction>) => {
    const i = rows.findIndex((r) => r.coin === coin && r.candle_close_time === iso(t));
    rows[i] = { ...rows[i]!, signal, score: signal === "UP" ? 0.2 : -0.2, outcome: null, hit: null, move: null, graded_at: null, ...o };
  };
  // previous week: an UP episode on BTC that continues into the week (must not count as a new episode)
  set("BTC", W46 - 2 * H, "UP", graded("HIT", 0.02, W46 - 2 * H));
  set("BTC", W46 + 1 * H, "UP", graded("HIT", 0.015, W46 + H));
  // week: ETH UP episode of 2 calls (hit), SOL DOWN miss with high lean, ETH DOWN miss low lean, BTC flat
  set("ETH", W46 + 10 * H, "UP", graded("HIT", 0.02, W46 + 10 * H));
  set("ETH", W46 + 11 * H, "UP", graded("HIT", 0.018, W46 + 11 * H));
  set("SOL", W46 + 50 * H, "DOWN", { ...graded("MISS", 0.03, W46 + 50 * H), score: -0.5 });
  set("ETH", W46 + 80 * H, "DOWN", graded("MISS", 0.01, W46 + 80 * H));
  set("BTC", W46 + 100 * H, "UP", graded("FLAT", 0.0004, W46 + 100 * H));
  // last Sunday evening: graded AFTER the cut-off, so pending in the report
  const late = W46 + 7 * 24 * H - 2 * H;
  set("SOL", late, "UP", graded("MISS", -0.05, late));
  const witness = [{ id: 1, chain_seq: 1, chain_hash: "x", service: "ots", status: "submitted", receipt_path: null, detail: null, logged_at: iso(W46 + 5 * H) },
    { id: 2, chain_seq: 2, chain_hash: "y", service: "ots", status: "failed", receipt_path: null, detail: null, logged_at: iso(W46 + 6 * H) }] as WitnessReceipt[];
  const r = buildWeeklyReport(rows, runs, witness, "2026-46");

  it("counts calls, outcomes and sit-outs of the week only", () => {
    expect(r.calls).toBe(7);
    expect([r.hits, r.misses, r.flat, r.pending]).toEqual([3, 2, 1, 1]);
    expect(r.rows).toBe((7 * 24 - 2) * 3);
    expect(r.satOut).toBe(r.rows - 7);
    expect(r.callRate.n).toBe(5);
    expect(r.callRate.rate).toBeCloseTo(0.6);
    expect(r.partial).toBe(false);
  });
  it("counts episodes by their first call, so last week's episode is not re-counted", () => {
    expect(r.episodes.started).toBe(5); // ETH UP (2 calls), SOL DOWN, ETH DOWN, BTC UP flat, SOL UP pending
    expect(r.episodes.calls).toBe(6);
    expect([r.episodes.hits, r.episodes.misses, r.episodes.flat, r.episodes.pending]).toEqual([1, 2, 1, 1]);
    expect(r.episodes.n).toBe(3);
  });
  it("picks the most confident graded miss, ignoring misses graded after the cut-off", () => {
    expect(r.rekt?.coin).toBe("SOL");
    expect(r.rekt?.signal).toBe("DOWN");
    expect(r.rekt?.lean).toBeCloseTo(0.75);
  });
  it("reports coverage and outages with reasons", () => {
    expect(r.coverage.expected).toBe(7 * 24 * 3);
    expect(r.coverage.published).toBe((7 * 24 - 2) * 3);
    expect(r.outages).toHaveLength(1);
    expect(r.outages[0]).toMatchObject({ start: iso(W46 + 30 * H), end: iso(W46 + 31 * H), slots: 6, state: "late_skipped", reason: "started 25 min late" });
    expect(r.versions).toEqual(["v3-test"]);
    expect(r.witness).toEqual({ submitted: 1, failed: 1 });
  });
  it("is identical however late it is generated (snapshot at the cut-off)", () => {
    const later = rows.map((x) => x.outcome === null && x.signal === "NO_CALL" ? { ...x, outcome: "SAT_OUT" as const, move: 0, graded_at: iso(Date.UTC(2026, 10, 20)) } : x);
    expect(buildWeeklyReport(later, runs, witness, "2026-46")).toEqual(r);
    expect(asOf(rows, Date.parse(r.cutoff)).find((x) => x.candle_close_time === iso(late) && x.coin === "SOL")!.outcome).toBeNull();
  });
  it("marks the launch week as partial", () => {
    expect(buildWeeklyReport(rows, runs, witness, "2026-45").partial).toBe(true);
  });
  it("writes an honest LinkedIn caption: at most 120 words, no em or en dashes, the real numbers", () => {
    const c = linkedinCaption(r, "https://example.test/reports/2026-46");
    expect(wordCount(c)).toBeLessThanOrEqual(120);
    expect(c).not.toMatch(/[—–]/);
    expect(c).toContain("3 hits, 2 misses, 1 flat, 1 pending");
    expect(c).toContain("1 of 3 right");
    expect(c).toContain("timestamped on Bitcoin");
    expect(c).toMatch(/very little about skill/);
    expect(c).not.toMatch(/guarantee|moon|alpha|100x|!/i);
  });
  it("renders markdown with every required line and the caveats", () => {
    const md = reportMarkdown(r, "https://example.test/reports/2026-46");
    for (const s of ["direction calls made | 7", "hits / misses / flat | 3 / 2 / 1", "hit rate per episode | 33.3% (1 of 3", "sat out (NO CALL)",
      "coverage | 98.8% (498 of 504", "started 25 min late", "model version | v3-test", "REKT of the week", "Small sample", "overlap", "LinkedIn caption"]) expect(md).toContain(s);
    expect(md).not.toMatch(/[—]/);
  });
});
