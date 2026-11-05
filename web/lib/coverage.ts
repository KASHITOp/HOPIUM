/**
 * Coverage ledger (WS9). Every expected (coin, hourly slot) since launch gets exactly one explainable state.
 * Expected schedule `sched-v1`: one prediction per coin at every UTC hour close, from the first live prediction's
 * reference close (launch) to the latest closed hour. No planned maintenance has been declared.
 * Coverage is about publication only; it is independent of whether calls were right.
 * Nothing is backfilled: a slot without a row stays missing forever.
 */
import type { Prediction, RunLog } from "./types";

export const SCHEDULE = { version: "sched-v1", coins: ["BTC", "ETH", "SOL"] as const, everyMs: 3600e3, dbLateLimitMin: 20 };
export type SlotState = "graded" | "pending" | "no_call_graded" | "no_call_pending" | "late_skipped" | "failed" | "no_job" | "in_progress";
export const STATE_LABEL: Record<SlotState, string> = {
  graded: "published, graded", pending: "published, outcome pending", no_call_graded: "NO CALL, graded (sat out)",
  no_call_pending: "NO CALL, pending", late_skipped: "skipped: job started too late", failed: "failed",
  no_job: "missing: no job ran (scheduler gap)", in_progress: "in progress (inside the 20 min window)",
};
export const PUBLISHED: SlotState[] = ["graded", "pending", "no_call_graded", "no_call_pending"];

export interface Slot { coin: string; close: string; state: SlotState; reason: string | null; predictionId: number | null; latencyMin: number | null }
export interface Gap { start: string; end: string; slots: number; state: SlotState; reason: string }

export function launch(preds: Prediction[]): string | null {
  return preds.map((p) => p.candle_close_time).sort()[0] ?? null;
}

export function ledger(preds: Prediction[], runs: RunLog[], now = Date.now()): Slot[] {
  const start = launch(preds);
  if (!start) return [];
  const byKey = new Map(preds.map((p) => [`${p.coin}|${Date.parse(p.candle_close_time)}`, p]));
  const runBy = new Map<number, RunLog>();
  for (const r of runs) if (r.job === "predict" && r.candle_close_time) runBy.set(Date.parse(r.candle_close_time), r);
  const out: Slot[] = [];
  const last = Math.floor(now / SCHEDULE.everyMs) * SCHEDULE.everyMs;
  for (let t = Date.parse(start); t <= last; t += SCHEDULE.everyMs) {
    const run = runBy.get(t);
    for (const coin of SCHEDULE.coins) {
      const p = byKey.get(`${coin}|${t}`);
      const close = new Date(t).toISOString();
      if (p) {
        const nc = p.signal === "NO_CALL", done = p.outcome !== null;
        out.push({ coin, close, predictionId: p.id, reason: null, latencyMin: (Date.parse(p.inserted_at) - t) / 60e3,
          state: nc ? (done ? "no_call_graded" : "no_call_pending") : done ? "graded" : "pending" });
      } else if (now - t < SCHEDULE.dbLateLimitMin * 60e3) {
        out.push({ coin, close, predictionId: null, latencyMin: null, state: "in_progress", reason: null });
      } else if (run?.status === "missed") {
        out.push({ coin, close, predictionId: null, latencyMin: null, state: "late_skipped", reason: run.detail ?? "late start" });
      } else if (run) {
        out.push({ coin, close, predictionId: null, latencyMin: null, state: "failed",
          reason: run.status === "error" ? (run.detail ?? "error").slice(0, 160) : `job logged '${run.status}' but no ${coin} row exists` });
      } else {
        out.push({ coin, close, predictionId: null, latencyMin: null, state: "no_job", reason: "no predict job logged for this hour" });
      }
    }
  }
  return out;
}

export function summary(slots: Slot[]) {
  const settled = slots.filter((s) => s.state !== "in_progress");
  const published = settled.filter((s) => PUBLISHED.includes(s.state)).length;
  const counts = Object.fromEntries(Object.keys(STATE_LABEL).map((k) => [k, slots.filter((s) => s.state === k).length])) as Record<SlotState, number>;
  const lats = slots.map((s) => s.latencyMin).filter((x): x is number => x !== null).sort((a, b) => a - b);
  return { expected: settled.length, published, pct: settled.length ? published / settled.length : null, counts,
    latencyMedian: lats.length ? lats[Math.floor(lats.length / 2)]! : null, latencyMax: lats.at(-1) ?? null };
}

/** Consecutive missing hours (all coins in the same non-published state) merged into intervals. */
export function gaps(slots: Slot[]): Gap[] {
  const hours = new Map<string, Slot[]>();
  for (const s of slots) hours.set(s.close, [...(hours.get(s.close) ?? []), s]);
  const out: Gap[] = [];
  for (const [close, ss] of [...hours.entries()].sort()) {
    const miss = ss.filter((s) => !PUBLISHED.includes(s.state) && s.state !== "in_progress");
    if (!miss.length) continue;
    const st = miss[0]!.state, reason = miss[0]!.reason ?? STATE_LABEL[st];
    const prev = out.at(-1);
    if (prev && prev.state === st && Date.parse(close) - Date.parse(prev.end) === SCHEDULE.everyMs && st !== "failed") {
      prev.end = close; prev.slots += miss.length;
    } else out.push({ start: close, end: close, slots: miss.length, state: st, reason });
  }
  return out;
}
